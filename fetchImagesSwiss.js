#!/usr/bin/env node

/**
 * Swiss Image Fetcher Script
 * 
 * This script fetches and uploads images for Swiss AutoScout24 adverts (CHF currency).
 * It downloads images from existing image_url fields and uploads them to MinIO bucket.
 * 
 * Usage:
 *   node fetchImagesSwiss.js [options]
 * 
 * Options:
 *   --limit <number>     Maximum number of adverts to process (optional, no limit if not specified)
 *   --inactive          Include inactive adverts (default: only active)
 *   --ids <id1,id2>     Process specific advert IDs (comma-separated)
 *   --help              Show this help message
 * 
 * Examples:
 *   node fetchImagesSwiss.js --limit 10
 *   node fetchImagesSwiss.js --ids 12345,67890,11111
 *   node fetchImagesSwiss.js --limit 100 --inactive
 *   node fetchImagesSwiss.js (processes all Swiss adverts)
 */

const { Op } = require('sequelize');
const { Advert } = require('./models');
const { uploadImage } = require('./src/services/awsService');

/**
 * Process a single Swiss advert to upload its image to MinIO
 * @param {Object} advert - The advert object from database
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function processSwissAdvertImage(advert) {
  try {
    console.log(`[SWISS_FETCHER] 📋 Processing Swiss advert ${advert.autoscout_id} (${advert.make} ${advert.model})`);
    
    // Check if we already have a MinIO URL (starts with our MinIO domain)
    if (advert.image_url && advert.image_url.includes('s3.nightdrive.ai')) {
      console.log(`[SWISS_FETCHER] ✅ Advert ${advert.autoscout_id} already has MinIO image: ${advert.image_url}`);
      return true;
    }
    
    // Check if we have an original image URL to work with
    if (!advert.image_url || advert.image_url.trim() === '') {
      console.log(`[SWISS_FETCHER] ⚠️ No image URL found for Swiss advert ${advert.autoscout_id}`);
      return false;
    }
    
    const originalImageUrl = advert.image_url;
    console.log(`[SWISS_FETCHER] 🇨🇭 Found Swiss image URL: ${originalImageUrl}`);
    
    // Upload to MinIO
    const minioImageUrl = await uploadImage(originalImageUrl, advert.autoscout_id);
    
    if (minioImageUrl) {
      console.log(`[SWISS_FETCHER] ✅ Swiss image uploaded to MinIO: ${minioImageUrl}`);
      
      // Update the advert with MinIO URL and preserve original URL
      await advert.update({
        image_url: minioImageUrl,
        original_image_url: originalImageUrl
      });
      
      return true;
    } else {
      console.log(`[SWISS_FETCHER] ❌ Failed to upload Swiss image to MinIO`);
      return false;
    }
    
  } catch (error) {
    console.error(`[SWISS_FETCHER] ❌ Error processing Swiss advert ${advert.autoscout_id}:`, error.message);
    return false;
  }
}

/**
 * Fetch and upload images for Swiss adverts
 * @param {Object} options - Configuration options
 * @param {number} options.limit - Maximum number of adverts to process (optional, no limit if not specified)
 * @param {boolean} options.onlyActive - Only process active adverts (default: true)
 * @returns {Promise<Object>} - Statistics about the operation
 */
async function fetchSwissImages(options = {}) {
  const {
    limit = null, // No limit by default
    onlyActive = true
  } = options;
  
  try {
    console.log(`[SWISS_FETCHER] 🚀 Starting Swiss image fetching process...`);
    console.log(`[SWISS_FETCHER] 📊 Options: limit=${limit || 'no limit'}, onlyActive=${onlyActive}`);
    console.log(`[SWISS_FETCHER] 🇨🇭 Processing Swiss listings (price_currency = 'CHF')`);
    
    // Build query conditions for Swiss listings that need MinIO upload
    const whereConditions = {
      [Op.and]: [
        { price_currency: 'CHF' }, // Only Swiss listings
        {
          [Op.or]: [
            { image_url: { [Op.not]: null } }, // Has an image URL
            { image_url: { [Op.ne]: '' } } // Image URL is not empty
          ]
        },
        {
          [Op.or]: [
            { image_url: { [Op.notLike]: '%s3.nightdrive.ai%' } }, // Not already MinIO URL
            { image_url: { [Op.is]: null } }, // Or no image URL at all
            { image_url: '' } // Or empty image URL
          ]
        }
      ]
    };
    
    if (onlyActive) {
      whereConditions[Op.and].push({ is_active: true });
    }
    
    // Build query options
    const queryOptions = {
      where: whereConditions,
      order: [['created_at', 'DESC']], // Process newest first
      attributes: [
        'id', 'autoscout_id', 'make', 'model', 'price_currency', 
        'image_url', 'original_image_url', 'is_active'
      ]
    };
    
    // Only add limit if specified
    if (limit !== null && limit > 0) {
      queryOptions.limit = limit;
    }
    
    // Fetch Swiss adverts that need MinIO upload
    const adverts = await Advert.findAll(queryOptions);
    
    console.log(`[SWISS_FETCHER] 📊 Found ${adverts.length} Swiss adverts that need MinIO upload`);
    
    if (adverts.length === 0) {
      console.log(`[SWISS_FETCHER] ✅ No Swiss adverts found that need image processing`);
      return {
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0
      };
    }
    
    // Process adverts sequentially to avoid overwhelming the servers
    let successful = 0;
    let failed = 0;
    let skipped = 0;
    
    for (let i = 0; i < adverts.length; i++) {
      const advert = adverts[i];
      console.log(`[SWISS_FETCHER] 📋 Processing ${i + 1}/${adverts.length}: ${advert.autoscout_id}`);
      
      try {
        const success = await processSwissAdvertImage(advert);
        
        if (success) {
          successful++;
          console.log(`[SWISS_FETCHER] ✅ Successfully processed ${advert.autoscout_id}`);
        } else {
          failed++;
          console.log(`[SWISS_FETCHER] ❌ Failed to process ${advert.autoscout_id}`);
        }
        
        // Add delay between requests to be respectful to the servers
        if (i < adverts.length - 1) {
          console.log(`[SWISS_FETCHER] ⏳ Waiting 2 seconds before next request...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`[SWISS_FETCHER] ❌ Error processing Swiss advert ${advert.autoscout_id}:`, error.message);
        failed++;
      }
    }
    
    const stats = {
      total: adverts.length,
      processed: successful + failed,
      successful,
      failed,
      skipped
    };
    
    console.log(`[SWISS_FETCHER] 📊 Final Statistics:`);
    console.log(`[SWISS_FETCHER]    Total found: ${stats.total}`);
    console.log(`[SWISS_FETCHER]    Processed: ${stats.processed}`);
    console.log(`[SWISS_FETCHER]    Successful: ${stats.successful}`);
    console.log(`[SWISS_FETCHER]    Failed: ${stats.failed}`);
    console.log(`[SWISS_FETCHER]    Skipped: ${stats.skipped}`);
    console.log(`[SWISS_FETCHER] ✅ Swiss image fetching process completed`);
    
    return stats;
    
  } catch (error) {
    console.error(`[SWISS_FETCHER] ❌ Error in fetchSwissImages:`, error.message);
    throw error;
  }
}

/**
 * Fetch images for specific Swiss adverts by their IDs
 * @param {Array<string>} advertIds - Array of autoscout_id values
 * @returns {Promise<Object>} - Statistics about the operation
 */
async function fetchImagesForSpecificSwissAdverts(advertIds) {
  try {
    console.log(`[SWISS_FETCHER] 🎯 Fetching images for specific Swiss adverts: ${advertIds.join(', ')}`);
    
    const adverts = await Advert.findAll({
      where: {
        autoscout_id: advertIds,
        price_currency: 'CHF' // Ensure they are Swiss listings
      },
      attributes: [
        'id', 'autoscout_id', 'make', 'model', 'price_currency', 
        'image_url', 'original_image_url', 'is_active'
      ]
    });
    
    console.log(`[SWISS_FETCHER] 📊 Found ${adverts.length} matching Swiss adverts`);
    
    let successful = 0;
    let failed = 0;
    
    for (const advert of adverts) {
      try {
        const success = await processSwissAdvertImage(advert);
        
        if (success) {
          successful++;
        } else {
          failed++;
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`[SWISS_FETCHER] ❌ Error processing Swiss advert ${advert.autoscout_id}:`, error.message);
        failed++;
      }
    }
    
    const stats = {
      total: adverts.length,
      processed: successful + failed,
      successful,
      failed,
      skipped: 0
    };
    
    console.log(`[SWISS_FETCHER] 📊 Specific Swiss adverts processing completed:`);
    console.log(`[SWISS_FETCHER]    Successful: ${stats.successful}`);
    console.log(`[SWISS_FETCHER]    Failed: ${stats.failed}`);
    
    return stats;
    
  } catch (error) {
    console.error(`[SWISS_FETCHER] ❌ Error in fetchImagesForSpecificSwissAdverts:`, error.message);
    throw error;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: null, // No limit by default
    onlyActive: true,
    specificIds: null,
    showHelp: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--limit':
        const limitValue = parseInt(args[++i]);
        if (limitValue && limitValue > 0) {
          options.limit = limitValue;
        } else {
          console.error(`Invalid limit value. Must be a positive number.`);
          process.exit(1);
        }
        break;
      case '--inactive':
        options.onlyActive = false;
        break;
      case '--ids':
        const ids = args[++i];
        if (ids) {
          options.specificIds = ids.split(',').map(id => id.trim()).filter(id => id);
        }
        break;
      case '--help':
      case '-h':
        options.showHelp = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        console.log('Use --help for usage information');
        process.exit(1);
    }
  }
  
  return options;
}

// Show help message
function showHelp() {
  console.log(`
Swiss Image Fetcher Script

This script fetches and uploads images for Swiss AutoScout24 adverts (CHF currency).
It downloads images from existing image_url fields and uploads them to MinIO bucket.

Usage:
  node fetchImagesSwiss.js [options]

Options:
  --limit <number>     Maximum number of adverts to process (optional, no limit if not specified)
  --inactive          Include inactive adverts (default: only active)
  --ids <id1,id2>     Process specific advert IDs (comma-separated)
  --help              Show this help message

Examples:
  node fetchImagesSwiss.js --limit 10
  node fetchImagesSwiss.js --ids 12345,67890,11111
  node fetchImagesSwiss.js --limit 100 --inactive
  node fetchImagesSwiss.js (processes all Swiss adverts)

Note:
  This script ONLY processes Swiss listings (price_currency = 'CHF').
  It downloads images from existing image_url fields and uploads them to MinIO.
`);
}

// Main function
async function main() {
  try {
    const options = parseArgs();
    
    if (options.showHelp) {
      showHelp();
      return;
    }
    
    console.log('🚀 Starting Swiss AutoScout24 Image Fetcher...');
    console.log('📊 Configuration:', {
      limit: options.limit || 'no limit',
      onlyActive: options.onlyActive,
      specificIds: options.specificIds ? `${options.specificIds.length} IDs` : 'none',
      processingType: 'Swiss listings only (CHF currency)'
    });
    
    let stats;
    
    if (options.specificIds && options.specificIds.length > 0) {
      // Process specific adverts
      console.log(`🎯 Processing specific Swiss adverts: ${options.specificIds.join(', ')}`);
      stats = await fetchImagesForSpecificSwissAdverts(options.specificIds);
    } else {
      // Process adverts based on filters
      stats = await fetchSwissImages({
        limit: options.limit,
        onlyActive: options.onlyActive
      });
    }
    
    console.log('\n✅ Swiss image fetching completed successfully!');
    console.log('📊 Final Results:');
    console.log(`   Total found: ${stats.total}`);
    console.log(`   Successfully processed: ${stats.successful}`);
    console.log(`   Failed: ${stats.failed}`);
    
    if (stats.successful > 0) {
      console.log(`\n🎉 Successfully uploaded ${stats.successful} Swiss images to MinIO!`);
    }
    
    if (stats.failed > 0) {
      console.log(`\n⚠️  ${stats.failed} Swiss adverts failed to process. Check the logs above for details.`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Process interrupted by user. Exiting gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Process terminated. Exiting gracefully...');
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main();
}

module.exports = { 
  main, 
  parseArgs, 
  showHelp, 
  fetchSwissImages, 
  fetchImagesForSpecificSwissAdverts,
  processSwissAdvertImage
};
