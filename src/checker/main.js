require('dotenv').config();
const axios = require('axios');
const { Advert, SeenInfo, Control } = require('../../models');
const { getListingInfos } = require('../services/extractNewAdvert');
const logger = require('../utils/logger');

/**
 * Handle 404 error for an advert by marking it as inactive and setting last_seen
 * @param {string} autoscoutId - The AutoScout ID of the advert
 */
async function handleAdvertNotFound(autoscoutId) {
    try {
        logger.warn(`🚫 Advert ${autoscoutId} not found (404), marking as inactive...`);
        
        // Find the advert
        const advert = await Advert.findOne({
            where: { autoscout_id: autoscoutId }
        });
        
        if (!advert) {
            logger.error(`❌ Advert ${autoscoutId} not found in database`);
            return;
        }
        
        // Find the latest seen info for this advert
        const latestSeenInfo = await SeenInfo.findOne({
            where: { advert_id: autoscoutId },
            order: [['id', 'DESC']], // Use id instead of created_at since timestamps are false
            include: [{
                model: Control,
                as: 'control'
            }]
        });
        
        if (latestSeenInfo && latestSeenInfo.control) {
            // Set last_seen to the control date
            advert.last_seen = latestSeenInfo.control.date;
            logger.info(`📅 Setting last_seen to: ${latestSeenInfo.control.date}`);
        } else {
            // If no seen info found, set to current date
            advert.last_seen = new Date();
            logger.info(`📅 Setting last_seen to current date: ${new Date()}`);
        }
        
        // Mark as inactive
        advert.is_active = false;

        // also calculate the days between created and last_seen
        const daysBetween = Math.ceil((advert.last_seen - advert.created_at) / (1000 * 60 * 60 * 24));
        console.log("daysBetween",daysBetween);
        advert.sell_time = daysBetween;
        
        await advert.save();
        
        logger.info(`✅ Advert ${autoscoutId} marked as inactive with last_seen updated`);
        
    } catch (error) {
        logger.error(`❌ Error handling 404 for advert ${autoscoutId}:`, error.message);
        
        // Fallback: just mark as inactive without setting last_seen
        try {
            const advert = await Advert.findOne({
                where: { autoscout_id: autoscoutId }
            });
            
            if (advert) {
                advert.is_active = false;
                await advert.save();
                logger.info(`✅ Advert ${autoscoutId} marked as inactive (fallback)`);
            }
        } catch (fallbackError) {
            logger.error(`❌ Fallback error for advert ${autoscoutId}:`, fallbackError.message);
        }
    }
}



/**
 * Process adverts in parallel with a concurrency limit
 * @param {Array} adverts - Array of advert objects to process
 * @param {number} concurrencyLimit - Maximum number of concurrent operations
 */
async function processAdvertsInParallel(adverts, concurrencyLimit = process.env.ADVERT_PROCESSING_CONCURRENCY || 5) {
    const results = [];
    
    // Process in smaller chunks to prevent memory issues
    const chunkSize = Math.min(concurrencyLimit, 10); // Max 10 at a time
    
    for (let i = 0; i < adverts.length; i += chunkSize) {
        const batch = adverts.slice(i, i + chunkSize);
        logger.info(`🔄 Processing batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(adverts.length / chunkSize)} (${batch.length} adverts)`);
        
        const batchPromises = batch.map(async (advert) => {
            let lastError = null;
            
            // Try up to 3 times
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    logger.info(`📋 Extracting listing info for advert: ${advert.autoscout_id} (attempt ${attempt}/3)`);
                    
                    // Create a mock user object for the getListingInfos function
                    const mockUser = { id: advert.seller_id || 1 };
                    const advertUrl = `${process.env.AUTOSCOUT_URL}/offers/${advert.autoscout_id}`;
                    
                    // Extract listing information using the same method as scraper
                    const listingInfo = await getListingInfos(advertUrl, advert.autoscout_id, mockUser);
                    
                    logger.info(`✅ Successfully extracted listing info for advert: ${advert.autoscout_id} on attempt ${attempt}`);
                    
                    // Don't store large listingInfo in memory, just log success
                    return { 
                        autoscout_id: advert.autoscout_id, 
                        status: 'success',
                        attempts: attempt
                    };
                } catch (error) {
                    lastError = error;
                    logger.warn(`⚠️ Attempt ${attempt}/3 failed for advert ${advert.autoscout_id}:`, error.message);
                    
                    // If this is the last attempt, handle the failure
                    if (attempt === 3) {
                        logger.error(`❌ All 3 attempts failed for advert ${advert.autoscout_id}:`, error.message);

                        // Always handle as not found after 3 failed attempts
                        await handleAdvertNotFound(advert.autoscout_id);

                        return { 
                            autoscout_id: advert.autoscout_id, 
                            status: 'inactive',
                            message: 'Advert marked as inactive after 3 failed attempts',
                            attempts: 3
                        };
                    }
                    
                    // Wait 1 second before next attempt
                    logger.info(`⏳ Waiting 1 second before retry for advert ${advert.autoscout_id}...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process results immediately to free memory
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({ 
                    autoscout_id: 'unknown', 
                    status: 'rejected', 
                    error: result.reason?.message || 'Unknown error'
                });
            }
        }
        
        // Clear batch results to free memory
        batchResults.length = 0;
        
        // Small delay between batches to be respectful to the server
        if (i + chunkSize < adverts.length) {
            logger.info('⏳ Waiting 2 seconds before next batch...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return results;
}

/**
 * Check listings function
 * Fetches all active adverts and processes them concurrently
 */
async function checkListings() {
    logger.info('📋 Starting check listings job...');
    try {
        // Fetch all active adverts
        const activeAdverts = await Advert.findAll({
            where: {
                is_active: true
            },

            attributes: ['autoscout_id', 'seller_id']
        });
        
        logger.info(`📊 Found ${activeAdverts.length} active adverts to check`);
        
        if (activeAdverts.length === 0) {
            logger.info('ℹ️ No active adverts found to check');
            return;
        }
        
        // Process adverts in parallel with concurrency limit
        const results = await processAdvertsInParallel(activeAdverts);
        
        // Log summary of results
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
        const inactive = results.filter(r => r.status === 'fulfilled' && r.value.status === 'inactive').length;
        const failed = results.filter(r => r.status === 'fulfilled' && r.value.status === 'error').length;
        const rejected = results.filter(r => r.status === 'rejected').length;
        
        logger.info(`📊 Processing complete: ${successful} successful, ${inactive} marked inactive, ${failed} failed, ${rejected} rejected`);
        
        logger.info('✅ Check listings job completed successfully');
    } catch (error) {
        logger.error('❌ Check listings job failed:', error.message);
        throw error;
    }
}

/**
 * Main checking function
 * Orchestrates the entire checking process
 */
async function main() {
    const startTime = new Date();
    logger.info('📋 Starting AutoScout24 listings checker...');
    logger.info(`⏰ Start time: ${startTime.toLocaleString()}`);
    
    try {
        // Run the check listings process
        await checkListings();
        
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.info('✅ Checking session completed successfully');
        
    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.error('❌ Error during checking session:', error.message);
        throw error;
    }
}

module.exports = { main, checkListings }; 