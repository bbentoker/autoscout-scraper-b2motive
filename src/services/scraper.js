const axios = require('axios');
const cheerio = require('cheerio');
const {extractNewAdvert} = require('./extractNewAdvert');
const { Advert, Control, SeenInfo, AutoScoutInventory } = require('../../models');

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
    { value: 'standard', text: 'Standard results', desc: 0 },
    { value: 'price', text: 'Price Ascending', desc: 0 },
    { value: 'price', text: 'Price Descending', desc: 1 },
    { value: 'mileage', text: 'Mileage Ascending', desc: 0 },
    { value: 'mileage', text: 'Mileage Descending', desc: 1 },
    { value: 'power', text: 'Power Ascending', desc: 0 },
    { value: 'power', text: 'Power Descending', desc: 1 },
    { value: 'year', text: 'First Registration Ascending', desc: 0 },
    { value: 'year', text: 'First Registration Descending', desc: 1 }
  ];
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
    searchAllPagesWithAllSorts
  }