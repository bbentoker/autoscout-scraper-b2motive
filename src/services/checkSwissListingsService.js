const logger = require('../utils/logger');
const { Advert } = require('../../models');
const { 
  isSwissRegionUrl, 
  extractDealerIdFromChUrl,
  fetchSwissDealerListings,
  fetchAllSwissDealerListings,
  fetchSwissListingById
} = require('./autoscoutChApi');

/**
 * Check Swiss listings availability using individual listing API calls
 * @param {Object} user - User object with autoscout_url
 * @returns {Object} - Results of the availability check
 */
async function checkSwissListingsIndividually(user) {
  try {
    logger.info(`🇨🇭 Starting individual Swiss listings check for user ${user.id}: ${user.autoscout_url}`);
    
    // Get active adverts for this user from database
    const activeAdverts = await Advert.findAll({
      where: { 
        is_active: true, 
        seller_id: user.id 
      },
      attributes: ['id', 'autoscout_id', 'make', 'model', 'price', 'created_at']
    });
    
    logger.info(`💾 Database has ${activeAdverts.length} active adverts for user ${user.id}`);
    logger.info(`💾 Database advert IDs: [${activeAdverts.map(advert => advert.autoscout_id).sort().join(', ')}]`);
    
    const results = {
      stillAvailable: [],
      noLongerAvailable: [],
      newListings: [], // Not applicable for individual checks
      errors: []
    };
    
    logger.info(`🔍 Starting individual checks for ${activeAdverts.length} database adverts`);
    
    // Check each database advert individually
    for (const advert of activeAdverts) {
      try {
        logger.info(`🔍 Checking advert ${advert.autoscout_id} individually...`);
        
        const listingData = await fetchSwissListingById(advert.autoscout_id);
        if (listingData) {
          // Listing exists and is active
          results.stillAvailable.push({
            autoscout_id: advert.autoscout_id,
            make: advert.make,
            model: advert.model,
            price: advert.price
          });
          logger.info(`✅ [Swiss Individual] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) still available`);
        } else {
          // Listing not found (404) or error occurred
          results.noLongerAvailable.push({
            autoscout_id: advert.autoscout_id,
            make: advert.make,
            model: advert.model,
            price: advert.price
          });
          logger.warn(`❌ [Swiss Individual] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) no longer available`);
          
          // Mark as inactive
          await markSwissAdvertAsInactive(advert);
        }
        
        // Small delay between individual checks to be respectful
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        logger.error(`❌ Error checking Swiss advert ${advert.autoscout_id}:`, error.message);
        results.errors.push({
          autoscout_id: advert.autoscout_id,
          error: error.message
        });
      }
    }
    
    // Log summary
    logger.info(`📊 Swiss individual check results for user ${user.id}:`);
    logger.info(`   ✅ Still available: ${results.stillAvailable.length}`);
    logger.info(`   ❌ No longer available: ${results.noLongerAvailable.length}`);
    logger.info(`   ⚠️ Errors: ${results.errors.length}`);
    
    return {
      user: user.id,
      status: 'success',
      method: 'individual_checks',
      ...results,
      totalActiveAdverts: activeAdverts.length
    };
    
  } catch (error) {
    logger.error(`❌ Error checking Swiss listings individually for user ${user.id}:`, error.message);
    return {
      user: user.id,
      status: 'error',
      method: 'individual_checks',
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
    logger.info(`🇨🇭 Starting Swiss listings check for user ${user.id}: ${user.autoscout_url}`);
    
    // Extract dealer ID from Swiss URL
    const dealerId = extractDealerIdFromChUrl(user.autoscout_url);
    if (!dealerId) {
      throw new Error(`Could not extract dealer ID from Swiss URL: ${user.autoscout_url}`);
    }
    
    logger.info(`🏢 Swiss dealer ID: ${dealerId}`);
    
    // Fetch current listings from Swiss API
    const currentListings = await fetchAllSwissDealerListings(dealerId);
    logger.info(`📊 Swiss API returned ${currentListings.length} current listings for dealer ${dealerId}`);
    console.log(currentListings.map(listing => listing.id));
    logger.info(`📊 Seller types from API: [${currentListings.map(listing => `${listing.id}:${listing.seller?.type || 'unknown'}`).join(', ')}]`);


    // Get active adverts for this user from database
    const activeAdverts = await Advert.findAll({
      where: { 
        is_active: true, 
        seller_id: user.id 
      },
      attributes: ['id', 'autoscout_id', 'make', 'model', 'price', 'created_at']
    });
    logger.info(`💾 Database has ${activeAdverts.length} active adverts for user ${user.id}`);
    logger.info(`💾 Database advert IDs: [${activeAdverts.map(advert => advert.autoscout_id).sort().join(', ')}]`);
    
    // Create a set of current listing IDs for fast lookup (all listings, regardless of seller type)
    const currentListingIds = new Set(currentListings.map(listing => String(listing.id)));
    
    logger.info(`🔍 Found ${currentListingIds.size} listings in Swiss API (all types)`);
    logger.info(`🔍 All listing IDs from API: [${Array.from(currentListingIds).sort().join(', ')}]`);
    
    // Check which database adverts are still available
    const results = {
      stillAvailable: [],
      noLongerAvailable: [],
      newListings: [],
      errors: []
    };
    
    // Check each database advert against current API listings
    logger.info(`🔍 Starting comparison of ${activeAdverts.length} database adverts against ${currentListingIds.size} API listings`);
    
    for (const advert of activeAdverts) {
      try {
        logger.info(`🔍 Checking advert ${advert.autoscout_id} (type: ${typeof advert.autoscout_id}) - exists in API: ${currentListingIds.has(advert.autoscout_id)}`);
        if (!currentListingIds.has(advert.autoscout_id)) {
          logger.warn(`🔍 Advert ${advert.autoscout_id} NOT FOUND in API. API has: [${Array.from(currentListingIds).slice(0, 5).join(', ')}...]`);
        }
        
        if (currentListingIds.has(advert.autoscout_id)) {
          results.stillAvailable.push({
            autoscout_id: advert.autoscout_id,
            make: advert.make,
            model: advert.model,
            price: advert.price
          });
          logger.info(`✅ [Swiss] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) still available`);
        } else {
          results.noLongerAvailable.push({
            autoscout_id: advert.autoscout_id,
            make: advert.make,
            model: advert.model,
            price: advert.price
          });
          logger.warn(`❌ [Swiss] Advert ${advert.autoscout_id} (${advert.make} ${advert.model}) no longer available`);
          
          // Mark as inactive
          await markSwissAdvertAsInactive(advert);
        }
      } catch (error) {
        logger.error(`❌ Error checking Swiss advert ${advert.autoscout_id}:`, error.message);
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
        logger.info(`🆕 [Swiss] New listing found: ${listing.id} (${listing.make?.name} ${listing.model?.name})`);
      }
    }
    
    // Log summary
    logger.info(`📊 Swiss check results for user ${user.id}:`);
    logger.info(`   ✅ Still available: ${results.stillAvailable.length}`);
    logger.info(`   ❌ No longer available: ${results.noLongerAvailable.length}`);
    logger.info(`   🆕 New listings: ${results.newListings.length}`);
    logger.info(`   ⚠️ Errors: ${results.errors.length}`);
    
    return {
      user: user.id,
      dealerId,
      status: 'success',
      ...results,
      totalCurrentListings: currentListings.length,
      totalActiveAdverts: activeAdverts.length
    };
    
  } catch (error) {
    logger.error(`❌ Error checking Swiss listings for user ${user.id}:`, error.message);
    return {
      user: user.id,
      status: 'error',
      error: error.message
    };
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
      logger.warn(`⚠️ [Swiss] Invalid daysBetween calculated for advert ${advert.autoscout_id}, using 1 instead. created_at: ${advert.created_at}`);
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
    
    logger.info(`✅ [Swiss] Marked advert ${advert.autoscout_id} as inactive (sold after ${daysBetween} days)`);
    
  } catch (error) {
    logger.error(`❌ Error marking Swiss advert ${advert.autoscout_id} as inactive:`, error.message);
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
    logger.error(`❌ Swiss checker failed for user ${result.user}: ${result.error}`);
    return;
  }
  
  logger.info(`🇨🇭 Swiss checker completed for user ${result.user}:`);
  logger.info(`   🏢 Dealer ID: ${result.dealerId}`);
  logger.info(`   📊 Current API listings: ${result.totalCurrentListings}`);
  logger.info(`   💾 Database active adverts: ${result.totalActiveAdverts}`);
  
  if (result.stillAvailable.length > 0) {
    logger.info(`   ✅ Still available (${result.stillAvailable.length}):`);
    result.stillAvailable.forEach(advert => {
      logger.info(`      - ${advert.autoscout_id}: ${advert.make} ${advert.model} (${advert.price})`);
    });
  }
  
  if (result.noLongerAvailable.length > 0) {
    logger.warn(`   ❌ No longer available (${result.noLongerAvailable.length}):`);
    result.noLongerAvailable.forEach(advert => {
      logger.warn(`      - ${advert.autoscout_id}: ${advert.make} ${advert.model} (${advert.price})`);
    });
  }
  
  if (result.newListings.length > 0) {
    logger.info(`   🆕 New listings found (${result.newListings.length}):`);
    result.newListings.forEach(listing => {
      logger.info(`      - ${listing.id}: ${listing.make} ${listing.model} (${listing.price})`);
    });
  }
  
  if (result.errors.length > 0) {
    logger.error(`   ⚠️ Errors (${result.errors.length}):`);
    result.errors.forEach(error => {
      logger.error(`      - ${error.autoscout_id}: ${error.error}`);
    });
  }
}

module.exports = {
  checkSwissDealerListings: checkSwissListingsIndividually, // Use individual checks by default
  checkSwissDealerListingsBulk: checkSwissDealerListings, // Keep bulk method as fallback
  checkSwissListingsIndividually,
  markSwissAdvertAsInactive,
  shouldUseSwissChecker,
  logSwissCheckerResults
};
