require('dotenv').config();
const { searchAllPages, searchAllPagesWithAllSorts, searchAllPagesViaApi } = require('../services/scraper');
const { getUsersToScrape } = require('../services/userService');
const { Control } = require('../../models');
const logger = require('../utils/logger');
const debugLogger = require('../utils/debugLogger');
const userScrapingLogger = require('../utils/userScrapingLogger');
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
 * Process users sequentially to prevent memory overflow
 * @param {Array} users - Array of users to process
 * @param {Object} control - Control object for tracking
 */
async function  processUsersSequentially(users, control) {
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const currentIndex = i + 1;
        
        // Debug log: User start
        debugLogger.logUserStart(user, currentIndex, users.length);
        
        // User scraping log: User start
        userScrapingLogger.logUserStart(user, currentIndex, users.length);
        
        logger.info(`[SCRAPER] 🔄 Processing user ${currentIndex}/${users.length}: ${user.id} (${user.company_name || 'Unknown'})`);
        
        try {
            const userStats = await scrapeUsersListings(user, control);
            successCount++;
            
            // Debug log: User success
            debugLogger.logUserSuccess(user, userStats, currentIndex, users.length);
            
            // User scraping log: User success
            userScrapingLogger.logUserComplete(user, userStats, currentIndex, users.length);
            
            // Additional summary log for this user
            logger.info(`[SCRAPER] 📈 User ${user.id} Summary: ${userStats.newListings} new, ${userStats.existingListings} existing, ${userStats.totalListings} total (${userStats.durationMinutes}m ${userStats.durationSeconds}s)`);
            
        } catch (error) {
            // Debug log: User error
            debugLogger.logUserError(user, error, currentIndex, users.length);
            
            // User scraping log: User error
            userScrapingLogger.logUserError(user, error, currentIndex, users.length);
            
            logger.error(`[SCRAPER] ❌ Error scraping user ${user.id}:`, error.message);
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
            
            logger.info(`[SCRAPER] 🧹 Triple GC after user ${user.id}: ${heapUsedMB}MB/${heapTotalMB}MB (${heapPercent}%)`);
        }
        
        // Clear any potential references
        user.tempData = null;
        
        // Small delay between users to allow memory cleanup and be respectful to server
        if (i < users.length - 1) {
            logger.info('[SCRAPER] ⏳ Waiting 3 seconds before next user...');
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
    
    // Clear and initialize debug log file
    debugLogger.clearDebugFile();
    
    // Clear and initialize user scraping log file
    userScrapingLogger.clearLogFile();
    
    logger.info('[SCRAPER] 🚀 Starting AutoScout24 scraper...');
    logger.info(`[SCRAPER] ⏰ Start time: ${startTime.toLocaleString()}`);
    
    // Check if garbage collection is available
    if (global.gc) {
        logger.info('[SCRAPER] 🧹 Garbage collection is available - memory cleanup enabled');
    } else {
        logger.warn('[SCRAPER] ⚠️ Garbage collection not available. Start Node.js with --expose-gc flag for better memory management');
    }
    
    try {
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        logger.info(`[SCRAPER] 📌 Created control ID: ${control.id}`);
        

        console.log("--------------------------------getting users--------------------------------");
        
        // LOCALHOST MODE: Filter users by IDs when NODE_ENV=development and LOCALHOST_USERS=true
        console.log("env", process.env.NODE_ENV, process.env.LOCALHOST_USERS);
        let users = await getUsersToScrape();
        console.log("users", users);
        // if (process.env.NODE_ENV === 'dev' && process.env.LOCALHOST_USERS === 'true') {
        //     // Define localhost user IDs - modify these IDs as needed for testing
        //     const localhostUserIds = [
        //         1614
        //     ];
            
        //     const originalCount = users.length;
        //     users = users.filter(user => localhostUserIds.includes(user.id));
            
        //     logger.info(`[SCRAPER] 🏠 LOCALHOST MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
        //     logger.info(`[SCRAPER] 📋 Localhost user IDs: [${localhostUserIds.join(', ')}]`);
        //     logger.info(`[SCRAPER] 👥 Filtered users: [${users.map(u => `${u.id} (${u.company_name || 'Unknown'})`).join(', ')}]`);
        // }
        
 
        // sort the users by autoscout_adverts_count count desc
        users.sort((a, b) => {
            return b.autoscout_adverts_count - a.autoscout_adverts_count;
        });
        
        // sort the users by created_at desc
        // users.sort((a, b) => {
        //     return new Date(b.created_at) - new Date(a.created_at);
        // });

        
        console.log("first user to scrape", users[0]);  
        logger.info('[SCRAPER] --------------------------------------------------------');
        logger.info(`[SCRAPER] 👥 Found ${users.length} total users`);

        // DEBUG MODE: Filter users with Swiss AutoScout24.ch URLs if DEBUG=true
        if (process.env.DEBUG === 'true') {
            const originalCount = users.length;
            // users = users.filter(user => user.autoscout_url && user.autoscout_url.includes('autoscout24.ch'));
            users = users.filter(user => user.id ==42);
            logger.info(`[SCRAPER] 🐛 DEBUG MODE ENABLED: Filtered to ${users.length} users from ${originalCount} total users`);
            logger.info(`[SCRAPER] 🎯 Debug filter: Swiss AutoScout24.ch URLs only`);
            logger.info(`[SCRAPER] 📋 Filtered users: [${users.map(u => `${u.id} (${u.autoscout_url})`).join(', ')}]`);
        }
        
        // STEP 2: Filter users for regular listing scraping
        console.log('users', users.length);
        logger.info(`[SCRAPER] ✅ ${users.length} users will be processed for regular listing scraping`);
        logger.info('[SCRAPER] --------------------------------------------------------');
        
        // Check if there are any users to process for regular scraping
        if (users.length === 0) {
            logger.info('[SCRAPER] ⏭️ No users to process for regular listing scraping ');
            logger.info('[SCRAPER] ✅ Inventory count scraping was still completed for all users.');
            debugLogger.logSessionStart(0);
            debugLogger.logSessionComplete({ successful: 0, failed: 0, total: 0 });
            userScrapingLogger.logSessionStart(0);
            userScrapingLogger.logSessionComplete({ successful: 0, failed: 0, total: 0 });
            return;
        }
        
        // Log session start
        debugLogger.logSessionStart(users.length);
        userScrapingLogger.logSessionStart(users.length);
        
        // Process users sequentially to prevent memory overflow
        const results = await processUsersSequentially(users, control);
        
        // Log session completion
        debugLogger.logSessionComplete(results);
        userScrapingLogger.logSessionComplete(results);
        
        // Log summary of results
        logger.info(`[SCRAPER] 📊 Processing complete: ${results.successful} successful, ${results.failed} failed out of ${results.total} total users`);
        

        
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`[SCRAPER] ⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`[SCRAPER] ⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.info('[SCRAPER] ✅ Scraping session completed successfully');
        
    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`[SCRAPER] ⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`[SCRAPER] ⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.error('[SCRAPER] ❌ Error during scraping session:', error.message);
        throw error;
    }
}



/**
 * Scrape listings for a specific user
 * @param {Object} user - User object with autoscout_url
 * @param {Object} control - Control object for tracking
 * @returns {Object} - Statistics about the scraping session
 */
async function scrapeUsersListings(user, control) {
    const userStartTime = new Date();
    
    // Check if this is the user's first scraping run
    const isInitialRun = user.autoscout_adverts_count === 0;
    
    logger.info(`[SCRAPER] 🚀 Starting scraping session for user ${user.id} (${user.company_name || 'Unknown'})`);
    logger.info(`[SCRAPER] 🔗 URL: ${user.autoscout_url}`);
    logger.info(`[SCRAPER] ⏰ Session start time: ${userStartTime.toLocaleString()}`);
    
    if (isInitialRun) {
        logger.info(`[SCRAPER] 🔄 INITIAL RUN detected for user ${user.id} (autoscout_adverts_count: ${user.autoscout_adverts_count})`);
        logger.info(`[SCRAPER] 📝 All new listings for this user will be marked as initial run listings`);
    } else {
        logger.info(`[SCRAPER] ✅ Regular run for user ${user.id} (autoscout_adverts_count: ${user.autoscout_adverts_count})`);
    }
    
    try {
        // Prefer the new API-based flow, pass initial run flag
        const results = await searchAllPagesViaApi(user, control, isInitialRun);
        
        const userEndTime = new Date();
        const userDuration = userEndTime - userStartTime;
        const userDurationMinutes = Math.floor(userDuration / 60000);
        const userDurationSeconds = Math.floor((userDuration % 60000) / 1000);
        
        // Default statistics if results is not returned or incomplete
        const stats = {
            userId: user.id,
            companyName: user.company_name || 'Unknown',
            url: user.autoscout_url,
            startTime: userStartTime,
            endTime: userEndTime,
            durationMinutes: userDurationMinutes,
            durationSeconds: userDurationSeconds,
            totalListings: results?.totalListings || 0,
            newListings: results?.newListings || 0,
            existingListings: results?.existingListings || 0,
            errorCount: results?.errorCount || 0,
            status: 'success'
        };
        
        logger.info(`[SCRAPER] 🎉 Completed scraping session for user ${user.id}`);
        logger.info(`[SCRAPER] ⏰ Session end time: ${userEndTime.toLocaleString()}`);
        logger.info(`[SCRAPER] ⏱️ Total duration: ${userDurationMinutes}m ${userDurationSeconds}s`);
        logger.info(`[SCRAPER] 📊 Total listings processed: ${stats.totalListings}`);
        logger.info(`[SCRAPER] 🆕 New listings found: ${stats.newListings}`);
        logger.info(`[SCRAPER] ✅ Existing listings updated: ${stats.existingListings}`);
        logger.info(`[SCRAPER] ❌ Errors encountered: ${stats.errorCount}`);
        logger.info(`[SCRAPER] 🏁 Session completed successfully for user ${user.id}`);
        
        return stats;
        
    } catch (error) {
        const userEndTime = new Date();
        const userDuration = userEndTime - userStartTime;
        const userDurationMinutes = Math.floor(userDuration / 60000);
        const userDurationSeconds = Math.floor((userDuration % 60000) / 1000);
        
        const stats = {
            userId: user.id,
            companyName: user.company_name || 'Unknown',
            url: user.autoscout_url,
            startTime: userStartTime,
            endTime: userEndTime,
            durationMinutes: userDurationMinutes,
            durationSeconds: userDurationSeconds,
            totalListings: 0,
            newListings: 0,
            existingListings: 0,
            errorCount: 1,
            status: 'error',
            error: error.message
        };
        
        logger.error(`[SCRAPER] 💥 Scraping session failed for user ${user.id}`);
        logger.error(`[SCRAPER] ⏰ Session end time: ${userEndTime.toLocaleString()}`);
        logger.error(`[SCRAPER] ⏱️ Total duration: ${userDurationMinutes}m ${userDurationSeconds}s`);
        logger.error(`[SCRAPER] ❌ Error: ${error.message}`);
        
        throw error;
    }
}

module.exports = { main }; 