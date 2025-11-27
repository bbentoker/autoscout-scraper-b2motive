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
        try {
            const logDir = path.dirname(this.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true, mode: 0o775 });
            }
        } catch (error) {
            console.error('Failed to create logs directory:', error.message);
            // Don't throw - allow application to continue without logging
        }
    }

    /**
     * Ensure the log file exists
     */
    ensureLogFile() {
        try {
            if (!fs.existsSync(this.logFile)) {
                fs.writeFileSync(this.logFile, '', { mode: 0o664 });
            }
        } catch (error) {
            console.error('Failed to create log file:', error.message);
            console.error('Logging to file will be disabled. Application will continue.');
            // Disable file logging if we can't create the file
            this.logFile = null;
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
        // If log file is disabled (due to permission errors), skip writing
        if (!this.logFile) {
            return;
        }
        
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        try {
            fs.appendFileSync(this.logFile, logEntry);
        } catch (error) {
            console.error('Failed to write to user-scraping.log:', error.message);
            // Disable file logging on persistent errors
            if (error.code === 'EACCES' || error.code === 'EPERM') {
                this.logFile = null;
            }
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
        if (!this.logFile) {
            return;
        }
        
        try {
            const timestamp = new Date().toISOString();
            const header = `AutoScout24 User Scraping Log - Session started at ${timestamp}\n`;
            fs.writeFileSync(this.logFile, header);
        } catch (error) {
            console.error('Failed to clear user-scraping.log:', error.message);
            // Disable file logging on persistent errors
            if (error.code === 'EACCES' || error.code === 'EPERM') {
                this.logFile = null;
            }
        }
    }
}

// Export a singleton instance
module.exports = new UserScrapingLogger();
