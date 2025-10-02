const fs = require('fs');
const path = require('path');

/**
 * User Scraping Logger
 * Simple logger that tracks when users start and finish being scraped
 * Logs user ID, name, Swiss status, and timing information
 */
class UserScrapingLogger {
    constructor() {
        this.logFile = path.join(process.cwd(), 'logs', 'user-scraping.log');
        this.ensureLogDirectory();
        this.ensureLogFile();
    }

    /**
     * Ensure the logs directory exists
     */
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * Ensure the log file exists
     */
    ensureLogFile() {
        if (!fs.existsSync(this.logFile)) {
            fs.writeFileSync(this.logFile, '');
        }
    }

    /**
     * Check if user is Swiss based on autoscout URL
     * @param {Object} user - User object with autoscout_url
     * @returns {boolean} - True if user is Swiss (autoscout24.ch)
     */
    isSwissUser(user) {
        return user.autoscout_url && user.autoscout_url.includes('autoscout24.ch');
    }

    /**
     * Write a log entry to the user scraping log file
     * @param {string} message - The message to log
     */
    writeLog(message) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            console.error('Failed to write to user-scraping.log:', error.message);
        }
    }

    /**
     * Log when a user starts being scraped
     * @param {Object} user - User object
     * @param {number} currentIndex - Current user index (1-based)
     * @param {number} totalUsers - Total number of users
     */
    logUserStart(user, currentIndex, totalUsers) {
        const isSwiss = this.isSwissUser(user);
        const countryFlag = isSwiss ? '🇨🇭' : '🇧🇪';
        const countryText = isSwiss ? 'Swiss' : 'Belgian';
        
        const message = `${countryFlag} STARTED User ${user.id} | ${user.company_name || 'Unknown'} | ${countryText} | ${currentIndex}/${totalUsers}`;
        this.writeLog(message);
    }

    /**
     * Log when a user finishes being scraped successfully
     * @param {Object} user - User object
     * @param {Object} stats - Processing statistics
     * @param {number} currentIndex - Current user index (1-based)
     * @param {number} totalUsers - Total number of users
     */
    logUserComplete(user, stats, currentIndex, totalUsers) {
        const isSwiss = this.isSwissUser(user);
        const countryFlag = isSwiss ? '🇨🇭' : '🇧🇪';
        const countryText = isSwiss ? 'Swiss' : 'Belgian';
        
        const message = `${countryFlag} COMPLETED User ${user.id} | ${user.company_name || 'Unknown'} | ${countryText} | ${currentIndex}/${totalUsers} | Duration: ${stats.durationMinutes}m ${stats.durationSeconds}s | New: ${stats.newListings} | Existing: ${stats.existingListings} | Total: ${stats.totalListings}`;
        this.writeLog(message);
    }

    /**
     * Log when a user scraping fails
     * @param {Object} user - User object
     * @param {Error} error - Error that occurred
     * @param {number} currentIndex - Current user index (1-based)
     * @param {number} totalUsers - Total number of users
     */
    logUserError(user, error, currentIndex, totalUsers) {
        const isSwiss = this.isSwissUser(user);
        const countryFlag = isSwiss ? '🇨🇭' : '🇧🇪';
        const countryText = isSwiss ? 'Swiss' : 'Belgian';
        
        const message = `${countryFlag} FAILED User ${user.id} | ${user.company_name || 'Unknown'} | ${countryText} | ${currentIndex}/${totalUsers} | Error: ${error.message}`;
        this.writeLog(message);
    }

    /**
     * Log scraper session start
     * @param {number} totalUsers - Total number of users to process
     */
    logSessionStart(totalUsers) {
        const separator = '='.repeat(80);
        this.writeLog(separator);
        this.writeLog(`🚀 SCRAPER SESSION STARTED - Processing ${totalUsers} users`);
        this.writeLog(separator);
    }

    /**
     * Log scraper session completion
     * @param {Object} results - Session results
     */
    logSessionComplete(results) {
        const separator = '='.repeat(80);
        this.writeLog(separator);
        this.writeLog(`🏁 SCRAPER SESSION COMPLETED - Successful: ${results.successful} | Failed: ${results.failed} | Total: ${results.total}`);
        this.writeLog(separator);
    }

    /**
     * Clear the log file at the start of a new session
     */
    clearLogFile() {
        try {
            const timestamp = new Date().toISOString();
            const header = `AutoScout24 User Scraping Log - Session started at ${timestamp}\n`;
            fs.writeFileSync(this.logFile, header);
        } catch (error) {
            console.error('Failed to clear user-scraping.log:', error.message);
        }
    }
}

// Export a singleton instance
module.exports = new UserScrapingLogger();
