const logger = require('../utils/logger');
const { Advert } = require('../../models');
const fs = require('fs');
const path = require('path');
const { 
  isSwissRegionUrl, 
  extractDealerIdFromChUrl,
  fetchSwissDealerListings,
  fetchAllSwissDealerListings,
  fetchSwissListingById
} = require('./autoscoutChApi');

/**
 * Create debug log file for Swiss checker run
 * @param {string} userId - User ID for the log file name
 * @returns {string} - Path to the created log file
 */
function createDebugLogFile(userId) {
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create timestamped log file name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `swiss-checker-user-${userId}-${timestamp}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Create empty log file
    fs.writeFileSync(logFilePath, '');
    
    logger.info(`[CHECKER] 📝 [DEBUG] Created log file: ${logFilePath}`);
    return logFilePath;
  } catch (error) {
    logger.error(`[CHECKER] ❌ Error creating debug log file: ${error.message}`);
    return null;
  }
}

/**
 * Write debug log entry to file
 * @param {string} logFilePath - Path to the log file
 * @param {string} message - Log message to write
 */
function writeDebugLog(logFilePath, message) {
  if (!logFilePath) return;
  
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFilePath, logEntry);
  } catch (error) {
    logger.error(`[CHECKER] ❌ Error writing to debug log file: ${error.message}`);
  }
}

/**
 * Check Swiss listings availability using individual listing API calls
 * @param {Object} user - User object with autoscout_url
 * @returns {Object} - Results of the availability check
 */
async function checkSwissListingsIndividually(user) {
  let debugLogFilePath = null;
  
  try {
    // Create debug log file if DEBUG mode is enabled
    if (process.env.DEBUG === 'true') {
      debugLogFilePath = createDebugLogFile(user.id);
      writeDebugLog(debugLogFilePath, `🇨🇭 Starting individual Swiss listings check for user ${user.id}: ${user.autoscout_url}`);
    }
    
    logger.info(`[CHECKER] 🇨🇭 Starting individual Swiss listings check for user ${user.id}: ${user.autoscout_url}`);
    
    // Get all adverts for this user from database (both active and inactive)
    const allAdverts = await Advert.findAll({
      where: { 
        seller_id: user.id 
      },
      attributes: ['id', 'autoscout_id', 'make', 'model', 'price', 'created_at', 'is_active']
    });
    
    const activeAdverts = allAdverts.filter(advert => advert.is_active);
    const inactiveAdverts = allAdverts.filter(advert => !advert.is_active);
    
    const dbInfo = `💾 Database has ${allAdverts.length} total adverts for user ${user.id} (${activeAdverts.length} active, ${inactiveAdverts.length} inactive)`;
    logger.info('[CHECKER] ' + dbInfo);
    writeDebugLog(debugLogFilePath, dbInfo);
    
    const activeIds = `💾 Active advert IDs: [${activeAdverts.map(advert => advert.autoscout_id).sort().join(', ')}]`;
    logger.info('[CHECKER] ' + activeIds);
    writeDebugLog(debugLogFilePath, activeIds);
    
    const inactiveIds = `💾 Inactive advert IDs: [${inactiveAdverts.map(advert => advert.autoscout_id).sort().join(', ')}]`;
    logger.info('[CHECKER] ' + inactiveIds);
    writeDebugLog(debugLogFilePath, inactiveIds);
    
    const results = {
      stillAvailable: [],
      noLongerAvailable: [],
      reactivated: [], // Previously inactive adverts that are now available
      newListings: [], // Not applicable for individual checks
      errors: []
    };
    
    const startInfo = `🔍 Starting individual checks for ${allAdverts.length} database adverts (${activeAdverts.length} active + ${inactiveAdverts.length} inactive)`;
    logger.info('[CHECKER] ' + startInfo);
    writeDebugLog(debugLogFilePath, startInfo);
    
    // Check each database advert individually (both active and inactive)
    for (const advert of allAdverts) {
      try {
        const checkMsg = `🔍 Checking advert ${advert.autoscout_id} individually...`;
        logger.info('[CHECKER] ' + checkMsg);
        writeDebugLog(debugLogFilePath, checkMsg);
        
        const listingData = await fetchSwissListingById(advert.autoscout_id, debugLogFilePath);
        
        // Detailed logging for debugging false negatives
        const fetchResult = `🔍 [DEBUG] Advert ${advert.autoscout_id} fetch result: ${listingData ? 'SUCCESS' : 'FAILED'}`;
        logger.info('[CHECKER] ' + fetchResult);
        writeDebugLog(debugLogFilePath, fetchResult);
        
        if (listingData) {
          const dataKeys = `🔍 [DEBUG] Advert ${advert.autoscout_id} data keys: [${Object.keys(listingData).join(', ')}]`;
          logger.info('[CHECKER] ' + dataKeys);
          writeDebugLog(debugLogFilePath, dataKeys);
          
          const title = `🔍 [DEBUG] Advert ${advert.autoscout_id} title: ${listingData.title || 'N/A'}`;
          logger.info('[CHECKER] ' + title);
          writeDebugLog(debugLogFilePath, title);
          
          const price = `🔍 [DEBUG] Advert ${advert.autoscout_id} price: ${listingData.price?.amount || 'N/A'} ${listingData.price?.currency || ''}`;
          logger.info('[CHECKER] ' + price);
          writeDebugLog(debugLogFilePath, price);
          
          const makeModel = `🔍 [DEBUG] Advert ${advert.autoscout_id} make/model: ${listingData.vehicle?.make || listingData.make || 'N/A'} ${listingData.vehicle?.model || listingData.model || 'N/A'}`;
          logger.info('[CHECKER] ' + makeModel);
          writeDebugLog(debugLogFilePath, makeModel);
        } else {
          const url = `🔍 [DEBUG] Advert ${advert.autoscout_id} URL: https://www.autoscout24.ch/de/d/${advert.autoscout_id}`;
          logger.warn('[CHECKER] ' + url);
          writeDebugLog(debugLogFilePath, url);
          
          const manualCheck = `🔍 [DEBUG] Advert ${advert.autoscout_id} - PLEASE MANUALLY CHECK THIS URL TO VERIFY IF IT'S ACTUALLY SOLD`;
          logger.warn('[CHECKER] ' + manualCheck);
          writeDebugLog(debugLogFilePath, manualCheck);
        }

        if (listingData) {
          // Listing exists and is available
          if (advert.is_active) {
            // Already active, just mark as still available
            results.stillAvailable.push({
              autoscout_id: advert.autoscout_id,
              make: advert.make,
              model: advert.model,
              price: advert.price
            });
            const stillAvailable = `✅ [Swiss Individual] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) still available`;
            logger.info('[CHECKER] ' + stillAvailable);
            writeDebugLog(debugLogFilePath, stillAvailable);
          } else {
            // Was inactive but now available - reactivate it!
            await reactivateSwissAdvert(advert);
            results.reactivated.push({
              autoscout_id: advert.autoscout_id,
              make: advert.make,
              model: advert.model,
              price: advert.price
            });
            const reactivated = `🔄 [Swiss Individual] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) reactivated - back online!`;
            logger.info('[CHECKER] ' + reactivated);
            writeDebugLog(debugLogFilePath, reactivated);
          }
        } else {
          // Listing not found (404) or error occurred
          if (advert.is_active) {
            // Was active but now gone - mark as inactive
            const markingInactive = `🚨 [Swiss Individual] MARKING ADVERT AS INACTIVE: ${advert.autoscout_id} (${advert.make} ${advert.model}) - Please verify manually at: https://www.autoscout24.ch/de/d/${advert.autoscout_id}`;
            logger.warn('[CHECKER] ' + markingInactive);
            writeDebugLog(debugLogFilePath, markingInactive);
            
            results.noLongerAvailable.push({
              autoscout_id: advert.autoscout_id,
              make: advert.make,
              model: advert.model,
              price: advert.price
            });
            const noLongerAvailable = `❌ [Swiss Individual] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) no longer available`;
            logger.warn('[CHECKER] ' + noLongerAvailable);
            writeDebugLog(debugLogFilePath, noLongerAvailable);
            
            // Mark as inactive
            await markSwissAdvertAsInactive(advert);
          } else {
            // Was already inactive and still not available - no action needed
            const remainsInactive = `⏸️ [Swiss Individual] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) remains inactive`;
            logger.info('[CHECKER] ' + remainsInactive);
            writeDebugLog(debugLogFilePath, remainsInactive);
          }
        }
        
        // Small delay between individual checks to be respectful
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay to reduce rate limiting
        
      } catch (error) {
        // Special handling for rate limit errors - don't mark as inactive
        if (error.message && error.message.includes('Rate limit error')) {
          const rateLimitError = `⚠️ [Swiss Individual] Rate limit error for advert ${advert.autoscout_id} - skipping to avoid false negative`;
          logger.warn('[CHECKER] ' + rateLimitError);
          writeDebugLog(debugLogFilePath, rateLimitError);
          
          results.errors.push({
            autoscout_id: advert.autoscout_id,
            error: error.message
          });
        } else {
          const generalError = `❌ Error checking Swiss advert ${advert.autoscout_id}: ${error.message}`;
          logger.error('[CHECKER] ' + generalError);
          writeDebugLog(debugLogFilePath, generalError);
          
          results.errors.push({
            autoscout_id: advert.autoscout_id,
            error: error.message
          });
        }
      }
    }
    
    // Log summary
    const summary = `📊 Swiss individual check results for user ${user.id}:`;
    logger.info('[CHECKER] ' + summary);
    writeDebugLog(debugLogFilePath, summary);
    
    const stillAvailableCount = `   ✅ Still available: ${results.stillAvailable.length}`;
    logger.info('[CHECKER] ' + stillAvailableCount);
    writeDebugLog(debugLogFilePath, stillAvailableCount);
    
    const noLongerAvailableCount = `   ❌ No longer available: ${results.noLongerAvailable.length}`;
    logger.info('[CHECKER] ' + noLongerAvailableCount);
    writeDebugLog(debugLogFilePath, noLongerAvailableCount);
    
    const reactivatedCount = `   🔄 Reactivated: ${results.reactivated.length}`;
    logger.info('[CHECKER] ' + reactivatedCount);
    writeDebugLog(debugLogFilePath, reactivatedCount);
    
    const errorsCount = `   ⚠️ Errors: ${results.errors.length}`;
    logger.info('[CHECKER] ' + errorsCount);
    writeDebugLog(debugLogFilePath, errorsCount);
    
    // Write final summary to debug log
    if (debugLogFilePath) {
      writeDebugLog(debugLogFilePath, `\n=== FINAL SUMMARY ===`);
      writeDebugLog(debugLogFilePath, `User ID: ${user.id}`);
      writeDebugLog(debugLogFilePath, `Total Adverts: ${allAdverts.length}`);
      writeDebugLog(debugLogFilePath, `Active Adverts: ${activeAdverts.length}`);
      writeDebugLog(debugLogFilePath, `Inactive Adverts: ${inactiveAdverts.length}`);
      writeDebugLog(debugLogFilePath, `Still Available: ${results.stillAvailable.length}`);
      writeDebugLog(debugLogFilePath, `No Longer Available: ${results.noLongerAvailable.length}`);
      writeDebugLog(debugLogFilePath, `Reactivated: ${results.reactivated.length}`);
      writeDebugLog(debugLogFilePath, `Errors: ${results.errors.length}`);
      writeDebugLog(debugLogFilePath, `=== END OF LOG ===\n`);
    }
    
    return {
      user: user.id,
      status: 'success',
      method: 'individual_checks',
      debugLogFile: debugLogFilePath,
      ...results,
      totalActiveAdverts: activeAdverts.length,
      totalInactiveAdverts: inactiveAdverts.length,
      totalAdverts: allAdverts.length
    };
    
  } catch (error) {
    const errorMsg = `❌ Error checking Swiss listings individually for user ${user.id}: ${error.message}`;
    logger.error('[CHECKER] ' + errorMsg);
    writeDebugLog(debugLogFilePath, errorMsg);
    
    return {
      user: user.id,
      status: 'error',
      method: 'individual_checks',
      debugLogFile: debugLogFilePath,
      error: error.message
    };
  }
}

/**
 * Check Swiss dealer listings availability using CH API (bulk search method)
 * @param {Object} user - User object with autoscout_url
 * @returns {Object} - Results of the availability check
 */
async function checkSwissDealerListings(user) {
  try {
    logger.info(`[CHECKER] 🇨🇭 Starting Swiss listings check for user ${user.id}: ${user.autoscout_url}`);
    
    // Extract dealer ID from Swiss URL
    const dealerId = extractDealerIdFromChUrl(user.autoscout_url);
    if (!dealerId) {
      throw new Error(`Could not extract dealer ID from Swiss URL: ${user.autoscout_url}`);
    }
    
    logger.info(`[CHECKER] 🏢 Swiss dealer ID: ${dealerId}`);
    
    // Fetch current listings from Swiss API
    const currentListings = await fetchAllSwissDealerListings(dealerId);
    logger.info(`[CHECKER] 📊 Swiss API returned ${currentListings.length} current listings for dealer ${dealerId}`);
    console.log(currentListings.map(listing => listing.id));
    logger.info(`[CHECKER] 📊 Seller types from API: [${currentListings.map(listing => `${listing.id}:${listing.seller?.type || 'unknown'}`).join(', ')}]`);


    // Get active adverts for this user from database
    const activeAdverts = await Advert.findAll({
      where: { 
        is_active: true, 
        seller_id: user.id 
      },
      attributes: ['id', 'autoscout_id', 'make', 'model', 'price', 'created_at']
    });
    logger.info(`[CHECKER] 💾 Database has ${activeAdverts.length} active adverts for user ${user.id}`);
    logger.info(`[CHECKER] 💾 Database advert IDs: [${activeAdverts.map(advert => advert.autoscout_id).sort().join(', ')}]`);
    
    // Create a set of current listing IDs for fast lookup (all listings, regardless of seller type)
    const currentListingIds = new Set(currentListings.map(listing => String(listing.id)));
    
    logger.info(`[CHECKER] 🔍 Found ${currentListingIds.size} listings in Swiss API (all types)`);
    logger.info(`[CHECKER] 🔍 All listing IDs from API: [${Array.from(currentListingIds).sort().join(', ')}]`);
    
    // Check which database adverts are still available
    const results = {
      stillAvailable: [],
      noLongerAvailable: [],
      newListings: [],
      errors: []
    };
    
    // Check each database advert against current API listings
    logger.info(`[CHECKER] 🔍 Starting comparison of ${activeAdverts.length} database adverts against ${currentListingIds.size} API listings`);
    
    for (const advert of activeAdverts) {
      try {
        logger.info(`[CHECKER] 🔍 Checking advert ${advert.autoscout_id} (type: ${typeof advert.autoscout_id}) - exists in API: ${currentListingIds.has(advert.autoscout_id)}`);
        if (!currentListingIds.has(advert.autoscout_id)) {
          logger.warn(`[CHECKER] 🔍 Advert ${advert.autoscout_id} NOT FOUND in API. API has: [${Array.from(currentListingIds).slice(0, 5).join(', ')}...]`);
        }
        
        if (currentListingIds.has(advert.autoscout_id)) {
          results.stillAvailable.push({
            autoscout_id: advert.autoscout_id,
            make: advert.make,
            model: advert.model,
            price: advert.price
          });
          logger.info(`[CHECKER] ✅ [Swiss] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) still available`);
        } else {
          results.noLongerAvailable.push({
            autoscout_id: advert.autoscout_id,
            make: advert.make,
            model: advert.model,
            price: advert.price
          });
          logger.warn(`[CHECKER] ❌ [Swiss] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) no longer available`);
          
          // Mark as inactive
          await markSwissAdvertAsInactive(advert);
        }
      } catch (error) {
        logger.error(`[CHECKER] ❌ Error checking Swiss advert ${advert.autoscout_id}:`, error.message);
        results.errors.push({
          autoscout_id: advert.autoscout_id,
          error: error.message
        });
      }
    }
    
    // Identify new listings (in API but not in database)
    const databaseListingIds = new Set(activeAdverts.map(advert => advert.autoscout_id));
    
    for (const listing of currentListings) {
      if (!databaseListingIds.has(String(listing.id))) {
        results.newListings.push({
          id: listing.id,
          make: listing.make?.name || 'Unknown',
          model: listing.model?.name || 'Unknown',
          price: listing.price || 0
        });
        logger.info(`[CHECKER] 🆕 [Swiss] New listing found: ${listing.id} (${listing.make?.name} ${listing.model?.name})`);
      }
    }
    
    // Log summary
    logger.info(`[CHECKER] 📊 Swiss check results for user ${user.id}:`);
    logger.info(`[CHECKER]    ✅ Still available: ${results.stillAvailable.length}`);
    logger.info(`[CHECKER]    ❌ No longer available: ${results.noLongerAvailable.length}`);
    logger.info(`[CHECKER]    🆕 New listings: ${results.newListings.length}`);
    logger.info(`[CHECKER]    ⚠️ Errors: ${results.errors.length}`);
    
    return {
      user: user.id,
      dealerId,
      status: 'success',
      ...results,
      totalCurrentListings: currentListings.length,
      totalActiveAdverts: activeAdverts.length
    };
    
  } catch (error) {
    logger.error(`[CHECKER] ❌ Error checking Swiss listings for user ${user.id}:`, error.message);
    return {
      user: user.id,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Reactivate Swiss advert that was previously inactive
 * @param {Object} advert - Advert object from database
 */
async function reactivateSwissAdvert(advert) {
  try {
    const now = new Date();
    
    // Update advert to active status
    await Advert.update(
      {
        is_active: true,
        last_seen: now,
        sell_time: null 
      },
      {
        where: { id: advert.id }
      }
    );
    
    logger.info(`[CHECKER] ✅ [Swiss] Reactivated advert ${advert.autoscout_id} - back online!`);
    
  } catch (error) {
    logger.error(`[CHECKER] ❌ Error reactivating Swiss advert ${advert.autoscout_id}:`, error.message);
    throw error;
  }
}

/**
 * Mark Swiss advert as inactive
 * @param {Object} advert - Advert object from database
 */
async function markSwissAdvertAsInactive(advert) {
  try {
    const now = new Date();
    
    // Calculate sell time (days between creation and now)
    let daysBetween = 1; // Default minimum sell time
    if (advert.created_at && advert.created_at instanceof Date) {
      const timeDiffMs = now - advert.created_at;
      const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
      daysBetween = timeDiffDays < 1 ? 1 : Math.floor(timeDiffDays);
    } else if (advert.created_at) {
      // Handle case where created_at is a string
      const createdAtDate = new Date(advert.created_at);
      if (!isNaN(createdAtDate.getTime())) {
        const timeDiffMs = now - createdAtDate;
        const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);
        daysBetween = timeDiffDays < 1 ? 1 : Math.floor(timeDiffDays);
      }
    }
    
    // Ensure daysBetween is a valid integer with minimum of 1
    if (isNaN(daysBetween) || !Number.isInteger(daysBetween) || daysBetween < 1) {
      logger.warn(`[CHECKER] ⚠️ [Swiss] Invalid daysBetween calculated for advert ${advert.autoscout_id}, using 1 instead. created_at: ${advert.created_at}`);
      daysBetween = 1;
    }
    
    // Update advert
    await Advert.update(
      {
        is_active: false,
        last_seen: now,
        sell_time: daysBetween
      },
      {
        where: { id: advert.id }
      }
    );
    
    logger.info(`[CHECKER] ✅ [Swiss] Marked advert ${advert.autoscout_id} as inactive (sold after ${daysBetween} days)`);
    
  } catch (error) {
    logger.error(`[CHECKER] ❌ Error marking Swiss advert ${advert.autoscout_id} as inactive:`, error.message);
    throw error;
  }
}

/**
 * Check if user should use Swiss checker
 * @param {Object} user - User object with autoscout_url
 * @returns {boolean} - True if user is from Swiss region
 */
function shouldUseSwissChecker(user) {
  return user.autoscout_url && isSwissRegionUrl(user.autoscout_url);
}

/**
 * Process Swiss checker results and log detailed information
 * @param {Object} result - Result from checkSwissDealerListings
 */
function logSwissCheckerResults(result) {
  if (result.status === 'error') {
    logger.error(`[CHECKER] ❌ Swiss checker failed for user ${result.user}: ${result.error}`);
    if (result.debugLogFile) {
      logger.info(`[CHECKER] 📝 Debug log file created: ${result.debugLogFile}`);
    }
    return;
  }
  
  logger.info(`[CHECKER] 🇨🇭 Swiss checker completed for user ${result.user}:`);
  if (result.dealerId) {
    logger.info(`[CHECKER]    🏢 Dealer ID: ${result.dealerId}`);
    logger.info(`[CHECKER]    📊 Current API listings: ${result.totalCurrentListings}`);
  }
  logger.info(`[CHECKER]    💾 Database adverts: ${result.totalAdverts || result.totalActiveAdverts} total (${result.totalActiveAdverts} active${result.totalInactiveAdverts ? `, ${result.totalInactiveAdverts} inactive` : ''})`);
  
  if (result.debugLogFile) {
    logger.info(`[CHECKER]    📝 Debug log file: ${result.debugLogFile}`);
  }
  
  if (result.stillAvailable.length > 0) {
    logger.info(`[CHECKER]    ✅ Still available (${result.stillAvailable.length}):`);
    result.stillAvailable.forEach(advert => {
      logger.info(`[CHECKER]       - ${advert.autoscout_id}: ${advert.make} ${advert.model} (${advert.price})`);
    });
  }
  
  if (result.noLongerAvailable.length > 0) {
    logger.warn(`[CHECKER]    ❌ No longer available (${result.noLongerAvailable.length}):`);
    result.noLongerAvailable.forEach(advert => {
      logger.warn(`[CHECKER]       - ${advert.autoscout_id}: ${advert.make} ${advert.model} (${advert.price})`);
    });
  }
  
  if (result.reactivated && result.reactivated.length > 0) {
    logger.info(`[CHECKER]    🔄 Reactivated (${result.reactivated.length}):`);
    result.reactivated.forEach(advert => {
      logger.info(`[CHECKER]       - ${advert.autoscout_id}: ${advert.make} ${advert.model} (${advert.price})`);
    });
  }
  
  if (result.newListings && result.newListings.length > 0) {
    logger.info(`[CHECKER]    🆕 New listings found (${result.newListings.length}):`);
    result.newListings.forEach(listing => {
      logger.info(`[CHECKER]       - ${listing.id}: ${listing.make} ${listing.model} (${listing.price})`);
    });
  }
  
  if (result.errors.length > 0) {
    logger.error(`[CHECKER]    ⚠️ Errors (${result.errors.length}):`);
    result.errors.forEach(error => {
      logger.error(`[CHECKER]       - ${error.autoscout_id}: ${error.error}`);
    });
  }
}

module.exports = {
  checkSwissDealerListings: checkSwissListingsIndividually, // Use individual checks by default
  checkSwissDealerListingsBulk: checkSwissDealerListings, // Keep bulk method as fallback
  checkSwissListingsIndividually,
  markSwissAdvertAsInactive,
  reactivateSwissAdvert,
  shouldUseSwissChecker,
  logSwissCheckerResults
};
