const axios = require('axios');
const cheerio = require('cheerio');
const { extractNewAdvert } = require('./extractNewAdvert');
const { Advert, Control, SeenInfo, AutoScoutInventory } = require('../../models');
const {
  resolveCultureIsoFromUrl,
  getVisitorCookie,
  extractCustomerIdFromHtml,
  extractMakeOptionsFromHtml,
  fetchDealerListings,
} = require('./autoscoutApi');

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

                        const seenInfo = await SeenInfo.findOne({
                            where: { control_id: control.id, advert_id: articleId },
                        });

                        if (seenInfo) {
                            seenInfo.seen = true;
                            await seenInfo.save();
                          }
                          else{
                            const seenInfo = await SeenInfo.create({
                              control_id: control.id,
                              advert_id: articleId,
                              seen: true,
                            });
                          }
                          console.log(`✅ Advert ID ${articleId} marked as seen.`);
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
 * New flow: Search all pages via dealer API rather than HTML pagination.
 * Logs the API data for each page.
 */
async function searchAllPagesViaApi(user, control) {
  try {
    // Load dealer page to get customerId and set a realistic referer
    const dealerRes = await axios.get(user.autoscout_url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept-language': 'fr-BE,fr;q=0.9,en;q=0.8'
      }
    });
    const html = dealerRes.data;
    const customerId = extractCustomerIdFromHtml(html);
    console.log("scraping user", user.id);
    console.log('customerId', customerId);
    if (!customerId) {
      console.error('❌ Could not resolve customerId from dealer page:', user.autoscout_url);
      return;
    }
    const cultureIso = resolveCultureIsoFromUrl(user.autoscout_url);
    const visitorCookie = await getVisitorCookie();
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
      // Single-call attempt
      try {
        const firstData = await fetchDealerListings({
          customerId,
          cultureIso,
          referer: user.autoscout_url,
          visitorCookie,
          makeId: make.id
        });
        const firstItems = firstData?.listings || firstData?.result?.listings || firstData?.data || [];
        const firstCount = Array.isArray(firstItems) ? firstItems.length : 0;
        console.log(`📥 Single-call (make ${make.label}) returned ${firstCount} listings`);
        if (firstCount > 0) {
          const results = await processApiListings(firstItems);
          const created = results.filter(r => r.status === 'fulfilled' && r.value.status === 'new').length;
          const exist = results.filter(r => r.status === 'fulfilled' && r.value.status === 'existing').length;
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status === 'error')).length;
          console.log(`📊 Single-call (${make.label}): ${created} new, ${exist} existing, ${failed} failed`);
          totalListings += firstCount;
          if (firstCount > 20) {
            console.log(`✅ Full data likely received for make ${make.label}. Skipping pagination.`);
            return;
          }
        }
      } catch (e) {
        console.warn(`⚠️ Single-call failed for make ${make.label}, falling back to pagination:`, e.message);
      }

      // Fallback to pagination per make
      let page = 1;
      let safetyStop = 0;
      while (true) {
        safetyStop += 1;
        if (safetyStop > 100) {
          console.warn(`⚠️ Safety stop reached for make ${make.label}.`);
          break;
        }

        console.log(`📤 Posting to dealer API page=${page} for customerId=${customerId} makeId=${make.id}`);
        const data = await fetchDealerListings({
          customerId,
          page,
          cultureIso,
          referer: user.autoscout_url,
          visitorCookie,
          makeId: make.id
        });
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
    searchAllPagesViaApi
  }