const axios = require('axios');
const https = require('https');
const fs = require('fs');

/**
 * AutoScout24.ch (Swiss) API Service
 * Implementation based on autoscout_ch_docs.md specifications
 */

// Constants from documentation
const API_BASE_URL = 'https://api.autoscout24.ch';
const WEBSITE_BASE_URL = 'https://www.autoscout24.ch';
const LISTINGS_SEARCH_ENDPOINT = `${API_BASE_URL}/v1/listings/search`;

function getHttpsAgent() {
  const allowInsecure = String(process.env.ALLOW_INSECURE_TLS || '').toLowerCase() === 'true';
  return new https.Agent({ rejectUnauthorized: !allowInsecure });
}

/**
 * Extract dealer ID from Swiss AutoScout24 URL
 * Example: https://www.autoscout24.ch/de/s/seller-1729890 -> 1729890
 */
function extractDealerIdFromChUrl(url) {
  try {
    const match = url.match(/seller-(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch (error) {
    console.error('[SCRAPER] ❌ Error extracting dealer ID from CH URL:', error.message);
    return null;
  }
}

/**
 * Check if URL is from Swiss AutoScout24 region
 */
function isSwissRegionUrl(url) {
  return url && url.includes('autoscout24.ch');
}

/**
 * Get required headers for Swiss AutoScout24 API
 * Based on security requirements from documentation
 */
function getSwissApiHeaders() {
  return {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9,tr;q=0.8',
    'content-type': 'application/json',
    'origin': WEBSITE_BASE_URL,
    'priority': 'u=1, i',
    'referer': `${WEBSITE_BASE_URL}/`,
    'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
  };
}

/**
 * Create payload for general car listings search
 */
function createGeneralSearchPayload(page = 0, size = 20) {
  return {
    query: {
      vehicleCategories: ["car"]
    },
    pagination: {
      page: page, // 0-indexed
      size: size
    },
    sort: [
      {
        order: "DESC",
        type: "RELEVANCE",
        variant: "v1"
      }
    ]
  };
}

/**
 * Create payload for dealer-specific listings search
 */
function createDealerSearchPayload(dealerId, page = 0, size = 20) {
  return {
    query: {
      sellerIds: [dealerId], // Dealer ID as integer
      vehicleCategories: ["car"]
    },
    pagination: {
      page: page, // 0-indexed
      size: size
    },
    sort: []
  };
}

/**
 * Implement exponential backoff retry logic
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const method = options.method || 'POST';
      let response;
      
      if (method.toUpperCase() === 'GET') {
        response = await axios.get(url, {
          headers: options.headers,
          httpsAgent: getHttpsAgent(),
          timeout: 30000
        });
      } else {
        response = await axios.post(url, options.data, {
          headers: options.headers,
          httpsAgent: getHttpsAgent(),
          timeout: 30000
        });
      }
      
      return response;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      
      // Check if we should retry based on status codes from documentation
      const shouldRetry = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      
      if (shouldRetry && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[SCRAPER] ⚠️ Request failed with status ${status}. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If we shouldn't retry or we've exhausted retries, throw the error
      break;
    }
  }
  
  throw lastError;
}

/**
 * Fetch dealer listings from Swiss AutoScout24 API
 */
async function fetchSwissDealerListings(dealerId, page = 0, size = 20) {
  const payload = createDealerSearchPayload(dealerId, page, size);
  const headers = getSwissApiHeaders();
  
  try {
    console.log(`[SCRAPER] 📤 Fetching Swiss dealer listings for dealer ${dealerId}, page ${page}`);
    
    const response = await fetchWithRetry(LISTINGS_SEARCH_ENDPOINT, {
      data: payload,
      headers: headers
    });
    
    const data = response.data;
    const listings = data?.content || [];
    
    console.log(`[SCRAPER] 📥 Swiss API returned ${listings.length} listings for dealer ${dealerId}, page ${page}`);
    console.log(`[SCRAPER] 📊 Total pages: ${data?.totalPages || 0}, Total elements: ${data?.totalElements || 0}`);
    
    return {
      listings: listings,
      totalPages: data?.totalPages || 0,
      totalElements: data?.totalElements || 0,
      hasMore: (page + 1) < (data?.totalPages || 0)
    };
    
  } catch (error) {
    console.error(`[SCRAPER] ❌ Error fetching Swiss dealer listings for dealer ${dealerId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch all listings for a Swiss dealer (handles pagination)
 */
async function fetchAllSwissDealerListings(dealerId) {
  const allListings = [];
  const seenIds = new Set(); // Track seen IDs to avoid duplicates
  let page = 0;
  let hasMore = true;
  const maxPages = 100; // Safety limit
  let totalElements = 0;
  
  console.log(`[SCRAPER] 🔎 Fetching all listings for Swiss dealer ${dealerId}`);
  
  while (hasMore && page < maxPages) {
    try {
      const result = await fetchSwissDealerListings(dealerId, page);
      
      if (result.listings && result.listings.length > 0) {
        // Deduplicate listings based on ID
        const newListings = result.listings.filter(listing => {
          if (seenIds.has(listing.id)) {
            console.log(`[SCRAPER] 🔄 Duplicate listing found: ${listing.id} (skipping)`);
            return false;
          }
          seenIds.add(listing.id);
          return true;
        });
        
        allListings.push(...newListings);
        console.log(`[SCRAPER] 📄 Page ${page + 1}: Added ${newListings.length} new listings (${result.listings.length - newListings.length} duplicates, total unique: ${allListings.length})`);
        
        // Store total elements from first page
        if (page === 0) {
          totalElements = result.totalElements || 0;
          console.log(`[SCRAPER] 📊 API reports total elements: ${totalElements}`);
        }
      }
      
      hasMore = result.hasMore;
      page++;
      
      // Small delay between requests to be respectful
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay
      }
      
    } catch (error) {
      console.error(`[SCRAPER] ❌ Error on page ${page}:`, error.message);
      // Don't break immediately, try a few more times with longer delays
      if (page < 3) {
        console.log(`[SCRAPER] 🔄 Retrying page ${page} after error...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      } else {
        console.error(`[SCRAPER] ❌ Too many errors, stopping at page ${page}`);
        break;
      }
    }
  }
  
  console.log(`[SCRAPER] ✅ Completed fetching Swiss dealer listings. Total unique: ${allListings.length} listings`);
  
  // Warning if we got fewer listings than expected
  if (totalElements > 0 && allListings.length < totalElements) {
    console.warn(`[SCRAPER] ⚠️ Warning: Expected ${totalElements} listings but got ${allListings.length}. Some listings might be missing.`);
  }
  
  return allListings;
}

/**
 * Fetch a single listing by ID from Swiss API
 * @param {string|number} listingId - The listing ID to fetch
 * @param {string} debugLogFilePath - Optional debug log file path for detailed logging
 * @returns {Object|null} - Listing object if found, null if not found
 */
async function fetchSwissListingById(listingId, debugLogFilePath = null) {
  const url = `https://api.autoscout24.ch/v1/listings/${listingId}`;
  const headers = getSwissApiHeaders();
  
  // Helper function to write to debug log
  const writeDebugLog = (message) => {
    if (debugLogFilePath) {
      try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [API] ${message}\n`;
        fs.appendFileSync(debugLogFilePath, logEntry);
      } catch (error) {
        console.error(`[SCRAPER] ❌ Error writing to debug log file: ${error.message}`);
      }
    }
  };
  
  try {
    const startMsg = `🔍 [API DEBUG] Checking individual listing: ${listingId}`;
    console.log('[SCRAPER] ' + startMsg);
    writeDebugLog(startMsg);
    
    const response = await fetchWithRetry(url, {
      method: 'GET',
      headers: headers
    });
    
    const statusMsg = `🔍 [API DEBUG] Response status: ${response.status}`;
    console.log('[SCRAPER] ' + statusMsg);
    writeDebugLog(statusMsg);
    
    if (response.status === 200) {
      const successMsg = `✅ [API DEBUG] Listing ${listingId} found and active`;
      console.log('[SCRAPER] ' + successMsg);
      writeDebugLog(successMsg);
      return response.data;
    } else if (response.status === 404) {
      const notFoundMsg = `❌ [API DEBUG] Listing ${listingId} not found (404) - This listing appears to be sold/removed`;
      console.log('[SCRAPER] ' + notFoundMsg);
      writeDebugLog(notFoundMsg);
      return null;
    } else {
      const unexpectedMsg = `⚠️ [API DEBUG] Listing ${listingId} returned unexpected status ${response.status}`;
      console.log('[SCRAPER] ' + unexpectedMsg);
      writeDebugLog(unexpectedMsg);
      return null;
    }
    
  } catch (error) {
    const errorMsg = `🔍 [API DEBUG] Error occurred for listing ${listingId}: ${error.message} (status: ${error.response?.status})`;
    console.log('[SCRAPER] ' + errorMsg);
    writeDebugLog(errorMsg);
    
    if (error.response && error.response.status === 404) {
      const notFoundMsg = `❌ [API DEBUG] Listing ${listingId} not found (404 error) - This listing appears to be sold/removed`;
      console.log('[SCRAPER] ' + notFoundMsg);
      writeDebugLog(notFoundMsg);
      return null;
    } else if (error.response && error.response.status === 429) {
      const rateLimitMsg = `⏳ [API DEBUG] Rate limited checking listing ${listingId}, waiting and retrying...`;
      console.log('[SCRAPER] ' + rateLimitMsg);
      writeDebugLog(rateLimitMsg);
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Increased wait time
      // Retry multiple times with exponential backoff for rate limits
      for (let retryAttempt = 1; retryAttempt <= 3; retryAttempt++) {
        try {
          const retryMsg = `🔄 [API DEBUG] Retry attempt ${retryAttempt}/3 for listing ${listingId} after rate limit...`;
          console.log('[SCRAPER] ' + retryMsg);
          writeDebugLog(retryMsg);
          
          const retryResponse = await fetchWithRetry(url, {
            method: 'GET',
            headers: headers
          });
          
          const retryResultMsg = `🔄 [API DEBUG] Retry result for ${listingId}: status ${retryResponse.status}`;
          console.log('[SCRAPER] ' + retryResultMsg);
          writeDebugLog(retryResultMsg);
          
          return retryResponse.status === 200 ? retryResponse.data : null;
        } catch (retryError) {
          const retryErrorMsg = `❌ [API DEBUG] Retry attempt ${retryAttempt} failed for listing ${listingId}: ${retryError.message}`;
          console.error('[SCRAPER] ' + retryErrorMsg);
          writeDebugLog(retryErrorMsg);
          
          // If retry also fails with 429, wait longer and try again
          if (retryError.response && retryError.response.status === 429) {
            if (retryAttempt < 3) {
              const waitTime = Math.pow(2, retryAttempt) * 2000; // 4s, 8s
              const waitMsg = `⏳ [API DEBUG] Rate limit persists for ${listingId}, waiting ${waitTime}ms before retry ${retryAttempt + 1}...`;
              console.log('[SCRAPER] ' + waitMsg);
              writeDebugLog(waitMsg);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              continue;
            } else {
              const skipMsg = `⚠️ [API DEBUG] Rate limit persists for ${listingId} after 3 retries - skipping to avoid false negative`;
              console.log('[SCRAPER] ' + skipMsg);
              writeDebugLog(skipMsg);
              throw new Error(`Rate limit error for listing ${listingId} - cannot determine if listing is available`);
            }
          }
          return null;
        }
      }
    } else {
      const unexpectedErrorMsg = `❌ [API DEBUG] Unexpected error fetching listing ${listingId}: ${error.message}`;
      console.error('[SCRAPER] ' + unexpectedErrorMsg);
      writeDebugLog(unexpectedErrorMsg);
      return null;
    }
  }
}

/**
 * Convert Swiss API listing to standard format
 */
function convertSwissListingToStandard(listing) {
  return {
    id: listing.id,
    createdDate: listing.createdDate,
    seller: {
      id: listing.seller?.id,
      type: listing.seller?.type,
      name: listing.seller?.name
    },
    // Map other fields as needed based on the actual API response structure
    ...listing
  };
}

/**
 * Main function to scrape Swiss dealer listings
 */
async function scrapeSwissDealer(dealerUrl, userId) {
  try {
    console.log(`🇨🇭 Starting Swiss region scraping for dealer: ${dealerUrl}`);
    
    // Extract dealer ID from URL
    const dealerId = extractDealerIdFromChUrl(dealerUrl);
    if (!dealerId) {
      throw new Error(`Could not extract dealer ID from Swiss URL: ${dealerUrl}`);
    }
    
    console.log(`🏢 Extracted dealer ID: ${dealerId}`);
    
    // Fetch all listings for this dealer
    const listings = await fetchAllSwissDealerListings(dealerId);
    
    // Filter for professional sellers only (as per documentation)
    const professionalListings = listings.filter(listing => 
      listing.seller?.type === 'professional'
    );
    
    console.log(`🏪 Filtered to ${professionalListings.length} professional seller listings`);
    
    // Convert to standard format
    const standardListings = professionalListings.map(convertSwissListingToStandard);
    
    return {
      dealerId,
      totalListings: listings.length,
      professionalListings: professionalListings.length,
      listings: standardListings
    };
    
  } catch (error) {
    console.error(`❌ Error scraping Swiss dealer ${dealerUrl}:`, error.message);
    throw error;
  }
}

module.exports = {
  isSwissRegionUrl,
  extractDealerIdFromChUrl,
  fetchSwissDealerListings,
  fetchAllSwissDealerListings,
  fetchSwissListingById,
  scrapeSwissDealer,
  convertSwissListingToStandard,
  createDealerSearchPayload,
  createGeneralSearchPayload,
  getSwissApiHeaders,
  LISTINGS_SEARCH_ENDPOINT,
  API_BASE_URL,
  WEBSITE_BASE_URL
};
