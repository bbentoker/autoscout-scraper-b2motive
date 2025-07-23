require('dotenv').config();
const cron = require('node-cron');
const { main: scraperMain } = require('./src/scraper/main');
const { main: checkerMain } = require('./src/checker/main');
const logger = require('./src/utils/logger');

// Function to run the scraper with error handling
async function runScraper() {
    logger.info('🕐 Starting scheduled scraping job...');
    try {
        await scraperMain();
        logger.info('✅ Scheduled scraping job completed successfully');
    } catch (error) {
        logger.error('❌ Scheduled scraping job failed:', error.message);
    }
}

// Function to run the checker with error handling
async function runChecker() {
    logger.info('📋 Starting scheduled check listings job...');
    try {
        await checkerMain();
        logger.info('✅ Scheduled check listings job completed successfully');
    } catch (error) {
        logger.error('❌ Scheduled check listings job failed:', error.message);
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

// Schedule check listings to run at the 15th minute of every hour
// Cron format: '15 * * * *' means run at minute 15 of every hour
cron.schedule('15 * * * *', () => {
    runChecker();
}, {
    scheduled: true,
    timezone: "UTC" // You can change this to your preferred timezone
});

logger.info('⏰ AutoScout24 scraper scheduled to run every hour');
logger.info('📋 Check listings job scheduled to run at the 15th minute of every hour');
logger.info('🚀 Starting initial run...');

// Run the scraper immediately on startup
runScraper(); 
runChecker();