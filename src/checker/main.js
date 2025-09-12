require('dotenv').config();
const logger = require('../utils/logger');
const { checkListingsAcrossUsers } = require('../services/checkListingsService');

async function main() {
    const startTime = new Date();
    logger.info('[CHECKER] 📋 Starting AutoScout24 listings checker...');
    logger.info(`[CHECKER] ⏰ Start time: ${startTime.toLocaleString()}`);
    
    try {
        // If USER_PROCESSING_CONCURRENCY_CHECKER is set, we process across users with that concurrency
        // Otherwise, fallback to single-tenant checkListingsAcrossUsers which handles default concurrency
        const userConcurrency = process.env.USER_PROCESSING_CONCURRENCY_CHECKER;
        if (userConcurrency) {
            logger.info(`[CHECKER] 🧵 USER_PROCESSING_CONCURRENCY_CHECKER=${userConcurrency}. Checking listings across users with concurrency.`);
        }
        await checkListingsAcrossUsers();
        
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`[CHECKER] ⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`[CHECKER] ⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.info('[CHECKER] ✅ Checking session completed successfully');
        
    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        logger.info(`[CHECKER] ⏰ End time: ${endTime.toLocaleString()}`);
        logger.info(`[CHECKER] ⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        logger.error('[CHECKER] ❌ Error during checking session:', error.message);
        throw error;
    }
}

module.exports = { main };