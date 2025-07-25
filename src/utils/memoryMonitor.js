const logger = require('./logger');

class MemoryMonitor {
    constructor() {
        this.lastMemoryCheck = Date.now();
        this.memoryThreshold = 0.75; // 75% of heap size (reduced from 80%)
        this.criticalThreshold = 0.90; // 90% of heap size
        this.checkInterval = 30000; // Check every 30 seconds (reduced from 60)
        this.lastGC = Date.now();
        this.gcCooldown = 10000; // Minimum 10 seconds between GC calls
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024), // MB
            arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) // MB
        };
    }

    /**
     * Check if memory usage is high
     */
    isMemoryHigh() {
        const usage = this.getMemoryUsage();
        const heapUsageRatio = usage.heapUsed / usage.heapTotal;
        return heapUsageRatio > this.memoryThreshold;
    }

    /**
     * Check if memory usage is critical
     */
    isMemoryCritical() {
        const usage = this.getMemoryUsage();
        const heapUsageRatio = usage.heapUsed / usage.heapTotal;
        return heapUsageRatio > this.criticalThreshold;
    }

    /**
     * Log memory usage
     */
    logMemoryUsage(force = false) {
        const now = Date.now();
        
        // Only log if forced or if enough time has passed
        if (force || (now - this.lastMemoryCheck) > this.checkInterval) {
            const usage = this.getMemoryUsage();
            const heapUsageRatio = (usage.heapUsed / usage.heapTotal * 100).toFixed(1);
            
            logger.info(`💾 Memory Usage - RSS: ${usage.rss}MB, Heap: ${usage.heapUsed}/${usage.heapTotal}MB (${heapUsageRatio}%), External: ${usage.external}MB`);
            
            if (this.isMemoryCritical()) {
                logger.error(`🚨 CRITICAL memory usage: ${heapUsageRatio}% of heap used - Immediate action required!`);
                this.forceGC();
            } else if (this.isMemoryHigh()) {
                logger.warn(`⚠️ High memory usage detected: ${heapUsageRatio}% of heap used`);
                this.forceGC();
            }
            
            this.lastMemoryCheck = now;
        }
    }

    /**
     * Force garbage collection if available
     */
    forceGC() {
        const now = Date.now();
        
        // Check if enough time has passed since last GC
        if (now - this.lastGC < this.gcCooldown) {
            return;
        }
        
        if (global.gc) {
            logger.info('🗑️ Forcing garbage collection...');
            global.gc();
            this.lastGC = now;
            
            // Log memory usage after GC
            setTimeout(() => {
                this.logMemoryUsage(true);
            }, 1000);
        } else {
            logger.warn('⚠️ Garbage collection not available. Run with --expose-gc flag');
        }
    }

    /**
     * Get memory optimization recommendations
     */
    getOptimizationRecommendations() {
        const usage = this.getMemoryUsage();
        const heapUsageRatio = usage.heapUsed / usage.heapTotal;
        
        const recommendations = [];
        
        if (heapUsageRatio > 0.9) {
            recommendations.push('🚨 CRITICAL: Consider restarting the application');
            recommendations.push('🚨 CRITICAL: Reduce batch sizes significantly');
        } else if (heapUsageRatio > 0.8) {
            recommendations.push('⚠️ Reduce batch sizes in processing functions');
            recommendations.push('⚠️ Consider increasing Node.js heap size with --max-old-space-size');
        } else if (heapUsageRatio > 0.7) {
            recommendations.push('💡 Monitor memory usage closely');
            recommendations.push('💡 Consider optimizing data processing loops');
        }
        
        return recommendations;
    }

    /**
     * Monitor memory usage and log warnings
     */
    startMonitoring() {
        // Log initial memory usage
        this.logMemoryUsage(true);
        
        // Set up periodic monitoring
        setInterval(() => {
            this.logMemoryUsage();
            
            if (this.isMemoryCritical()) {
                logger.error('🚨 CRITICAL memory usage detected!');
                const recommendations = this.getOptimizationRecommendations();
                recommendations.forEach(rec => logger.warn(rec));
            } else if (this.isMemoryHigh()) {
                logger.warn('⚠️ High memory usage detected');
                const recommendations = this.getOptimizationRecommendations();
                recommendations.forEach(rec => logger.info(rec));
            }
        }, this.checkInterval);
        
        logger.info('🔍 Memory monitoring started with enhanced thresholds');
    }
}

// Create singleton instance
const memoryMonitor = new MemoryMonitor();

module.exports = memoryMonitor; 