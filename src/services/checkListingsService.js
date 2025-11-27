require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { Advert, Control } = require('../../models');
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
    logger.warn(`[CHECKER] 🚫 Advert ${autoscoutId} not available, marking ALL with same autoscout_id as inactive...`);

    const adverts = await Advert.findAll({ where: { autoscout_id: autoscoutId } });
    if (!adverts || adverts.length === 0) {
      logger.error(`[CHECKER] ❌ No adverts found in database for autoscout_id ${autoscoutId}`);
      return;
    }

    const lastSeenDate = new Date();
    logger.info(`[CHECKER] 📅 Setting last_seen to current date: ${lastSeenDate}`);

    for (const advert of adverts) {
      try {
        advert.last_seen = lastSeenDate;
        advert.is_active = false;
        const timeDiffMs = advert.last_seen - advert.created_at;
        const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
        const daysBetween = timeDiffDays < 1 ? 0 : Math.floor(timeDiffDays);
        advert.sell_time = daysBetween;
        await advert.save();
        logger.info(`[CHECKER] ✅ Advert id=${advert.id} (autoscout_id=${autoscoutId}) marked as inactive`);
      } catch (rowErr) {
        logger.error(`[CHECKER] ❌ Failed to mark advert id=${advert.id} inactive:`, rowErr.message);
      }
    }
  } catch (error) {
    logger.error(`[CHECKER] ❌ Error handling not-available adverts for autoscout_id ${autoscoutId}:`, error.message);
    // Fallback: best-effort bulk deactivate without dates/sell_time calc
    try {
      await Advert.update({ is_active: false }, { where: { autoscout_id: autoscoutId } });
      logger.info(`[CHECKER] ✅ Fallback: All adverts with autoscout_id=${autoscoutId} marked inactive`);
    } catch (fallbackError) {
      logger.error(`[CHECKER] ❌ Fallback error bulk-updating autoscout_id ${autoscoutId}:`, fallbackError.message);
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

async function processAdvertsSequentially(adverts) {
  let successCount = 0;
  let inactiveCount = 0;
  let errorCount = 0;

  // UUID validation regex pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  logger.info(`[CHECKER] 🔄 Processing ${adverts.length} adverts sequentially`);

  for (let i = 0; i < adverts.length; i++) {
    const advert = adverts[i];
    logger.info(`[CHECKER] 📋 Processing advert ${i + 1}/${adverts.length}: ${advert.autoscout_id}`);

    // Validate UUID format before processing
    if (!advert.autoscout_id || !uuidRegex.test(advert.autoscout_id)) {
      logger.error(`[CHECKER] ❌ Invalid UUID format for advert autoscout_id: ${advert.autoscout_id} - skipping processing`);
      errorCount++;
      continue;
    }

    let lastError = null;
    let processed = false;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        logger.info(`[CHECKER] 🔎 Checking availability for advert: ${advert.autoscout_id} (attempt ${attempt}/3)`);
        const isAvailable = await checkAdvertAvailability(advert.autoscout_id);
        if (!isAvailable) throw new Error('Listing elements not found on page');
        logger.info(`[CHECKER] ✅ Listing appears available for advert: ${advert.autoscout_id} on attempt ${attempt}`);
        successCount++;
        processed = true;
        break;
      } catch (error) {
        lastError = error;
        logger.warn(`[CHECKER] ⚠️ Attempt ${attempt}/3 failed for advert ${advert.autoscout_id}:`, error.message);
        if (attempt === 3) {
          logger.error(`[CHECKER] ❌ All 3 attempts failed for advert ${advert.autoscout_id}:`, error.message);
          await handleAdvertNotFound(advert.autoscout_id);
          inactiveCount++;
          processed = true;
        } else {
          logger.info(`[CHECKER] ⏳ Waiting 1 second before retry for advert ${advert.autoscout_id}...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
    
    if (!processed) {
      errorCount++;
    }

    // Aggressive memory cleanup every 5 adverts
    if ((i + 1) % 5 === 0 && global.gc) {
      global.gc();
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      logger.info(`[CHECKER] 🧹 GC after ${i + 1} adverts: ${heapUsedMB}MB/${heapTotalMB}MB`);
    }

    // Small delay between adverts for memory cleanup and server respect
    if (i < adverts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    successful: successCount,
    inactive: inactiveCount,
    error: errorCount,
    total: adverts.length
  };
}

async function checkListings() {
  logger.info('[CHECKER] 📋 Starting check listings job...');
  try {
    const activeAdverts = await Advert.findAll({
      where: { is_active: true },
      attributes: ['autoscout_id', 'seller_id']
    });

    logger.info(`[CHECKER] 📊 Found ${activeAdverts.length} active adverts to check`);
    if (activeAdverts.length === 0) {
      logger.info('[CHECKER] ℹ️ No active adverts found to check');
      return;
    }

    const results = await processAdvertsSequentially(activeAdverts);

    logger.info(`[CHECKER] 📊 Processing complete: ${results.successful} successful, ${results.inactive} marked inactive, ${results.error} failed`);
    logger.info('[CHECKER] ✅ Check listings job completed successfully');
  } catch (error) {
    logger.error('[CHECKER] ❌ Check listings job failed:', error.message);
    throw error;
  }
}

async function checkListingsForUser(user) {
  try {
    
    // Check if this is a Swiss region user
    if (shouldUseSwissChecker(user)) {
      logger.info(`[CHECKER] 🇨🇭 User ${user.id} detected as Swiss region - using Swiss checker`);
      
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
    logger.info(`[CHECKER] 🇧🇪 User ${user.id} using Belgian region checker`);
    
    const activeAdverts = await Advert.findAll({
      where: { is_active: true, seller_id: user.id },
      attributes: ['autoscout_id', 'seller_id']
    });

    logger.info(`[CHECKER] 👤 User ${user.id}: ${activeAdverts.length} active adverts to check`);

    if (activeAdverts.length === 0) {
      return { user: user.id, status: 'success', successful: 0, inactive: 0, failed: 0, rejected: 0, region: 'belgian' };
    }

    const results = await processAdvertsSequentially(activeAdverts);
    
    return { 
      user: user.id, 
      status: 'success', 
      successful: results.successful, 
      inactive: results.inactive, 
      failed: results.error, 
      rejected: 0, 
      region: 'belgian' 
    };
  } catch (error) {
    logger.error(`[CHECKER] ❌ User ${user.id}: checkListingsForUser failed:`, error.message);
    return { user: user.id, status: 'error', error: error.message };
  }
}

async function processUsersSequentiallyForChecker(users) {
  let successCount = 0;
  let errorCount = 0;

  logger.info(`[CHECKER] 🔄 Processing ${users.length} users sequentially for checker`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    logger.info(`[CHECKER] 📋 Processing user ${i + 1}/${users.length}: ${user.id} (${user.company_name || 'Unknown'})`);

    try {
      const result = await checkListingsForUser(user);
      
      if (result.status === 'success') {
        successCount++;
        logger.info(`[CHECKER] ✅ User ${user.id} completed: ${result.successful} successful, ${result.inactive} inactive, ${result.failed} failed`);
      } else {
        errorCount++;
        logger.error(`[CHECKER] ❌ User ${user.id} failed: ${result.error}`);
      }
    } catch (error) {
      errorCount++;
      logger.error(`[CHECKER] ❌ User ${user.id} processing error:`, error.message);
    }

    // Aggressive memory cleanup every 3 users
    if ((i + 1) % 3 === 0 && global.gc) {
      global.gc();
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      logger.info(`[CHECKER] 🧹 GC after ${i + 1} users: ${heapUsedMB}MB/${heapTotalMB}MB`);
    }

    // Small delay between users for memory cleanup and server respect
    if (i < users.length - 1) {
      logger.info('[CHECKER] ⏳ Waiting 2 seconds before next user...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return {
    successful: successCount,
    failed: errorCount,
    total: users.length
  };
}

async function checkListingsAcrossUsers() {
  logger.info('[CHECKER] 📋 Starting check listings across users...');
  
  // LOCALHOST MODE: Filter users by IDs when NODE_ENV=development and LOCALHOST_USERS=true
  let users = await getUsersToScrape('CHECKER');
  
  if (process.env.NODE_ENV === 'development' && process.env.LOCALHOST_USERS === 'true') {
    // Define localhost user IDs - modify these IDs as needed for testing
    const localhostUserIds = [
      1049, 1161, 1612, 1614, 1620, 1645, 1648, 1661, 1665, 1683,
      1696, 1708, 1732, 1779, 1781, 1787, 1792, 1805, 1826, 1827,
      1942, 1943, 1944, 1967, 1974, 1978, 2000, 2006, 2010
    ];
    
    const originalCount = users.length;
    users = users.filter(user => localhostUserIds.includes(user.id));
    
    logger.info(`[CHECKER] 🏠 LOCALHOST MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
    logger.info(`[CHECKER] 📋 Localhost user IDs: [${localhostUserIds.join(', ')}]`);
    logger.info(`[CHECKER] 👥 Filtered users: [${users.map(u => `${u.id} (${u.company_name || 'Unknown'})`).join(', ')}]`);
  }

  // Sort users by created_at (latest first)
  users.sort((a, b) => {
    // If both have created_at, sort by most recent first
    if (a.created_at && b.created_at) {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    // If one has created_at and the other doesn't, prioritize the one with created_at
    if (a.created_at && !b.created_at) return -1;
    if (!a.created_at && b.created_at) return 1;
    
    // If neither has created_at, sort by id (highest first, assuming newer users have higher IDs)
    return b.id - a.id;
  });

  logger.info(`[CHECKER] 📋 Sorted ${users.length} users by created_at (latest first)`);

  // DEBUG MODE: Filter users with Swiss AutoScout24.ch URLs if DEBUG=true
  if (process.env.DEBUG === 'true') {
    const originalCount = users.length;
    users = users.filter(user => user.autoscout_url && user.autoscout_url.includes('autoscout24.ch'));
    logger.info(`[CHECKER] 🐛 DEBUG MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
    logger.info(`[CHECKER] 🎯 Debug filter: Swiss AutoScout24.ch URLs only`);
    logger.info(`[CHECKER] 📋 Filtered users: [${users.map(u => `${u.id} (${u.autoscout_url})`).join(', ')}]`);
  }
    
  if (!Array.isArray(users) || users.length === 0) {
    logger.info('[CHECKER] ℹ️ No users to process for checking');
    return [];
  }

  const results = await processUsersSequentiallyForChecker(users);
  
  logger.info(`[CHECKER] 📊 Check listings across users complete: ${results.successful} successful, ${results.failed} failed out of ${results.total} users`);
  
  return results;
}

module.exports = {
  checkListings,
  processAdvertsSequentially,
  checkListingsForUser,
  processUsersSequentiallyForChecker,
  checkListingsAcrossUsers,
}; 