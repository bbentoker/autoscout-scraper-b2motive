const fs = require('fs');
const path = require('path');
const readline = require('readline');

class Logger {
    constructor() {
        this.logFile = path.join(process.cwd(), 'systemlog.txt');
        this.maxSize = 10 * 1024 * 1024; // 10MB in bytes
        this.maxLines = 5000; // Keep only last 5000 lines
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
     * Truncate file using streams to avoid memory issues
     */
    async truncateFile() {
        try {
            const currentSize = this.getFileSize();
            if (currentSize > this.maxSize) {
                console.log(`📏 Log file size (${(currentSize / 1024 / 1024).toFixed(2)}MB) exceeds limit, truncating...`);
                
                // Use streams to read file line by line
                const fileStream = fs.createReadStream(this.logFile);
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });

                const lines = [];
                let lineCount = 0;
                
                for await (const line of rl) {
                    if (line.trim()) {
                        lines.push(line);
                        lineCount++;
                        
                        // Keep only the last maxLines
                        if (lines.length > this.maxLines) {
                            lines.shift(); // Remove oldest line
                        }
                    }
                }
                
                // Write back to file
                fs.writeFileSync(this.logFile, lines.join('\n') + '\n');
                
                console.log(`✅ Log file truncated to ${lines.length} lines`);
            }
        } catch (error) {
            console.error('❌ Error truncating log file:', error.message);
        }
    }

    /**
     * Write log entry with timestamp - optimized for memory
     */
    writeLog(level, message, data = null) {
        const timestamp = new Date().toISOString();
        
        // Limit data size to prevent memory issues
        let limitedData = null;
        if (data) {
            if (typeof data === 'object') {
                // Stringify with limited depth and size
                limitedData = JSON.stringify(data, null, 0).substring(0, 1000);
            } else {
                limitedData = String(data).substring(0, 500);
            }
        }

        const logEntry = {
            timestamp,
            level,
            message: message.substring(0, 1000), // Limit message size
            data: limitedData
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            // Check file size before writing (async but don't await to avoid blocking)
            this.truncateFile().catch(err => console.error('Truncate error:', err));
            
            // Append to file
            fs.appendFileSync(this.logFile, logLine);
            
            // Also log to console for immediate visibility (limited output)
            const consoleMessage = `[${timestamp}] ${level.toUpperCase()}: ${message.substring(0, 200)}`;
            if (limitedData) {
                console.log(consoleMessage, limitedData);
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
     * Get recent log entries - optimized for memory
     */
    async getRecentLogs(lines = 100) {
        try {
            const fileStream = fs.createReadStream(this.logFile);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            const recentLines = [];
            let lineCount = 0;
            
            for await (const line of rl) {
                if (line.trim()) {
                    recentLines.push(line);
                    lineCount++;
                    
                    // Keep only the last requested lines
                    if (recentLines.length > lines) {
                        recentLines.shift();
                    }
                }
            }
            
            return recentLines;
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