const fs = require('fs');
const path = require('path');

/**
 * Debug logger that writes to debug.txt file
 * Used to track user processing start and completion times
 */
class DebugLogger {
    constructor() {
        this.debugFile = path.join(process.cwd(), 'debug.txt');
    }

    /**
     * Write a debug log entry to debug.txt
     * @param {string} message - The message to log
     */
    writeDebugLog(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        try {
            fs.appendFileSync(this.debugFile, logEntry);
        } catch (error) {
            console.error('Failed to write to debug.txt:', error.message);
        }
    }

    /**
     * Log when a user starts processing
     * @param {Object} user - User object
     * @param {number} currentIndex - Current user index (1-based)
     * @param {number} totalUsers - Total number of users
     */
    logUserStart(user, currentIndex, totalUsers) {
        const message = `🚀 STARTED processing user ${user.id} (${user.company_name || 'Unknown'}) - ${currentIndex}/${totalUsers} - URL: ${user.autoscout_url}`;
        this.writeDebugLog(message);
    }

    /**
     * Log when a user finishes processing successfully
     * @param {Object} user - User object
     * @param {Object} stats - Processing statistics
     * @param {number} currentIndex - Current user index (1-based)
     * @param {number} totalUsers - Total number of users
     */
    logUserSuccess(user, stats, currentIndex, totalUsers) {
        const message = `✅ COMPLETED user ${user.id} (${user.company_name || 'Unknown'}) - ${currentIndex}/${totalUsers} - Duration: ${stats.durationMinutes}m ${stats.durationSeconds}s - New: ${stats.newListings}, Existing: ${stats.existingListings}, Total: ${stats.totalListings}`;
        this.writeDebugLog(message);
    }

    /**
     * Log when a user processing fails
     * @param {Object} user - User object
     * @param {Error} error - Error that occurred
     * @param {number} currentIndex - Current user index (1-based)
     * @param {number} totalUsers - Total number of users
     */
    logUserError(user, error, currentIndex, totalUsers) {
        const message = `❌ FAILED user ${user.id} (${user.company_name || 'Unknown'}) - ${currentIndex}/${totalUsers} - Error: ${error.message}`;
        this.writeDebugLog(message);
    }

    /**
     * Log scraper session start
     * @param {number} totalUsers - Total number of users to process
     */
    logSessionStart(totalUsers) {
        const message = `🔥 SCRAPER SESSION STARTED - Processing ${totalUsers} users`;
        this.writeDebugLog(message);
        this.writeDebugLog('='.repeat(80));
    }

    /**
     * Log scraper session completion
     * @param {Object} results - Session results
     */
    logSessionComplete(results) {
        this.writeDebugLog('='.repeat(80));
        const message = `🏁 SCRAPER SESSION COMPLETED - Successful: ${results.successful}, Failed: ${results.failed}, Total: ${results.total}`;
        this.writeDebugLog(message);
    }

    /**
     * Clear the debug file at the start of a new session
     */
    clearDebugFile() {
        try {
            const timestamp = new Date().toISOString();
            const header = `AutoScout24 Scraper Debug Log - Session started at ${timestamp}\n${'='.repeat(80)}\n`;
            fs.writeFileSync(this.debugFile, header);
        } catch (error) {
            console.error('Failed to clear debug.txt:', error.message);
        }
    }
}

// Export a singleton instance
module.exports = new DebugLogger();
