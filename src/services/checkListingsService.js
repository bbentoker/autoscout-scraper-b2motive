require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { Advert, SeenInfo, Control } = require('../../models');
const logger = require('../utils/logger');
const { getHttpsAgent } = require('./autoscoutApi');
const { getUsersToScrape } = require('./userService');
const { 
  checkSwissDealerListings, 
  shouldUseSwissChecker, 
  logSwissCheckerResults 
} = require('./checkSwissListingsService');

async function handleAdvertNotFound(autoscoutId) {
  try {
    logger.warn(`🚫 Advert ${autoscoutId} not available, marking ALL with same autoscout_id as inactive...`);

    const adverts = await Advert.findAll({ where: { autoscout_id: autoscoutId } });
    if (!adverts || adverts.length === 0) {
      logger.error(`❌ No adverts found in database for autoscout_id ${autoscoutId}`);
      return;
    }

    const latestSeenInfo = await SeenInfo.findOne({
      where: { advert_id: autoscoutId },
      order: [['id', 'DESC']],
      include: [{ model: Control, as: 'control' }]
    });

    const lastSeenDate = latestSeenInfo && latestSeenInfo.control ? latestSeenInfo.control.date : new Date();
    if (latestSeenInfo && latestSeenInfo.control) {
      logger.info(`📅 Setting last_seen to control date: ${lastSeenDate}`);
    } else {
      logger.info(`📅 Setting last_seen to current date: ${lastSeenDate}`);
    }

    for (const advert of adverts) {
      try {
        advert.last_seen = lastSeenDate;
        advert.is_active = false;
        const timeDiffMs = advert.last_seen - advert.created_at;
        const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
        const daysBetween = timeDiffDays < 1 ? 0 : Math.floor(timeDiffDays);
        advert.sell_time = daysBetween;
        await advert.save();
        logger.info(`✅ Advert id=${advert.id} (autoscout_id=${autoscoutId}) marked as inactive`);
      } catch (rowErr) {
        logger.error(`❌ Failed to mark advert id=${advert.id} inactive:`, rowErr.message);
      }
    }
  } catch (error) {
    logger.error(`❌ Error handling not-available adverts for autoscout_id ${autoscoutId}:`, error.message);
    // Fallback: best-effort bulk deactivate without dates/sell_time calc
    try {
      await Advert.update({ is_active: false }, { where: { autoscout_id: autoscoutId } });
      logger.info(`✅ Fallback: All adverts with autoscout_id=${autoscoutId} marked inactive`);
    } catch (fallbackError) {
      logger.error(`❌ Fallback error bulk-updating autoscout_id ${autoscoutId}:`, fallbackError.message);
    }
  }
}

async function checkAdvertAvailability(autoscoutId) {
  const baseUrl = process.env.AUTOSCOUT_URL || 'https://www.autoscout24.com';
  const advertUrl = `${baseUrl}/offers/${autoscoutId}`;
  const response = await axios.get(advertUrl, {
    httpsAgent: getHttpsAgent(),
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept-language': 'fr-BE,fr;q=0.9,en;q=0.8',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    validateStatus: () => true
  });

  const html = response.data || '';
  const $ = cheerio.load(html);

  // Stricter presence checks to avoid false positives on placeholder/error pages
  const hasMake = $('.StageTitle_makeModelContainer__RyjBP').length > 0;
  const hasModel = $('.StageTitle_modelVersion__Yof2Z').length > 0;
  const hasTitleMakeModel = hasMake && hasModel;
  const hasPrice = $('.PriceInfo_price__XU0aF').length > 0 || $('[data-testid="price-section"]').length > 0;
  const hasActionBtn = $('#lead-form-lightbox-desktop-button').length > 0 || $('#call-desktop-button').length > 0;
  const hasStageContainer = $('.StageArea_informationContainer__VRqU6').length > 0;

  const isValidListing = (hasTitleMakeModel && hasPrice) || (hasStageContainer && (hasTitleMakeModel || hasPrice)) || (hasActionBtn && hasTitleMakeModel);
  return isValidListing;
}

async function processAdvertsInParallel(adverts, concurrencyLimit = process.env.ADVERT_PROCESSING_CONCURRENCY_CHECKER || 1) {
  const results = [];
  const chunkSize = Math.min(concurrencyLimit, 10);

  for (let i = 0; i < adverts.length; i += chunkSize) {
    const batch = adverts.slice(i, i + chunkSize);
    logger.info(`🔄 Processing batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(adverts.length / chunkSize)} (${batch.length} adverts)`);

    const batchPromises = batch.map(async (advert) => {
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logger.info(`🔎 Checking availability for advert: ${advert.autoscout_id} (attempt ${attempt}/3)`);
          const isAvailable = await checkAdvertAvailability(advert.autoscout_id);
          if (!isAvailable) throw new Error('Listing elements not found on page');
          logger.info(`✅ Listing appears available for advert: ${advert.autoscout_id} on attempt ${attempt}`);
          return { autoscout_id: advert.autoscout_id, status: 'success', attempts: attempt };
        } catch (error) {
          lastError = error;
          logger.warn(`⚠️ Attempt ${attempt}/3 failed for advert ${advert.autoscout_id}:`, error.message);
          if (attempt === 3) {
            logger.error(`❌ All 3 attempts failed for advert ${advert.autoscout_id}:`, error.message);
            await handleAdvertNotFound(advert.autoscout_id);
            return { autoscout_id: advert.autoscout_id, status: 'inactive', message: 'Advert marked as inactive after 3 failed checks', attempts: 3 };
          }
          logger.info(`⏳ Waiting 1 second before retry for advert ${advert.autoscout_id}...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({ autoscout_id: 'unknown', status: 'rejected', error: result.reason?.message || 'Unknown error' });
      }
    }

    if (i + chunkSize < adverts.length) {
      logger.info('⏳ Waiting 2 seconds before next batch...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}

async function checkListings() {
  logger.info('📋 Starting check listings job...');
  try {
    const activeAdverts = await Advert.findAll({
      where: { is_active: true },
      attributes: ['autoscout_id', 'seller_id']
    });

    logger.info(`📊 Found ${activeAdverts.length} active adverts to check`);
    if (activeAdverts.length === 0) {
      logger.info('ℹ️ No active adverts found to check');
      return;
    }

    const results = await processAdvertsInParallel(activeAdverts);

    const successful = results.filter((r) => r.status === 'success').length;
    const inactive = results.filter((r) => r.status === 'inactive').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    logger.info(`📊 Processing complete: ${successful} successful, ${inactive} marked inactive, ${failed} failed, ${rejected} rejected`);
    logger.info('✅ Check listings job completed successfully');
  } catch (error) {
    logger.error('❌ Check listings job failed:', error.message);
    throw error;
  }
}

async function checkListingsForUser(user) {
  try {
    // Check if this is a Swiss region user
    if (shouldUseSwissChecker(user)) {
      logger.info(`🇨🇭 User ${user.id} detected as Swiss region - using Swiss checker`);
      
      const swissResult = await checkSwissDealerListings(user);
      logSwissCheckerResults(swissResult);
      
      if (swissResult.status === 'error') {
        return { user: user.id, status: 'error', error: swissResult.error };
      }
      
      // Convert Swiss results to standard format for compatibility
      return {
        user: user.id,
        status: 'success',
        successful: swissResult.stillAvailable.length,
        inactive: swissResult.noLongerAvailable.length,
        failed: swissResult.errors.length,
        rejected: 0,
        newListings: swissResult.newListings.length,
        region: 'swiss'
      };
    }
    
    // Belgian/standard region processing
    logger.info(`🇧🇪 User ${user.id} using Belgian region checker`);
    
    const activeAdverts = await Advert.findAll({
      where: { is_active: true, seller_id: user.id },
      attributes: ['autoscout_id', 'seller_id']
    });

    logger.info(`👤 User ${user.id}: ${activeAdverts.length} active adverts to check`);

    if (activeAdverts.length === 0) {
      return { user: user.id, status: 'success', successful: 0, inactive: 0, failed: 0, rejected: 0, region: 'belgian' };
    }

    const results = await processAdvertsInParallel(activeAdverts);
    const successful = results.filter((r) => r.status === 'success').length;
    const inactive = results.filter((r) => r.status === 'inactive').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    
    return { 
      user: user.id, 
      status: 'success', 
      successful, 
      inactive, 
      failed, 
      rejected, 
      region: 'belgian' 
    };
  } catch (error) {
    logger.error(`❌ User ${user.id}: checkListingsForUser failed:`, error.message);
    return { user: user.id, status: 'error', error: error.message };
  }
}

async function processUsersInParallelForChecker(users, concurrencyLimitEnv) {
  const limit = Math.max(1, parseInt(concurrencyLimitEnv || process.env.USER_PROCESSING_CONCURRENCY_CHECKER || '2', 10));
  const results = [];
  const chunkSize = Math.min(limit, 10);

  for (let i = 0; i < users.length; i += chunkSize) {
    const batch = users.slice(i, i + chunkSize);
    logger.info(`🧵 Checking users batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(users.length / chunkSize)} (${batch.length} users)`);
    const batchPromises = batch.map((user) => checkListingsForUser(user));
    const batchResults = await Promise.allSettled(batchPromises);
    for (const result of batchResults) {
      if (result.status === 'fulfilled') results.push(result.value);
      else results.push({ user: 'unknown', status: 'rejected', error: result.reason?.message || 'Unknown error' });
    }
    if (i + chunkSize < users.length) {
      logger.info('⏳ Waiting 1 second before next users batch...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

async function checkListingsAcrossUsers() {
  logger.info('📋 Starting check listings across users...');
  let users = await getUsersToScrape();
  logger.info(`👥 Found ${users.length} users to check`);

  // DEBUG MODE: Filter users with Swiss AutoScout24.ch URLs if DEBUG=true
  if (process.env.DEBUG === 'true') {
    const originalCount = users.length;
    users = users.filter(user => user.autoscout_url && user.autoscout_url.includes('autoscout24.ch'));
    logger.info(`🐛 DEBUG MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
    logger.info(`🎯 Debug filter: Swiss AutoScout24.ch URLs only`);
    logger.info(`📋 Filtered users: [${users.map(u => `${u.id} (${u.autoscout_url})`).join(', ')}]`);
  }
    
  if (!Array.isArray(users) || users.length === 0) {
    logger.info('ℹ️ No users to process for checking');
    return [];
  }

  const results = await processUsersInParallelForChecker(users);
  
  // Enhanced logging for multi-region support
  const successfulUsers = results.filter((r) => r.status === 'success').length;
  const failedUsers = results.filter((r) => r.status === 'error' || r.status === 'rejected').length;
  const swissUsers = results.filter((r) => r.region === 'swiss').length;
  const belgianUsers = results.filter((r) => r.region === 'belgian').length;
  
  logger.info(`📊 Users processed: ${successfulUsers} successful, ${failedUsers} failed/rejected`);
  logger.info(`🌍 Region breakdown: ${swissUsers} Swiss 🇨🇭, ${belgianUsers} Belgian 🇧🇪`);
  
  // Log totals for successful operations
  const totalStillAvailable = results.filter(r => r.status === 'success').reduce((sum, r) => sum + (r.successful || 0), 0);
  const totalInactive = results.filter(r => r.status === 'success').reduce((sum, r) => sum + (r.inactive || 0), 0);
  const totalNewListings = results.filter(r => r.status === 'success').reduce((sum, r) => sum + (r.newListings || 0), 0);
  
  logger.info(`📈 Overall results: ${totalStillAvailable} still available, ${totalInactive} marked inactive, ${totalNewListings} new listings found`);
  
  return results;
}

module.exports = {
  checkListings,
  processAdvertsInParallel,
  checkListingsForUser,
  processUsersInParallelForChecker,
  checkListingsAcrossUsers,
}; 