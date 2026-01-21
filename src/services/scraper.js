const axios = require('axios');
const cheerio = require('cheerio');
const { extractNewAdvert } = require('./extractNewAdvert');
const { uploadImage } = require('./awsService');
const { Advert, Control, AutoScoutInventory } = require('../../models');
const {
  resolveCultureIsoFromUrl,
  getVisitorCookie,
  extractCustomerIdFromHtml,
  extractMakeOptionsFromHtml,
  fetchDealerListings,
  getHttpsAgent,
} = require('./autoscoutApi');
const {
  isSwissRegionUrl,
  scrapeSwissDealer,
} = require('./autoscoutChApi');

const advertBaseUrl = 'https://www.autoscout24.com/offers/';

/**
 * Aggressive memory cleanup utility
 */
function forceMemoryCleanup(context = 'unknown') {
  if (global.gc) {
    // Run garbage collection multiple times for thorough cleanup
    global.gc();
    setTimeout(() => global.gc(), 50);
    setTimeout(() => global.gc(), 100);
    
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    console.log(`[SCRAPER] 🧹 Aggressive cleanup (${context}): ${heapUsedMB}MB used / ${heapTotalMB}MB total (${heapPercent}%)`);
    
    // If still high memory usage, try more aggressive cleanup
    if (heapPercent > 80) {
      console.log(`[SCRAPER] ⚠️ High memory usage detected (${heapPercent}%), performing additional cleanup...`);
      setTimeout(() => {
        if (global.gc) {
          global.gc();
          global.gc();
        }
      }, 200);
    }
  }
}

/**
 * Process elements sequentially to prevent memory overflow
 * @param {Array} elements - Array of cheerio elements to process
 * @param {Object} $$ - Cheerio instance
 * @param {Object} user - User object
 * @param {Object} control - Control object
 */
async function processElementsSequentially(elements, $$, user, control) {
    let newCount = 0;
    let existingCount = 0;
    let errorCount = 0;
    
    console.log(`[SCRAPER] 🔄 Processing ${elements.length} elements sequentially`);
    
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        console.log(`[SCRAPER] 📋 Processing element ${i + 1}/${elements.length}`);
        
        try {
            const articleId = $$(element).attr('id');
            const advertLink = $$(element).find('a').first().attr('href');

            if (articleId && advertLink) {
                const fullAdvertLink = `${advertBaseUrl}${articleId}`;
                
                const existingAdvert = await Advert.findOne({
                    where: { 
                      autoscout_id: articleId,
                      seller_id : user.id
                     },
                });

                if (!existingAdvert) {
                    console.log(`[SCRAPER] 🆕 Fetching details for new advert ID: ${articleId}`);
                    await extractNewAdvert(fullAdvertLink, articleId, user, isInitialRun);
                    newCount++;
                } else {
                    if (!existingAdvert.is_active) {
                        existingAdvert.is_active = true;
                        await existingAdvert.save();
                    }

                    console.log(`[SCRAPER] ✅ Advert ID ${articleId} already exists.`);
                    existingCount++;
                }
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`[SCRAPER] ❌ Error processing element:`, error.message);
            errorCount++;
        }
        
        // Aggressive memory cleanup every 2 elements for HTML processing
        if ((i + 1) % 2 === 0) {
            forceMemoryCleanup(`HTML element ${i + 1}/${elements.length}`);
        }
        
        // Small delay between elements for memory cleanup and server respect
        if (i < elements.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return {
        new: newCount,
        existing: existingCount,
        error: errorCount
    };
}

// Utils moved to autoscoutApi.js for readability

/**
 * Swiss region scraping using AutoScout24.ch API
 */
async function searchAllPagesViaSwissApi(user, control, isInitialRun = false) {
  try {
    console.log(`[SCRAPER] 🇨🇭 Starting Swiss region scraping for user ${user.id}: ${user.autoscout_url}`);
    
    // Use the Swiss API service to scrape dealer listings
    const result = await scrapeSwissDealer(user.autoscout_url, user.id);
    
    console.log(`[SCRAPER] 📊 Swiss API Results for user ${user.id}:`);
    console.log(`[SCRAPER]    Total listings: ${result.totalListings}`);
    console.log(`[SCRAPER]    Professional listings: ${result.professionalListings}`);
    
    // Process the listings sequentially to prevent memory overflow
    const results = await processSwissListingsSequentially(result.listings, user, control, isInitialRun);
    
    const { summary } = results;
    
    console.log(`[SCRAPER] 📊 Swiss processing summary for user ${user.id}: ${summary.new} new, ${summary.existing} existing, ${summary.error} failed`);
    console.log(`[SCRAPER] ✅ Finished Swiss API scraping for user ${user.id}`);
    
    // Final garbage collection for this Swiss user
    if (global.gc) {
      global.gc();
      console.log(`[SCRAPER] 🧹 Final garbage collection for Swiss user ${user.id}`);
    }
    
    // Return comprehensive statistics for Swiss scraping
    return {
      totalListings: result.totalListings || 0,
      newListings: summary.new || 0,
      existingListings: summary.existing || 0,
      errorCount: summary.error || 0,
      professionalListings: result.professionalListings || 0
    };
    
  } catch (error) {
    console.error(`[SCRAPER] ❌ Error in Swiss API scraping for user ${user.id}:`, error.message);
    
    // Garbage collection even on error to free memory
    if (global.gc) {
      global.gc();
      console.log(`[SCRAPER] 🧹 Error cleanup - garbage collection for Swiss user ${user.id}`);
    }
    
    // Re-throw the error
    throw error;
  }
}

/**
 * Create Swiss advert from API data
 */
async function createSwissAdvert(listing, user, isInitialRun = false) {
  try {
    // Get the first image and add the Swiss image prefix
    const firstImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;
    const originalImageUrl = firstImage ? `https://listing-images.autoscout24.ch/${firstImage.key}` : null;
    
    // Upload image to MinIO and get the MinIO URL
    let minioImageUrl = null;
    if (originalImageUrl) {
      console.log(`[SCRAPER] 🇨🇭 Uploading Swiss image to MinIO: ${originalImageUrl}`);
      minioImageUrl = await uploadImage(originalImageUrl, String(listing.id));
      if (minioImageUrl) {
        console.log(`[SCRAPER] ✅ Swiss image uploaded to MinIO: ${minioImageUrl}`);
      } else {
        console.log(`[SCRAPER] ⚠️ Failed to upload Swiss image to MinIO, using original URL`);
      }
    }

    // Map Swiss API data to our database structure
    const advertData = {
      autoscout_id: String(listing.id), // Convert to string as required by database schema
      seller_id: user.id,
      seller_name: listing.seller?.name || '',
      first_registration: listing.firstRegistrationDate ? new Date(listing.firstRegistrationDate) : null,
      is_active: true,
      last_seen: new Date(),
      make: listing.make?.name || '',
      model: listing.versionFullName || listing.model?.name || '',
      model_version: listing.versionFullName || '',
      location: listing.seller?.city ? `${listing.seller.city} ${listing.seller.zipCode || ''}`.trim() : '',
      price: listing.price || 0,
      price_currency: 'CHF', // Swiss currency
      type: listing.conditionType || '',
      mileage: listing.mileage ? String(listing.mileage) : '',
      power: listing.horsePower ? `${listing.horsePower} HP` : '',
      gearbox: listing.transmissionTypeGroup || '',
      fuel_type: listing.fuelType || '',
      description: listing.teaser || '',
      link: `https://www.autoscout24.ch/de/d/${listing.id}`,
      image_url: minioImageUrl || originalImageUrl, // Use MinIO URL if available, fallback to original
      original_image_url: originalImageUrl,
      is_initial_run_listing: isInitialRun
      // created_at will be automatically set to current timestamp by model default
    };

    // Create the advert
    const newAdvert = await Advert.create(advertData);
    if (isInitialRun) {
      console.log(`[SCRAPER] ✅ [Swiss] Created new INITIAL RUN advert: ${listing.id} (${listing.make?.name} ${listing.model?.name})`);
    } else {
      console.log(`[SCRAPER] ✅ [Swiss] Created new advert: ${listing.id} (${listing.make?.name} ${listing.model?.name})`);
    }
    
    return newAdvert;
  } catch (error) {
    console.error(`[SCRAPER] ❌ Error creating Swiss advert ${listing.id}:`, error.message);
    throw error;
  }
}

/**
 * Process Swiss listings sequentially to prevent memory overflow
 */
async function processSwissListingsSequentially(listings, user, control, isInitialRun = false) {
  let newCount = 0;
  let existingCount = 0;
  let errorCount = 0;
  const items = Array.isArray(listings) ? listings : [];
  
  console.log(`[SCRAPER] 🔄 Processing ${items.length} Swiss listings sequentially for user ${user.id}`);
  
  for (let i = 0; i < items.length; i++) {
    const listing = items[i];
    console.log(`[SCRAPER] 📋 Processing Swiss listing ${i + 1}/${items.length}`);
    
    try {
      const articleId = listing?.id;
      if (!articleId) {
        errorCount++;
        continue;
      }

      // Convert to string for database comparison (autoscout_id is STRING in schema)
      const articleIdStr = String(articleId);
      
      const existingAdvert = await Advert.findOne({
        where: {
          autoscout_id: articleIdStr,
          seller_id: user.id
        }
      });

      if (!existingAdvert) {
        console.log(`[SCRAPER] 🆕 [Swiss API] New advert: ${articleId}. Creating from API data...`);
        
        // Create new advert directly from Swiss API data
        await createSwissAdvert(listing, user, isInitialRun);
        newCount++;
      } else {
        // Mark as active if it was inactive
        if (!existingAdvert.is_active) {
          existingAdvert.is_active = true;
          await existingAdvert.save();
        }

        // Update last seen date
        existingAdvert.last_seen = new Date();
        await existingAdvert.save();

        console.log(`[SCRAPER] ✅ [Swiss] Advert ID ${articleId} marked as seen and updated.`);
        existingCount++;
      }
    } catch (e) {
      console.error(`[SCRAPER] ❌ Error processing Swiss listing ${listing?.id}:`, e.message);
      errorCount++;
    }
    
    // Aggressive memory cleanup every 3 listings for Swiss processing
    if ((i + 1) % 3 === 0) {
      forceMemoryCleanup(`Swiss listing ${i + 1}/${items.length}`);
      
      // Clear any potential references
      listing.images = null;
      listing.seller = null;
    }
    
    // Small delay between listings for memory cleanup and server respect
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  
  // Return summary counts instead of full results array
  return {
    summary: {
      new: newCount,
      existing: existingCount,
      error: errorCount,
      total: items.length
    }
  };
}

/**
 * New flow: Search all pages via dealer API rather than HTML pagination.
 * Logs the API data for each page.
 */
async function searchAllPagesViaApi(user, control, isInitialRun = false) {
  try {
    // Check if this is a Swiss region URL and route accordingly
    if (isSwissRegionUrl(user.autoscout_url)) {
      console.log(`[SCRAPER] 🇨🇭 Detected Swiss region URL: ${user.autoscout_url}`);
      return await searchAllPagesViaSwissApi(user, control, isInitialRun);
    }
    
    console.log(`[SCRAPER] 🇧🇪 Using Belgian region API for: ${user.autoscout_url}`);
    
    // Load dealer page to get customerId and set a realistic referer
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fetchWith429Retry = async (label, fn) => {
      // Keep trying until not rate limited
      while (true) {
        try {
          return await fn();
        } catch (err) {
          const status = err?.response?.status;
          if (status === 429) {
            const retryAfterHeader = err.response.headers?.['retry-after'];
            const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
            const waitMs = (retryAfterSec && !Number.isNaN(retryAfterSec))
              ? retryAfterSec * 1000
              : parseInt(process.env.RATE_LIMIT_WAIT_MS || '60000', 10);
            console.warn(`[SCRAPER] ⚠️ 429 on ${label}. Waiting ${Math.round(waitMs / 1000)}s before retry...`);
            await sleep(waitMs);
            continue;
          }
          throw err;
        }
      }
    };

    const dealerRes = await fetchWith429Retry('dealer page', () => axios.get(user.autoscout_url, {
      httpsAgent: getHttpsAgent(),
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept-language': 'fr-BE,fr;q=0.9,en;q=0.8'
      }
    }));
    const html = dealerRes.data;
    const customerId = await extractCustomerIdFromHtml(html);
    console.log("[SCRAPER] scraping user", user.id);
    console.log('[SCRAPER] customerId', customerId);
    if (!customerId) {
      console.error('[SCRAPER] ❌ Could not resolve customerId from dealer page:', user.autoscout_url);
      return;
    }
    const cultureIso = resolveCultureIsoFromUrl(user.autoscout_url);
    const visitorCookie = await fetchWith429Retry('visitor cookie', () => getVisitorCookie());
    console.log(`[SCRAPER] 🏷️ Using customerId=${customerId}, cultureIso=${cultureIso}`);

    // Extract brand options from page
    function extractMakeOptionsFromHtml(html) {
      const $ = cheerio.load(html);
      const options = [];
      $('select[data-testid="brand-select"] option').each((_, el) => {
        const value = $(el).attr('value');
        const label = $(el).attr('data-label') || $(el).text();
        const idNum = parseInt(value, 10);
        if (!Number.isNaN(idNum) && idNum > 0) {
          options.push({ id: idNum, label: (label || '').trim() });
        }
      });
      // Fallback selectors if data-testid differs
      if (options.length === 0) {
        $('div.dp-filter-section.dp-brand-model select option').each((_, el) => {
          const value = $(el).attr('value');
          const label = $(el).attr('data-label') || $(el).text();
          const idNum = parseInt(value, 10);
          if (!Number.isNaN(idNum) && idNum > 0) {
            options.push({ id: idNum, label: (label || '').trim() });
          }
        });
      }
      return options;
    }

    const makeOptions = extractMakeOptionsFromHtml(html);
    console.log(`[SCRAPER] 🧭 Found ${makeOptions.length} makes to scrape`);

    let totalListings = 0;
    let totalNewListings = 0;
    let totalExistingListings = 0;
    let totalErrorCount = 0;

    // Process listings sequentially to prevent memory overflow
    async function processApiListingsSequentially(listings) {
      let newCount = 0;
      let existingCount = 0;
      let errorCount = 0;
      const items = Array.isArray(listings) ? listings : [];
      
      console.log(`[SCRAPER] 🔄 Processing ${items.length} API listings sequentially`);
      
      for (let i = 0; i < items.length; i++) {
        const listing = items[i];
        console.log(`[SCRAPER] 📋 Processing API listing ${i + 1}/${items.length}`);
        
        try {
          const articleId = listing?.id;
          if (!articleId) {
            errorCount++;
            continue;
          }

          const fullAdvertLink = `${advertBaseUrl}${articleId}`;
          const existingAdvert = await Advert.findOne({
            where: {
              autoscout_id: articleId,
              seller_id: user.id
            }
          });

          if (!existingAdvert) {
            console.log(`[SCRAPER] 🆕 [API] New advert: ${articleId}. Extracting...`);
            await extractNewAdvert(fullAdvertLink, articleId, user, isInitialRun);
            newCount++;
          } else {
            existingCount++;
          }
        } catch (e) {
          console.error('[SCRAPER] ❌ Error processing API listing:', e.message);
          errorCount++;
        }
        
        // Aggressive memory cleanup every 3 listings
        if ((i + 1) % 3 === 0) {
          forceMemoryCleanup(`API listing ${i + 1}/${items.length}`);
        }
        
        // Small delay between listings for memory cleanup and server respect
        if (i < items.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      
      return {
        new: newCount,
        existing: existingCount,
        error: errorCount
      };
    }

    // Per-make fetch function (single-call then pagination fallback)
    async function fetchMake(make) {
      console.log(`[SCRAPER] 🔎 Fetching listings for makeId=${make.id} (${make.label})`);
      let page = 1;
      let safetyStop = 0;
      while (true) {
        safetyStop += 1;
        if (safetyStop > 100) {
          console.warn(`[SCRAPER] ⚠️ Safety stop reached for make ${make.label}.`);
          break;
        }

        console.log(`[SCRAPER] 📤 Posting to dealer API page=${page} for customerId=${customerId} makeId=${make.id}`);
        const data = await fetchWith429Retry('dealer listings', () => fetchDealerListings({
          customerId,
          page,
          cultureIso,
          referer: user.autoscout_url,
          visitorCookie,
          makeId: make.id
        }));
        try {
          const items = data?.listings || data?.result?.listings || data?.data || [];
          const count = Array.isArray(items) ? items.length : 0;
          totalListings += count;
          console.log(`[SCRAPER] 📥 API page ${page} (${make.label}) returned ${count} listings`);
          if (count > 0) {
            const results = await processApiListingsSequentially(items);
            console.log(`[SCRAPER] 📊 API page ${page} (${make.label}): ${results.new} new, ${results.existing} existing, ${results.error} failed`);
            
            // Accumulate totals
            totalNewListings += results.new;
            totalExistingListings += results.existing;
            totalErrorCount += results.error;
            
            // Clear items array to free memory
            items.length = 0;
          }
          if (count === 0) break;
        } catch (e) {
          console.warn(`[SCRAPER] ⚠️ Could not parse listings for make ${make.label}`);
          break;
        }

        page += 1;
        
        // Force garbage collection after each page if available
        if (global.gc) {
          global.gc();
          console.log(`[SCRAPER] 🧹 Garbage collection triggered after page ${page - 1}`);
        }
        
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Process makes sequentially to prevent memory overflow
    console.log(`[SCRAPER] 🧵 Processing ${makeOptions.length} makes sequentially`);
    for (let i = 0; i < makeOptions.length; i++) {
      const make = makeOptions[i];
      console.log(`[SCRAPER] 📋 Processing make ${i + 1}/${makeOptions.length}: ${make.label}`);
      
      try {
        await fetchMake(make);
        console.log(`[SCRAPER] ✅ Completed make: ${make.label}`);
      } catch (error) {
        console.error(`[SCRAPER] ❌ Error processing make ${make.label}:`, error.message);
      }
      
      // Force garbage collection after each make if available
      if (global.gc) {
        global.gc();
        console.log(`[SCRAPER] 🧹 Garbage collection triggered after make: ${make.label}`);
      }
      
      // Delay between makes for memory cleanup and server respect
      if (i < makeOptions.length - 1) {
        console.log('[SCRAPER] ⏳ Waiting 2 seconds before next make...');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log(`[SCRAPER] ✅ Finished API scraping for user ${user.id}. Total listings processed: ${totalListings}`);
    console.log(`[SCRAPER] 📊 Final statistics: ${totalNewListings} new, ${totalExistingListings} existing, ${totalErrorCount} errors`);
    
    // Final garbage collection for this user
    if (global.gc) {
      global.gc();
      console.log(`[SCRAPER] 🧹 Final garbage collection for user ${user.id}`);
    }
    
    // Return comprehensive statistics
    return {
      totalListings: totalListings,
      newListings: totalNewListings,
      existingListings: totalExistingListings,
      errorCount: totalErrorCount
    };
    
  } catch (error) {
    console.error('[SCRAPER] ❌ Error in searchAllPagesViaApi:', error.message);
    
    // Garbage collection even on error to free memory
    if (global.gc) {
      global.gc();
      console.log(`[SCRAPER] 🧹 Error cleanup - garbage collection for user ${user.id}`);
    }
    
    // Re-throw the error with empty statistics
    throw error;
  }
}

async function searchAllPages(user, control) {
    try {
      const response = await axios.get(user.autoscout_url);
      const $ = cheerio.load(response.data);
  
      const totalPages = parseInt(
        $('li.pagination-item--disabled.pagination-item--page-indicator span')
          .text()
          .split('/')[1]
          ?.trim() || '1'
      );
  
      console.log(`[SCRAPER] 📄 Total pages found: ${totalPages}`);
  
            for (let page = 1; page <= totalPages; page++) {
        console.log(
          `[SCRAPER] 📥 Fetching content from page ${page}`
        );

        try {
          // Construct URL with page parameter
          const pageUrl = user.autoscout_url.includes('?') 
            ? `${user.autoscout_url}&page=${page}` 
            : `${user.autoscout_url}?page=${page}`;
          const pageResponse = await axios.get(pageUrl);
          const $$ = cheerio.load(pageResponse.data);

                                // On first run (page 1), get and log the elements with specified class
           if (page === 1) {
             const titleCountElements = $$('.dp-list__title__count.sc-ellipsis.sc-font-xl');
             console.log(`[SCRAPER] 🔍 Found ${titleCountElements.length} elements with class 'dp-list__title__count sc-ellipsis sc-font-xl' on page ${page}`);
             
             titleCountElements.each((index, element) => {
               const elementText = $$(element).text().trim();
               console.log(`[SCRAPER] 📋 Element ${index + 1} content: "${elementText}"`);
             });
           }
          const articles = $$('article');
          console.log(
            `[SCRAPER] 📝 Found ${articles.length} <article> elements on page ${page}`
          );
          if(page === 1 && articles.length === 0){
            throw new Error('No articles found , url is not valid')
          }
          
          // Process elements sequentially
          const results = await processElementsSequentially(articles.toArray(), $$, user, control);
          
          // Log summary for this page
          console.log(`[SCRAPER] 📊 Page ${page} complete: ${results.new} new, ${results.existing} existing, ${results.error} failed`);
          
        } catch (error) {
          console.error(
            `[SCRAPER] ❌ Error fetching content from page ${page}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        `[SCRAPER] ❌ Error fetching content:`,
        error.message
      );
    }
  }

/**
 * Returns the predefined sorting options with desc parameter.
 * @returns {Array<{value: string, text: string, desc: number}>}
 */
function getSortingOptions() {
   return [
    { value: 'age', text: 'Latest Offer First', desc: 1 },
  ];
  // return [
  //   { value: 'age', text: 'Latest Offer First', desc: 1 },
  //   { value: 'standard', text: 'Standard results', desc: 0 },
  //   { value: 'price', text: 'Price Ascending', desc: 0 },
  //   { value: 'price', text: 'Price Descending', desc: 1 },
  //   { value: 'mileage', text: 'Mileage Ascending', desc: 0 },
  //   { value: 'mileage', text: 'Mileage Descending', desc: 1 },
  //   { value: 'power', text: 'Power Ascending', desc: 0 },
  //   { value: 'power', text: 'Power Descending', desc: 1 },
  //   { value: 'year', text: 'First Registration Ascending', desc: 0 },
  //   { value: 'year', text: 'First Registration Descending', desc: 1 }
  // ];
}

/**
 * Scrapes all pages for all sorting options for a user.
 * @param {Object} user - The user object (must have autoscout_url).
 * @param {Object} control - The control object.
 */
async function searchAllPagesWithAllSorts(user, control) {
  try {

 
    // 1. Get all sorting options
    const sortingOptions = getSortingOptions();
    for (const sortOption of sortingOptions) {
      // 2. Construct URL with sort and desc parameters
      let url = user.autoscout_url;
      // Remove any existing sort and desc params
      url = url.replace(/([&?])sort=[^&]*/g, '$1').replace(/[?&]$/, '');
      url = url.replace(/([&?])desc=[^&]*/g, '$1').replace(/[?&]$/, '');
      // Add sort and desc params
      url += (url.includes('?') ? '&' : '?') + `sort=${encodeURIComponent(sortOption.value)}&desc=${sortOption.desc}`;
      console.log(`\n[SCRAPER] 🔗 Scraping with sort: ${sortOption.text} (${sortOption.value}, desc: ${sortOption.desc})`);
      // 3. Call your existing searchAllPages logic for this sort
      await searchAllPages({ ...user, autoscout_url: url }, control);
    }
  } catch (error) {
    console.error('[SCRAPER] ❌ Error in searchAllPagesWithAllSorts:', error.message);
  }
}

  module.exports = {
    searchAllPages,
    searchAllPagesWithAllSorts,
    searchAllPagesViaApi,
    searchAllPagesViaSwissApi
  }