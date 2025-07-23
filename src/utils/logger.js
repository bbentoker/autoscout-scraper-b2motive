const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logFile = path.join(process.cwd(), 'systemlog.txt');
        this.maxSize = 10 * 1024 * 1024; // 10MB in bytes
        this.ensureLogFile();
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
     * Get current file size
     */
    getFileSize() {
        try {
            const stats = fs.statSync(this.logFile);
            return stats.size;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Truncate file to keep it under max size
     */
    truncateFile() {
        try {
            const currentSize = this.getFileSize();
            if (currentSize > this.maxSize) {
                console.log(`📏 Log file size (${(currentSize / 1024 / 1024).toFixed(2)}MB) exceeds limit, truncating...`);
                
                // Read all lines
                const content = fs.readFileSync(this.logFile, 'utf8');
                const lines = content.split('\n');
                
                // Keep only the last 1000 lines (or adjust as needed)
                const linesToKeep = 1000;
                const newLines = lines.slice(-linesToKeep);
                
                // Write back to file
                fs.writeFileSync(this.logFile, newLines.join('\n'));
                
                console.log(`✅ Log file truncated to ${newLines.length} lines`);
            }
        } catch (error) {
            console.error('❌ Error truncating log file:', error.message);
        }
    }

    /**
     * Write log entry with timestamp
     */
    writeLog(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            // Check file size before writing
            this.truncateFile();
            
            // Append to file
            fs.appendFileSync(this.logFile, logLine);
            
            // Also log to console for immediate visibility
            const consoleMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
            if (data) {
                console.log(consoleMessage, data);
            } else {
                console.log(consoleMessage);
            }
        } catch (error) {
            console.error('❌ Error writing to log file:', error.message);
        }
    }

    /**
     * Log levels
     */
    info(message, data = null) {
        this.writeLog('info', message, data);
    }

    error(message, data = null) {
        this.writeLog('error', message, data);
    }

    warn(message, data = null) {
        this.writeLog('warn', message, data);
    }

    debug(message, data = null) {
        this.writeLog('debug', message, data);
    }

    /**
     * Log with custom level
     */
    log(level, message, data = null) {
        this.writeLog(level, message, data);
    }

    /**
     * Get recent log entries
     */
    getRecentLogs(lines = 100) {
        try {
            const content = fs.readFileSync(this.logFile, 'utf8');
            const allLines = content.split('\n').filter(line => line.trim());
            return allLines.slice(-lines);
        } catch (error) {
            console.error('❌ Error reading log file:', error.message);
            return [];
        }
    }

    /**
     * Clear log file
     */
    clear() {
        try {
            fs.writeFileSync(this.logFile, '');
            console.log('✅ Log file cleared');
        } catch (error) {
            console.error('❌ Error clearing log file:', error.message);
        }
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger; 