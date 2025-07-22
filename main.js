require('dotenv').config();
const cron = require('node-cron');
const { main } = require('./src/index');

// Function to run the scraper with error handling
async function runScraper() {
    console.log('🕐 Starting scheduled scraping job...');
    try {
        await main();
        console.log('✅ Scheduled scraping job completed successfully');
    } catch (error) {
        console.error('❌ Scheduled scraping job failed:', error.message);
    }
}

// Schedule the scraper to run every hour
// Cron format: '0 * * * *' means run at minute 0 of every hour
cron.schedule('0 * * * *', () => {
    runScraper();
}, {
    scheduled: true,
    timezone: "UTC" // You can change this to your preferred timezone
});

console.log('⏰ AutoScout24 scraper scheduled to run every hour');
console.log('🚀 Starting initial run...');

// Run the scraper immediately on startup
runScraper(); 