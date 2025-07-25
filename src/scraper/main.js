require('dotenv').config();
const { searchAllPages, searchAllPagesWithAllSorts } = require('../services/scraper');
const { getUsersToScrape } = require('../services/userService');
const { prepareForNotExistingAdvertCheck, markUnseenAdvertsAsInactive } = require('../services/advertService');
const { Control } = require('../../models');
const logger = require('../utils/logger');

/**
 * Process users in parallel with a concurrency limit
 * @param {Array} users - Array of users to process
 * @param {Object} control - Control object for tracking
 * @param {number} concurrencyLimit - Maximum number of concurrent operations
 */
async function processUsersInParallel(users, control, concurrencyLimit = process.env.USER_PROCESSING_CONCURRENCY || 5) {
    const results = [];
    
    // Process in smaller chunks to prevent memory issues
    const chunkSize = Math.min(concurrencyLimit, 5); // Max 5 users at a time
    
    for (let i = 0; i < users.length; i += chunkSize) {
        const batch = users.slice(i, i + chunkSize);
        logger.info(`🔄 Processing batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(users.length / chunkSize)} (${batch.length} users)`);
        
        const batchPromises = batch.map(async (user) => {
            try {
                logger.info(`📝 Scraping user: ${user.id}`);
                await scrapeUsersListings(user, control);
                return { user: user.id, status: 'success' };
            } catch (error) {
                logger.error(`❌ Error scraping user ${user.id}:`, error.message);
                return { user: user.id, status: 'error', error: error.message };
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Process results immediately to free memory
        for (const result of batchResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({ 
                    user: 'unknown', 
                    status: 'rejected', 
                    error: result.reason?.message || 'Unknown error'
                });
            }
        }
        
        // Clear batch results to free memory
        batchResults.length = 0;
        
        // Small delay between batches to be respectful to the server
        if (i + chunkSize < users.length) {
            logger.info('⏳ Waiting 2 seconds before next batch...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return results;
}

/**
 * Main scraping function
 * Orchestrates the entire scraping process
 */
async function main() {
    const startTime = new Date();
    logger.info('🚀 Starting AutoScout24 scraper...');
    logger.info(`⏰ Start time: ${startTime.toLocaleString()}`);
    
    try {
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        logger.info(`📌 Created control ID: ${control.id}`);
        
        // Prepare SeenInfo records for existing active adverts
        // await prepareForNotExistingAdvertCheck(control.id);
        
        // Fetch and process users
        const users = await getUsersToScrape();
        logger.info('--------------------------------------------------------');
        logger.info(`👥 Found ${users.length} users to scrape`);
        logger.info('--------------------------------------------------------');
        
        // Process users in parallel with concurrency limit
        const results = await processUsersInParallel(users, control);
        
        // Log summary of results
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
        const failed = results.length - successful;
        logger.info(`📊 Processing complete: ${successful} successful, ${failed} failed`);
        
        // Mark adverts as inactive if they weren't seen in this session
        // await markUnseenAdvertsAsInactive(control);
        
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.info('✅ Scraping session completed successfully');
        
    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.error('❌ Error during scraping session:', error.message);
        throw error;
    }
}

/**
 * Scrape listings for a specific user
 * @param {Object} user - User object with autoscout_url
 * @param {Object} control - Control object for tracking
 */
async function scrapeUsersListings(user, control) {
    await searchAllPagesWithAllSorts(user, control);
}

module.exports = { main }; 