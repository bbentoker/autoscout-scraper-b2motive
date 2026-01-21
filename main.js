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

// Add process monitoring for system health
process.on('uncaughtException', (error) => {
    logger.error('🛑 Uncaught Exception:', error.message);
    logger.error('Stack trace:', error.stack);
    // Perform emergency cleanup
    performDeepMemoryCleanup('emergency-uncaught-exception').then(() => {
        process.exit(1);
    });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('🛑 Unhandled Rejection at:', promise, 'reason:', reason);
    // Perform emergency cleanup but don't exit
    performDeepMemoryCleanup('emergency-unhandled-rejection');
});

process.on('SIGTERM', async () => {
    logger.info('🛑 SIGTERM received, performing graceful shutdown...');
    await performDeepMemoryCleanup('graceful-shutdown');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('🛑 SIGINT received, performing graceful shutdown...');
    await performDeepMemoryCleanup('graceful-shutdown');
    process.exit(0);
});

// Comprehensive memory cleanup function
async function performDeepMemoryCleanup(context = 'unknown') {
    logger.info(`🧹 Performing deep memory cleanup after ${context}...`);
    
    // Multiple aggressive garbage collection passes
    if (global.gc) {
        for (let i = 0; i < 5; i++) {
            global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Log memory usage after cleanup
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const externalMB = Math.round(memUsage.external / 1024 / 1024);
    
    logger.info(`💾 Memory after cleanup: RSS: ${rssMB}MB, Heap: ${heapUsedMB}MB/${heapTotalMB}MB (${heapPercent}%), External: ${externalMB}MB`);
    
    // If memory usage is still high, wait and try again
    if (heapPercent > 50) {
        logger.warn(`⚠️ Memory usage still high (${heapPercent}%), performing additional cleanup...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (global.gc) {
            for (let i = 0; i < 3; i++) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    }
    
    logger.info(`✅ Deep memory cleanup completed for ${context}`);
}

// Function to run the scraper with error handling and memory cleanup
async function runScraper() {
    logger.info('🌙 Starting daily scraping job at midnight...');
    const startTime = new Date();
    memoryMonitor.logMemoryUsage(true);
    
    try {
        await scraperMain();
        const endTime = new Date();
        const duration = Math.round((endTime - startTime) / 1000 / 60); // minutes
        logger.info(`✅ Daily scraping job completed successfully in ${duration} minutes`);
        
    } catch (error) {
        logger.error('❌ Daily scraping job failed:', error.message);
        logger.error('Stack trace:', error.stack);
    } finally {
        // Always perform deep cleanup after scraper
        await performDeepMemoryCleanup('scraper');
        logger.info('🌙 Daily scraper cleanup completed');
    }
}

// Function to run the checker with error handling and memory cleanup
async function runChecker() {
    logger.info('🌃 Starting daily checker job at 2 AM...');
    const startTime = new Date();
    memoryMonitor.logMemoryUsage(true);
    
    try {
        await checkerMain();
        const endTime = new Date();
        const duration = Math.round((endTime - startTime) / 1000 / 60); // minutes
        logger.info(`✅ Daily checker job completed successfully in ${duration} minutes`);
        
    } catch (error) {
        logger.error('❌ Daily checker job failed:', error.message);
        logger.error('Stack trace:', error.stack);
    } finally {
        // Always perform deep cleanup after checker
        await performDeepMemoryCleanup('checker');
        logger.info('🌃 Daily checker cleanup completed');
    }
}

// Schedule the scraper to run daily at midnight (if enabled)
// Cron format: '0 0 * * *' means run at minute 0, hour 0 (midnight) every day
if (SCRAPER_ON) {
    cron.schedule('0 0 * * *', async () => {
        await runScraper();
    }, {
        scheduled: true,
        timezone: "UTC" // You can change this to your preferred timezone
    });
}

// Schedule checker to run daily at 2 AM (if enabled)
// Cron format: '0 2 * * *' means run at minute 0, hour 2 (2 AM) every day
if (CHECKER_ON) {
    cron.schedule('0 2 * * *', async () => {
        await runChecker();
    }, {
        scheduled: true,
        timezone: "UTC" // You can change this to your preferred timezone
    });
}

if (SCRAPER_ON) {
    logger.info('⏰ AutoScout24 scraper scheduled to run daily at midnight (00:00 UTC)');
}
if (CHECKER_ON) {
    logger.info('📋 Check listings job scheduled to run daily at 2 AM (02:00 UTC)');
}

// Check if garbage collection is available
if (global.gc) {
    logger.info('🧹 Garbage collection is available - memory cleanup enabled');
} else {
    logger.warn('⚠️ Garbage collection not available. Start Node.js with --expose-gc flag for better memory management');
}

// Log next scheduled runs
const now = new Date();
const nextMidnight = new Date(now);
nextMidnight.setUTCDate(now.getUTCDate() + 1);
nextMidnight.setUTCHours(0, 0, 0, 0);

const next2AM = new Date(now);
if (now.getUTCHours() >= 2) {
    next2AM.setUTCDate(now.getUTCDate() + 1);
}
next2AM.setUTCHours(2, 0, 0, 0);

if (SCRAPER_ON) {
    logger.info(`🌙 Next scraper run scheduled for: ${nextMidnight.toISOString()}`);
}
if (CHECKER_ON) {
    logger.info(`🌃 Next checker run scheduled for: ${next2AM.toISOString()}`);
}

logger.info('🚀 Scheduler started - running initial jobs based on environment variables...');

// Run jobs once on startup based on environment variables
let startupDelay = 5000; // Start with 5 second delay

if (SCRAPER_ON) {
    logger.info('📝 SCRAPER_ON=true - scheduling initial scraper run...');
    setTimeout(async () => {
        await runScraper();
    }, startupDelay);
    startupDelay += 5000; // Add 5 seconds delay for next job
}

if (CHECKER_ON) {
    logger.info('📝 CHECKER_ON=true - scheduling initial checker run...');
    setTimeout(async () => {
        await runChecker();
    }, startupDelay);
}

// Show what will run
const jobsToRun = [];
if (SCRAPER_ON) jobsToRun.push('Scraper');
if (CHECKER_ON) jobsToRun.push('Checker');

if (jobsToRun.length > 0) {
    logger.info(`🎯 Initial jobs to run: ${jobsToRun.join(', ')}`);
    logger.info('⏳ Jobs will start in 5-10 seconds...');
} else {
    logger.info('ℹ️  No jobs enabled - both SCRAPER_ON and CHECKER_ON are false');
    logger.info('🕐 Waiting for scheduled times (if any jobs were enabled)...');
}