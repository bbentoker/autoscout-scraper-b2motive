require('dotenv').config();
const { searchAllPages, searchAllPagesWithAllSorts, searchAllPagesViaApi } = require('../services/scraper');
const { getUsersToScrape } = require('../services/userService');
const { prepareForNotExistingAdvertCheck, markUnseenAdvertsAsInactive } = require('../services/advertService');
const { Control } = require('../../models');
const logger = require('../utils/logger');
const axios = require('axios');
const cheerio = require('cheerio');
const { AutoScoutInventory } = require('../../models');

/**
 * Check if a date is within the current week (from Monday to Sunday)
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} - True if the date is within the current week
 */
function isWithinCurrentWeek(dateString) {
    const targetDate = new Date(dateString);
    const today = new Date();
    
    // Get the start of the current week (Monday)
    const startOfWeek = new Date(today);
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so we need 6 days back
    startOfWeek.setDate(today.getDate() - daysToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Get the end of the current week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    // Check if target date is within the current week
    return targetDate >= startOfWeek && targetDate <= endOfWeek;
}

/**
 * Filter users based on their autoscout_url_add_date
 * Skip users whose date is within the current week and not older than 7 days
 * @param {Array} users - Array of users to filter
 * @returns {Array} - Filtered array of users
 */
function filterUsersByAddDate(users) {
    const today = new Date();
    const filteredUsers = [];
    const skippedUsers = [];
    
    for (const user of users) {
        if (!user.autoscout_url_add_date) {
            // If no date is provided, include the user
            logger.info(`✅ User ${user.id}: No autoscout_url_add_date provided - will be processed`);
            filteredUsers.push(user);
            continue;
        }
        
        const addDate = new Date(user.autoscout_url_add_date);
        const daysDifference = Math.floor((today - addDate) / (1000 * 60 * 60 * 24));
        const isWithinWeek = isWithinCurrentWeek(user.autoscout_url_add_date);
        
        // Skip if the date is within the current week and not older than 7 days
        if (isWithinWeek && daysDifference < 7) {
            const skipInfo = {
                id: user.id,
                autoscout_url_add_date: user.autoscout_url_add_date,
                daysDifference: daysDifference,
                isWithinWeek: isWithinWeek,
                reason: `Within current week (${daysDifference} days old) - skipping until next Monday`
            };
            skippedUsers.push(skipInfo);
            
            // Log each skipped user immediately
            logger.info(`⏭️ SKIPPED User ${user.id}:`);
            logger.info(`   📊 User: ${user.company_name}`);
            logger.info(`   📅 Add Date: ${user.autoscout_url_add_date}`);
            logger.info(`   📊 Days Old: ${daysDifference}`);
            logger.info(`   📈 Within Current Week: ${isWithinWeek}`);
            logger.info(`   🚫 Reason: ${skipInfo.reason}`);
            logger.info(`   ──────────────────────────────────────────`);
        } else {
            logger.info(`✅ User ${user.id}: Will be processed (${daysDifference} days old, within week: ${isWithinWeek})`);
            filteredUsers.push(user);
        }
    }
    
    if (skippedUsers.length > 0) {
        logger.info(`📊 SUMMARY: Skipped ${skippedUsers.length} users due to autoscout_url_add_date within current week`);
    }
    
    return filteredUsers;
}

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
        let users = await getUsersToScrape();
        logger.info('--------------------------------------------------------');
        logger.info(`👥 Found ${users.length} total users`);

        // DEBUG MODE: Filter users by hardcoded ID array if DEBUG=true
        if (process.env.DEBUG === 'true') {
            const debugUserIds = [111]; // Hardcoded array for user ID 111
            const originalCount = users.length;
            users = users.filter(user => debugUserIds.includes(user.id));
            logger.info(`🐛 DEBUG MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
            logger.info(`🎯 Debug user IDs: [${debugUserIds.join(', ')}]`);
            logger.info(`📋 Filtered users: [${users.map(u => u.id).join(', ')}]`);
        }
        
        // STEP 2: Filter users for regular listing scraping
        const filteredUsers = filterUsersByAddDate(users);
        logger.info(`✅ ${filteredUsers.length} users will be processed for regular listing scraping after filtering`);
        logger.info('--------------------------------------------------------');
        
        // Check if there are any users to process for regular scraping
        if (filteredUsers.length === 0) {
            logger.info('⏭️ No users to process for regular listing scraping after filtering. All users are within the current week or less than 7 days old.');
            logger.info('✅ Inventory count scraping was still completed for all users.');
            return;
        }
        
        // Process users in parallel with concurrency limit for regular listing scraping
        const results = await processUsersInParallel(filteredUsers, control);
        
        // Log summary of results
        const successful = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'error').length;
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
    // Prefer the new API-based flow
    await searchAllPagesViaApi(user, control);
}

module.exports = { main }; 