require('dotenv').config();
const { searchAllPages } = require('./services/scraper');
const { getUsersToScrape } = require('./services/userService');
const { prepareForNotExistingAdvertCheck, markUnseenAdvertsAsInactive } = require('./services/advertService');
const { Control } = require('../models');

/**
 * Process users in parallel with a concurrency limit
 * @param {Array} users - Array of users to process
 * @param {Object} control - Control object for tracking
 * @param {number} concurrencyLimit - Maximum number of concurrent operations
 */
async function processUsersInParallel(users, control, concurrencyLimit = 5) {
    const results = [];
    
    for (let i = 0; i < users.length; i += concurrencyLimit) {
        const batch = users.slice(i, i + concurrencyLimit);
        console.log(`🔄 Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(users.length / concurrencyLimit)} (${batch.length} users)`);
        
        const batchPromises = batch.map(async (user) => {
            try {
                console.log(`📝 Scraping user: ${user.id}`);
                await scrapeUsersListings(user, control);
                return { user: user.id, status: 'success' };
            } catch (error) {
                console.error(`❌ Error scraping user ${user.id}:`, error.message);
                return { user: user.id, status: 'error', error: error.message };
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches to be respectful to the server
        if (i + concurrencyLimit < users.length) {
            console.log('⏳ Waiting 2 seconds before next batch...');
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
    console.log('🚀 Starting AutoScout24 scraper...');
    console.log(`⏰ Start time: ${startTime.toLocaleString()}`);
    
    try {
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        console.log(`📌 Created control ID: ${control.id}`);
        
        // Prepare SeenInfo records for existing active adverts
        await prepareForNotExistingAdvertCheck(control.id);
        
        // Fetch and process users
        const users = await getUsersToScrape();
        console.log(`👥 Found ${users.length} users to scrape`);
        
        // Process users in parallel with concurrency limit
        const results = await processUsersInParallel(users, control, 5);
        
        // Log summary of results
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
        const failed = results.length - successful;
        console.log(`📊 Processing complete: ${successful} successful, ${failed} failed`);
        
        // Mark adverts as inactive if they weren't seen in this session
        await markUnseenAdvertsAsInactive(control);
        
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        console.log(`⏰ End time: ${endTime.toLocaleString()}`);
        console.log(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        console.log('✅ Scraping session completed successfully');
        
    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        console.log(`⏰ End time: ${endTime.toLocaleString()}`);
        console.log(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        console.error('❌ Error during scraping session:', error.message);
        throw error;
    }
}

/**
 * Scrape listings for a specific user
 * @param {Object} user - User object with autoscout_url
 * @param {Object} control - Control object for tracking
 */
async function scrapeUsersListings(user, control) {
    await searchAllPages(user, control);
}

module.exports = { main };