require('dotenv').config();
const cron = require('node-cron');
const { main: scraperMain } = require('./src/scraper/main');
const { main: checkerMain } = require('./src/checker/main');
const logger = require('./src/utils/logger');
const memoryMonitor = require('./src/utils/memoryMonitor');

// Get environment variables with defaults
const SCRAPER_ON = process.env.SCRAPER_ON !== 'false';
const CHECKER_ON = process.env.CHECKER_ON !== 'false';

logger.info(`🔧 Configuration: SCRAPER_ON=${SCRAPER_ON}, CHECKER_ON=${CHECKER_ON}`);

// Start memory monitoring
memoryMonitor.startMonitoring();

// Function to run the scraper with error handling
async function runScraper() {
    logger.info('🕐 Starting scheduled scraping job...');
    memoryMonitor.logMemoryUsage(true);
    try {
        await scraperMain();
        logger.info('✅ Scheduled scraping job completed successfully');
        memoryMonitor.logMemoryUsage(true);
    } catch (error) {
        logger.error('❌ Scheduled scraping job failed:', error.message);
        memoryMonitor.forceGC();
    }
}

// Function to run the checker with error handling
async function runChecker() {
    logger.info('📋 Starting scheduled check listings job...');
    memoryMonitor.logMemoryUsage(true);
    try {
        await checkerMain();
        logger.info('✅ Scheduled check listings job completed successfully');
        memoryMonitor.logMemoryUsage(true);
    } catch (error) {
        logger.error('❌ Scheduled check listings job failed:', error.message);
        memoryMonitor.forceGC();
    }
}

// Schedule the scraper to run every hour (if enabled)
// Cron format: '0 * * * *' means run at minute 0 of every hour
if (SCRAPER_ON) {
    cron.schedule('0 * * * *', () => {
        runScraper();
    }, {
        scheduled: true,
        timezone: "UTC" // You can change this to your preferred timezone
    });
}

// Schedule check listings to run at the 15th minute of every hour (if enabled)
// Cron format: '15 * * * *' means run at minute 15 of every hour
if (CHECKER_ON) {
    cron.schedule('15 * * * *', () => {
        runChecker();
    }, {
        scheduled: true,
        timezone: "UTC" // You can change this to your preferred timezone
    });
}

if (SCRAPER_ON) {
    logger.info('⏰ AutoScout24 scraper scheduled to run every hour');
}
if (CHECKER_ON) {
    logger.info('📋 Check listings job scheduled to run at the 15th minute of every hour');
}

logger.info('🚀 Starting initial run...');

// Run jobs immediately on startup (if enabled)
if (SCRAPER_ON) {
    runScraper();
}
if (CHECKER_ON) {
    runChecker();
}