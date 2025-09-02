const axios = require('axios');
const cheerio = require('cheerio');
const { extractNewAdvert } = require('./extractNewAdvert');
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
 * Process elements in parallel with a concurrency limit
 * @param {Array} elements - Array of cheerio elements to process
 * @param {Object} $$ - Cheerio instance
 * @param {Object} user - User object
 * @param {Object} control - Control object
 * @param {number} concurrencyLimit - Maximum number of concurrent operations
 */
async function processElementsInParallel(elements, $$, user, control, concurrencyLimit = process.env.ADVERT_PROCESSING_CONCURRENCY || 5) {
    const results = [];
    
    for (let i = 0; i < elements.length; i += concurrencyLimit) {
        const batch = elements.slice(i, i + concurrencyLimit);
        console.log(`🔄 Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(elements.length / concurrencyLimit)} (${batch.length} elements)`);
        
        const batchPromises = batch.map(async (element) => {
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
                        console.log(`🆕 Fetching details for new advert ID: ${articleId}`);
                        await extractNewAdvert(fullAdvertLink, articleId, user);
                        return { articleId, status: 'new' };
                    } else {
                        if (!existingAdvert.is_active) {
                            existingAdvert.is_active = true;
                            await existingAdvert.save();
                        }

                        console.log(`✅ Advert ID ${articleId} already exists.`);
                        return { articleId, status: 'existing' };
                    }
                }
                return { articleId: null, status: 'skipped' };
            } catch (error) {
                console.error(`❌ Error processing element:`, error.message);
                return { articleId: null, status: 'error', error: error.message };
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches to be respectful to the server
        if (i + concurrencyLimit < elements.length) {
            console.log('⏳ Waiting 1 second before next batch...');
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    return results;
}

// Utils moved to autoscoutApi.js for readability

/**
 * Swiss region scraping using AutoScout24.ch API
 */
async function searchAllPagesViaSwissApi(user, control) {
  try {
    console.log(`🇨🇭 Starting Swiss region scraping for user ${user.id}: ${user.autoscout_url}`);
    
    // Use the Swiss API service to scrape dealer listings
    const result = await scrapeSwissDealer(user.autoscout_url, user.id);
    
    console.log(`📊 Swiss API Results for user ${user.id}:`);
    console.log(`   Total listings: ${result.totalListings}`);
    console.log(`   Professional listings: ${result.professionalListings}`);
    
    // Process the listings similar to the Belgian flow
    const results = await processSwissListings(result.listings, user, control);
    
    const created = results.filter(r => r.status === 'fulfilled' && r.value.status === 'new').length;
    const existing = results.filter(r => r.status === 'fulfilled' && r.value.status === 'existing').length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length;
    
    console.log(`📊 Swiss processing summary for user ${user.id}: ${created} new, ${existing} existing, ${failed} failed`);
    console.log(`✅ Finished Swiss API scraping for user ${user.id}`);
    
  } catch (error) {
    console.error(`❌ Error in Swiss API scraping for user ${user.id}:`, error.message);
    throw error;
  }
}

/**
 * Create Swiss advert from API data
 */
async function createSwissAdvert(listing, user) {
  try {
    // Get the first image and add the Swiss image prefix
    const firstImage = listing.images && listing.images.length > 0 ? listing.images[0] : null;
    const imageUrl = firstImage ? `https://listing-images.autoscout24.ch/${firstImage.key}` : null;

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
      image_url: imageUrl,
      original_image_url: imageUrl
      // created_at will be automatically set to current timestamp by model default
    };

    // Create the advert
    const newAdvert = await Advert.create(advertData);
    console.log(`✅ [Swiss] Created new advert: ${listing.id} (${listing.make?.name} ${listing.model?.name})`);
    
    return newAdvert;
  } catch (error) {
    console.error(`❌ Error creating Swiss advert ${listing.id}:`, error.message);
    throw error;
  }
}

/**
 * Process Swiss listings with complete data from API
 */
async function processSwissListings(listings, user, control, concurrencyLimit = process.env.ADVERT_PROCESSING_CONCURRENCY || 5) {
  const results = [];
  const items = Array.isArray(listings) ? listings : [];
  
  console.log(`🔄 Processing ${items.length} Swiss listings for user ${user.id}`);
  
  for (let i = 0; i < items.length; i += concurrencyLimit) {
    const batch = items.slice(i, i + concurrencyLimit);
    const batchPromises = batch.map(async (listing) => {
      try {
        const articleId = listing?.id;
        if (!articleId) return { articleId: null, status: 'skipped' };

        // Convert to string for database comparison (autoscout_id is STRING in schema)
        const articleIdStr = String(articleId);
        
        const existingAdvert = await Advert.findOne({
          where: {
            autoscout_id: articleIdStr,
            seller_id: user.id
          }
        });

        if (!existingAdvert) {
          console.log(`🆕 [Swiss API] New advert: ${articleId}. Creating from API data...`);
          
          // Create new advert directly from Swiss API data
          await createSwissAdvert(listing, user);
          return { articleId, status: 'new' };
        } else {
          // Mark as active if it was inactive
          if (!existingAdvert.is_active) {
            existingAdvert.is_active = true;
            await existingAdvert.save();
          }

          // Update last seen date
          existingAdvert.last_seen = new Date();
          await existingAdvert.save();

         
          console.log(`✅ [Swiss] Advert ID ${articleId} marked as seen and updated.`);
          return { articleId, status: 'existing' };
        }
      } catch (e) {
        console.error(`❌ Error processing Swiss listing ${listing?.id}:`, e.message);
        return { articleId: listing?.id || null, status: 'error', error: e.message };
      }
    });
    
    const batchResults = await Promise.allSettled(batchPromises);
    results.push(...batchResults);
    
    if (i + concurrencyLimit < items.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  
  return results;
}

/**
 * New flow: Search all pages via dealer API rather than HTML pagination.
 * Logs the API data for each page.
 */
async function searchAllPagesViaApi(user, control) {
  try {
    // Check if this is a Swiss region URL and route accordingly
    if (isSwissRegionUrl(user.autoscout_url)) {
      console.log(`🇨🇭 Detected Swiss region URL: ${user.autoscout_url}`);
      return await searchAllPagesViaSwissApi(user, control);
    }
    
    console.log(`🇧🇪 Using Belgian region API for: ${user.autoscout_url}`);
    
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
            console.warn(`⚠️ 429 on ${label}. Waiting ${Math.round(waitMs / 1000)}s before retry...`);
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
    console.log("scraping user", user.id);
    console.log('customerId', customerId);
    if (!customerId) {
      console.error('❌ Could not resolve customerId from dealer page:', user.autoscout_url);
      return;
    }
    const cultureIso = resolveCultureIsoFromUrl(user.autoscout_url);
    const visitorCookie = await fetchWith429Retry('visitor cookie', () => getVisitorCookie());
    console.log(`🏷️ Using customerId=${customerId}, cultureIso=${cultureIso}`);

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
    console.log(`🧭 Found ${makeOptions.length} makes to scrape`);

    let totalListings = 0;

    // Process a single page worth of listings with concurrency control
    async function processApiListings(listings, concurrencyLimit = process.env.ADVERT_PROCESSING_CONCURRENCY || 5) {
      const results = [];
      const items = Array.isArray(listings) ? listings : [];
      for (let i = 0; i < items.length; i += concurrencyLimit) {
        const batch = items.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(async (listing) => {
          try {
            const articleId = listing?.id;
            if (!articleId) return { articleId: null, status: 'skipped' };

            const fullAdvertLink = `${advertBaseUrl}${articleId}`;
            const existingAdvert = await Advert.findOne({
              where: {
                autoscout_id: articleId,
                seller_id: user.id
              }
            });

            if (!existingAdvert) {
              console.log(`🆕 [API] New advert: ${articleId}. Extracting...`);
              await extractNewAdvert(fullAdvertLink, articleId, user);
              return { articleId, status: 'new' };
            }

            return { articleId, status: 'existing' };
          } catch (e) {
            console.error('❌ Error processing API listing:', e.message);
            return { articleId: listing?.id || null, status: 'error', error: e.message };
          }
        });
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        if (i + concurrencyLimit < items.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      return results;
    }

    // Per-make fetch function (single-call then pagination fallback)
    async function fetchMake(make) {
      console.log(`🔎 Fetching listings for makeId=${make.id} (${make.label})`);
      let page = 1;
      let safetyStop = 0;
      while (true) {
        safetyStop += 1;
        if (safetyStop > 100) {
          console.warn(`⚠️ Safety stop reached for make ${make.label}.`);
          break;
        }

        console.log(`📤 Posting to dealer API page=${page} for customerId=${customerId} makeId=${make.id}`);
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
          console.log(`📥 API page ${page} (${make.label}) returned ${count} listings`);
          if (count > 0) {
            const results = await processApiListings(items);
            const created = results.filter(r => r.status === 'fulfilled' && r.value.status === 'new').length;
            const exist = results.filter(r => r.status === 'fulfilled' && r.value.status === 'existing').length;
            const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length;
            console.log(`📊 API page ${page} (${make.label}): ${created} new, ${exist} existing, ${failed} failed`);
          }
          if (count === 0) break;
        } catch (e) {
          console.warn(`⚠️ Could not parse listings for make ${make.label}`);
          break;
        }

        page += 1;
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // Process makes with concurrency limit from env
    const makeConcurrency = Math.max(1, parseInt(process.env.MAKE_PROCESSING_CONCURRENCY || '3', 10));
    console.log(`🧵 Processing up to ${makeConcurrency} makes concurrently`);
    for (let i = 0; i < makeOptions.length; i += makeConcurrency) {
      const batch = makeOptions.slice(i, i + makeConcurrency);
      
      const batchPromises = batch.map((make) => fetchMake(make));
      await Promise.allSettled(batchPromises);
      // small delay between batches
      if (i + makeConcurrency < makeOptions.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    console.log(`✅ Finished API scraping for user ${user.id}. Total listings processed: ${totalListings}`);
  } catch (error) {
    console.error('❌ Error in searchAllPagesViaApi:', error.message);
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
  
      console.log(`📄 Total pages found: ${totalPages}`);
  
            for (let page = 1; page <= totalPages; page++) {
        console.log(
          `📥 Fetching content from page ${page}`
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
             console.log(`🔍 Found ${titleCountElements.length} elements with class 'dp-list__title__count sc-ellipsis sc-font-xl' on page ${page}`);
             
             titleCountElements.each((index, element) => {
               const elementText = $$(element).text().trim();
               console.log(`📋 Element ${index + 1} content: "${elementText}"`);
             });
           }
          const articles = $$('article');
          console.log(
            `📝 Found ${articles.length} <article> elements on page ${page}`
          );
          if(page === 1 && articles.length === 0){
            throw new Error('No articles found , url is not valid')
          }
          
          // Process elements in parallel
          const results = await processElementsInParallel(articles.toArray(), $$, user, control);
          
          // Log summary for this page
          const successful = results.filter(r => r.status === 'fulfilled' && r.value.status !== 'error').length;
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length;
          console.log(`📊 Page ${page} complete: ${successful} successful, ${failed} failed`);
          
        } catch (error) {
          console.error(
            `❌ Error fetching content from page ${page}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(
        `❌ Error fetching content:`,
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
      console.log(`\n🔗 Scraping with sort: ${sortOption.text} (${sortOption.value}, desc: ${sortOption.desc})`);
      // 3. Call your existing searchAllPages logic for this sort
      await searchAllPages({ ...user, autoscout_url: url }, control);
    }
  } catch (error) {
    console.error('❌ Error in searchAllPagesWithAllSorts:', error.message);
  }
}

  module.exports = {
    searchAllPages,
    searchAllPagesWithAllSorts,
    searchAllPagesViaApi,
    searchAllPagesViaSwissApi
  }