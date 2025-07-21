require('dotenv').config();
const { searchAllPages } = require('./services/scraper');
const { getUsersToScrape } = require('./services/userService');
const { prepareForNotExistingAdvertCheck, markUnseenAdvertsAsInactive } = require('./services/advertService');
const { Control } = require('../models');

/**
 * Main scraping function
 * Orchestrates the entire scraping process
 */
async function main() {
    try {
        console.log('🚀 Starting AutoScout24 scraper...');
        
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        console.log(`📌 Created control ID: ${control.id}`);
        
        // Prepare SeenInfo records for existing active adverts
        await prepareForNotExistingAdvertCheck(control.id);
        
        // Fetch and process users
        const users = await getUsersToScrape();
        console.log(`👥 Found ${users.length} users to scrape`);
        
        for(const user of users) {
            console.log(`📝 Scraping user: ${user.id}`);
            await scrapeUsersListings(user, control);
        }
        
        // Mark adverts as inactive if they weren't seen in this session
        await markUnseenAdvertsAsInactive(control);
        
        console.log('✅ Scraping session completed successfully');
        
    } catch (error) {
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