require('dotenv').config();
const { searchAllPages, searchAllPagesWithAllSorts, searchAllPagesViaApi } = require('../services/scraper');
const { getUsersToScrape } = require('../services/userService');
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
 * Process users sequentially to prevent memory overflow
 * @param {Array} users - Array of users to process
 * @param {Object} control - Control object for tracking
 */
async function  processUsersSequentially(users, control) {
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        logger.info(`🔄 Processing user ${i + 1}/${users.length}: ${user.id} (${user.company_name || 'Unknown'})`);
        
        try {
            logger.info(`📝 Scraping user: ${user.id}`);
            await scrapeUsersListings(user, control);
            successCount++;
            logger.info(`✅ Successfully processed user ${user.id}`);
        } catch (error) {
            logger.error(`❌ Error scraping user ${user.id}:`, error.message);
            errorCount++;
        }
        
        // Multiple aggressive garbage collection attempts after each user
        if (global.gc) {
            global.gc();
            // Wait a bit and run GC again for more thorough cleanup
            await new Promise(resolve => setTimeout(resolve, 100));
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
            global.gc();
            
            const memUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
            const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
            
            logger.info(`🧹 Triple GC after user ${user.id}: ${heapUsedMB}MB/${heapTotalMB}MB (${heapPercent}%)`);
        }
        
        // Clear any potential references
        user.tempData = null;
        
        // Small delay between users to allow memory cleanup and be respectful to server
        if (i < users.length - 1) {
            logger.info('⏳ Waiting 3 seconds before next user...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // Return summary instead of full results array
    return {
        successful: successCount,
        failed: errorCount,
        total: users.length
    };
}

/**
 * Main scraping function
 * Orchestrates the entire scraping process
 */
async function main() {
    const startTime = new Date();
    logger.info('🚀 Starting AutoScout24 scraper...');
    logger.info(`⏰ Start time: ${startTime.toLocaleString()}`);
    
    // Check if garbage collection is available
    if (global.gc) {
        logger.info('🧹 Garbage collection is available - memory cleanup enabled');
    } else {
        logger.warn('⚠️ Garbage collection not available. Start Node.js with --expose-gc flag for better memory management');
    }
    
    try {
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        logger.info(`📌 Created control ID: ${control.id}`);
        

        
        // Fetch and process users
        let users = await getUsersToScrape();
        
        users.sort((a, b) => {
            return new Date(b.created_at) - new Date(a.created_at);
        });
        
        logger.info('--------------------------------------------------------');
        logger.info(`👥 Found ${users.length} total users`);

        // DEBUG MODE: Filter users with Swiss AutoScout24.ch URLs if DEBUG=true
        if (process.env.DEBUG === 'true') {
            const originalCount = users.length;
            users = users.filter(user => user.autoscout_url && user.autoscout_url.includes('autoscout24.ch'));
            logger.info(`🐛 DEBUG MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
            logger.info(`🎯 Debug filter: Swiss AutoScout24.ch URLs only`);
            logger.info(`📋 Filtered users: [${users.map(u => `${u.id} (${u.autoscout_url})`).join(', ')}]`);
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
        
        // Process users sequentially to prevent memory overflow
        const results = await processUsersSequentially(filteredUsers, control);
        
        // Log summary of results
        logger.info(`📊 Processing complete: ${results.successful} successful, ${results.failed} failed out of ${results.total} total users`);
        

        
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