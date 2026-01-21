#!/usr/bin/env node

/**
 * Test script for the daily scheduler
 * This script allows you to test the scheduler functionality without waiting for the actual scheduled times
 */

require('dotenv').config();

// Override environment variables for testing
process.env.SCRAPER_ON = process.env.TEST_SCRAPER_ON || 'true';
process.env.CHECKER_ON = process.env.TEST_CHECKER_ON || 'true';

console.log('🧪 Starting scheduler test...');
console.log('📝 This will run jobs on startup based on environment variables');
console.log('⚙️  Configuration:');
console.log(`   SCRAPER_ON: ${process.env.SCRAPER_ON}`);
console.log(`   CHECKER_ON: ${process.env.CHECKER_ON}`);
console.log('');

// Start the main scheduler
require('./main.js');
