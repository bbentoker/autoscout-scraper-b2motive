const axios = require('axios');
const cheerio = require('cheerio');
const { Op } = require('sequelize');
const { Advert } = require('../../models');
const { uploadImage } = require('./awsService');
const { fetchSwissListingById } = require('./autoscoutChApi');

/**
 * Fetch and upload missing images for all adverts
 * Identifies Swiss vs normal listings by price_currency and fetches images accordingly
 */

/**
 * Fetch image from Swiss listing using CH API
 * @param {Object} advert - The advert object from database
 * @returns {Promise<string|null>} - MinIO URL of uploaded image or null if failed
 */
async function fetchSwissImage(advert) {
  try {
    console.log(`[IMAGE_FETCHER] 🇨🇭 Fetching Swiss image for advert ${advert.autoscout_id}`);
    
    // Fetch the listing details from Swiss API
    const listing = await fetchSwissListingById(advert.autoscout_id);
    
    if (!listing) {
      console.log(`[IMAGE_FETCHER] ⚠️ No listing data found for Swiss advert ${advert.autoscout_id}`);
      return null;
    }
    
    // Debug: Log the structure of the listing to understand the API response
    console.log(`[IMAGE_FETCHER] 🔍 Swiss listing structure for ${advert.autoscout_id}:`, {
      hasImages: !!listing.images,
      imagesLength: listing.images ? listing.images.length : 0,
      imageKeys: listing.images ? listing.images.map(img => img.key || img) : [],
      listingKeys: Object.keys(listing).slice(0, 10) // First 10 keys to see structure
    });
    
    // Try different possible image structures
    let images = null;
    let firstImage = null;
    
    // Check if images exist in the expected format
    if (listing.images && Array.isArray(listing.images) && listing.images.length > 0) {
      images = listing.images;
      firstImage = images[0];
    }
    // Check if images might be in a different property
    else if (listing.media && Array.isArray(listing.media) && listing.media.length > 0) {
      images = listing.media;
      firstImage = images[0];
    }
    // Check if there's a single image property
    else if (listing.image) {
      firstImage = listing.image;
    }
    
    if (!firstImage) {
      console.log(`[IMAGE_FETCHER] ⚠️ No images found for Swiss advert ${advert.autoscout_id}`);
      console.log(`[IMAGE_FETCHER] 🔍 Available properties:`, Object.keys(listing));
      return null;
    }
    
    // Extract the image key/URL - handle different possible structures
    let imageKey = null;
    if (typeof firstImage === 'string') {
      imageKey = firstImage;
    } else if (firstImage.key) {
      imageKey = firstImage.key;
    } else if (firstImage.url) {
      // If it's already a full URL, use it directly
      const originalImageUrl = firstImage.url;
      console.log(`[IMAGE_FETCHER] 🇨🇭 Found Swiss image (full URL): ${originalImageUrl}`);
      
      // Upload to MinIO
      const minioImageUrl = await uploadImage(originalImageUrl, advert.autoscout_id);
      
      if (minioImageUrl) {
        console.log(`[IMAGE_FETCHER] ✅ Swiss image uploaded to MinIO: ${minioImageUrl}`);
        
        // Update the advert with both URLs
        await advert.update({
          image_url: minioImageUrl,
          original_image_url: originalImageUrl
        });
        
        return minioImageUrl;
      } else {
        console.log(`[IMAGE_FETCHER] ❌ Failed to upload Swiss image to MinIO`);
        return null;
      }
    } else if (firstImage.id) {
      imageKey = firstImage.id;
    }
    
    if (!imageKey) {
      console.log(`[IMAGE_FETCHER] ⚠️ Could not extract image key from Swiss advert ${advert.autoscout_id}`);
      console.log(`[IMAGE_FETCHER] 🔍 First image structure:`, firstImage);
      return null;
    }
    
    // Construct the image URL
    const originalImageUrl = `https://listing-images.autoscout24.ch/${imageKey}`;
    console.log(`[IMAGE_FETCHER] 🇨🇭 Found Swiss image: ${originalImageUrl}`);
    
    // Upload to MinIO
    const minioImageUrl = await uploadImage(originalImageUrl, advert.autoscout_id);
    
    if (minioImageUrl) {
      console.log(`[IMAGE_FETCHER] ✅ Swiss image uploaded to MinIO: ${minioImageUrl}`);
      
      // Update the advert with both URLs
      await advert.update({
        image_url: minioImageUrl,
        original_image_url: originalImageUrl
      });
      
      return minioImageUrl;
    } else {
      console.log(`[IMAGE_FETCHER] ❌ Failed to upload Swiss image to MinIO`);
      return null;
    }
    
  } catch (error) {
    console.error(`[IMAGE_FETCHER] ❌ Error fetching Swiss image for advert ${advert.autoscout_id}:`, error.message);
    return null;
  }
}

/**
 * Fetch image from normal listing by scraping AutoScout24.com
 * @param {Object} advert - The advert object from database
 * @returns {Promise<string|null>} - MinIO URL of uploaded image or null if failed
 */
async function fetchNormalImage(advert) {
  try {
    console.log(`[IMAGE_FETCHER] 🌍 Fetching normal image for advert ${advert.autoscout_id}`);
    
    // Construct the AutoScout24.com URL
    const advertUrl = advert.link || `https://www.autoscout24.com/offers/${advert.autoscout_id}`;
    
    console.log(`[IMAGE_FETCHER] 🌍 Scraping page: ${advertUrl}`);
    
    // Fetch the page
    const response = await axios.get(advertUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract image URL (same logic as in extractNewAdvert.js)
    const imageUrl = $('img').eq(9).attr('src');
    
    if (!imageUrl) {
      console.log(`[IMAGE_FETCHER] ⚠️ No image found on page for advert ${advert.autoscout_id}`);
      return null;
    }
    
    console.log(`[IMAGE_FETCHER] 🌍 Found normal image: ${imageUrl}`);
    
    // Upload to MinIO
    const minioImageUrl = await uploadImage(imageUrl, advert.autoscout_id);
    
    if (minioImageUrl) {
      console.log(`[IMAGE_FETCHER] ✅ Normal image uploaded to MinIO: ${minioImageUrl}`);
      
      // Update the advert with both URLs
      await advert.update({
        image_url: minioImageUrl,
        original_image_url: imageUrl
      });
      
      return minioImageUrl;
    } else {
      console.log(`[IMAGE_FETCHER] ❌ Failed to upload normal image to MinIO`);
      return null;
    }
    
  } catch (error) {
    console.error(`[IMAGE_FETCHER] ❌ Error fetching normal image for advert ${advert.autoscout_id}:`, error.message);
    return null;
  }
}

/**
 * Process a single advert to fetch and upload its image
 * @param {Object} advert - The advert object from database
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function processAdvertImage(advert) {
  try {
    // Check if image already exists
    if (advert.image_url && advert.image_url.trim() !== '') {
      console.log(`[IMAGE_FETCHER] ✅ Advert ${advert.autoscout_id} already has image: ${advert.image_url}`);
      return true;
    }
    
    console.log(`[IMAGE_FETCHER] 📋 Processing advert ${advert.autoscout_id} (${advert.make} ${advert.model})`);
    
    let success = false;
    
    // Skip Swiss listings - only process normal listings
    if (advert.price_currency === 'CHF') {
      console.log(`[IMAGE_FETCHER] 🇨🇭 Skipping Swiss listing ${advert.autoscout_id} - only processing normal listings`);
      return true; // Return true to mark as "processed" (skipped)
    } else {
      // Normal listing (price_currency is null or not CHF)
      console.log(`[IMAGE_FETCHER] 🌍 Processing normal listing`);
      const minioUrl = await fetchNormalImage(advert);
      success = minioUrl !== null;
    }
    
    return success;
    
  } catch (error) {
    console.error(`[IMAGE_FETCHER] ❌ Error processing advert ${advert.autoscout_id}:`, error.message);
    return false;
  }
}

/**
 * Fetch images for normal (non-Swiss) adverts that don't have images
 * Note: This function only processes listings where price_currency is NOT 'CHF'
 * @param {Object} options - Configuration options
 * @param {number} options.limit - Maximum number of adverts to process (optional, no limit if not specified)
 * @param {boolean} options.onlyActive - Only process active adverts (default: true)
 * @param {string} options.currency - IGNORED - function only processes normal listings
 * @returns {Promise<Object>} - Statistics about the operation
 */
async function fetchAllMissingImages(options = {}) {
  const {
    limit = null, // No limit by default
    onlyActive = true,
    currency = 'all'
  } = options;
  
  try {
    console.log(`[IMAGE_FETCHER] 🚀 Starting image fetching process for NORMAL listings only...`);
    console.log(`[IMAGE_FETCHER] 📊 Options: limit=${limit || 'no limit'}, onlyActive=${onlyActive}`);
    console.log(`[IMAGE_FETCHER] ⚠️  Note: Only processing NON-Swiss listings (price_currency != 'CHF')`);
    
    // Build query conditions
    const whereConditions = {
      // Only adverts without images (null or empty string)
      [Op.or]: [
        { image_url: { [Op.is]: null } },
        { image_url: '' }
      ]
    };
    
    if (onlyActive) {
      whereConditions.is_active = true;
    }
    
    // Force to only process normal (non-Swiss) listings
    // Only process listings where price_currency is NOT 'CHF'
    whereConditions[Op.and] = [
      {
        [Op.or]: [
          { image_url: { [Op.is]: null } },
          { image_url: '' }
        ]
      },
      {
        [Op.or]: [
          { price_currency: { [Op.is]: null } },
          { price_currency: '' },
          { price_currency: { [Op.ne]: 'CHF' } } // Not equal to CHF
        ]
      }
    ];
    
    // Remove the simple conditions since we're using Op.and
    delete whereConditions[Op.or];
    delete whereConditions.is_active;
    
    if (onlyActive) {
      whereConditions[Op.and].push({ is_active: true });
    }
    // If currency === 'all', don't add any currency filter
    
    // Build query options
    const queryOptions = {
      where: whereConditions,
      order: [['created_at', 'DESC']], // Process newest first
      attributes: [
        'id', 'autoscout_id', 'make', 'model', 'price_currency', 
        'image_url', 'original_image_url', 'link', 'is_active'
      ]
    };
    
    // Only add limit if specified
    if (limit !== null && limit > 0) {
      queryOptions.limit = limit;
    }
    
    // Fetch adverts without images
    const adverts = await Advert.findAll(queryOptions);
    
    console.log(`[IMAGE_FETCHER] 📊 Found ${adverts.length} adverts without images`);
    
    if (adverts.length === 0) {
      console.log(`[IMAGE_FETCHER] ✅ No adverts found that need image processing`);
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
      console.log(`[IMAGE_FETCHER] 📋 Processing ${i + 1}/${adverts.length}: ${advert.autoscout_id}`);
      
      try {
        const success = await processAdvertImage(advert);
        
        if (success) {
          successful++;
          console.log(`[IMAGE_FETCHER] ✅ Successfully processed ${advert.autoscout_id}`);
        } else {
          failed++;
          console.log(`[IMAGE_FETCHER] ❌ Failed to process ${advert.autoscout_id}`);
        }
        
        // Add delay between requests to be respectful to the servers
        if (i < adverts.length - 1) {
          console.log(`[IMAGE_FETCHER] ⏳ Waiting 2 seconds before next request...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`[IMAGE_FETCHER] ❌ Error processing advert ${advert.autoscout_id}:`, error.message);
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
    
    console.log(`[IMAGE_FETCHER] 📊 Final Statistics:`);
    console.log(`[IMAGE_FETCHER]    Total found: ${stats.total}`);
    console.log(`[IMAGE_FETCHER]    Processed: ${stats.processed}`);
    console.log(`[IMAGE_FETCHER]    Successful: ${stats.successful}`);
    console.log(`[IMAGE_FETCHER]    Failed: ${stats.failed}`);
    console.log(`[IMAGE_FETCHER]    Skipped: ${stats.skipped}`);
    console.log(`[IMAGE_FETCHER] ✅ Image fetching process completed`);
    
    return stats;
    
  } catch (error) {
    console.error(`[IMAGE_FETCHER] ❌ Error in fetchAllMissingImages:`, error.message);
    throw error;
  }
}

/**
 * Fetch images for specific adverts by their IDs
 * @param {Array<string>} advertIds - Array of autoscout_id values
 * @returns {Promise<Object>} - Statistics about the operation
 */
async function fetchImagesForSpecificAdverts(advertIds) {
  try {
    console.log(`[IMAGE_FETCHER] 🎯 Fetching images for specific adverts: ${advertIds.join(', ')}`);
    
    const adverts = await Advert.findAll({
      where: {
        autoscout_id: advertIds
      },
      attributes: [
        'id', 'autoscout_id', 'make', 'model', 'price_currency', 
        'image_url', 'original_image_url', 'link', 'is_active'
      ]
    });
    
    console.log(`[IMAGE_FETCHER] 📊 Found ${adverts.length} matching adverts`);
    
    let successful = 0;
    let failed = 0;
    
    for (const advert of adverts) {
      try {
        const success = await processAdvertImage(advert);
        
        if (success) {
          successful++;
        } else {
          failed++;
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`[IMAGE_FETCHER] ❌ Error processing advert ${advert.autoscout_id}:`, error.message);
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
    
    console.log(`[IMAGE_FETCHER] 📊 Specific adverts processing completed:`);
    console.log(`[IMAGE_FETCHER]    Successful: ${stats.successful}`);
    console.log(`[IMAGE_FETCHER]    Failed: ${stats.failed}`);
    
    return stats;
    
  } catch (error) {
    console.error(`[IMAGE_FETCHER] ❌ Error in fetchImagesForSpecificAdverts:`, error.message);
    throw error;
  }
}

module.exports = {
  fetchAllMissingImages,
  fetchImagesForSpecificAdverts,
  processAdvertImage,
  fetchSwissImage,
  fetchNormalImage
};
