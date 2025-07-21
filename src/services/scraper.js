const axios = require('axios');
const cheerio = require('cheerio');
const {extractNewAdvert} = require('./extractNewAdvert');
const { Advert, Control, SeenInfo } = require('../../models');

const advertBaseUrl = 'https://www.autoscout24.com/offers/';

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
  
          const articles = $$('article');
          console.log(
            `📝 Found ${articles.length} <article> elements on page ${page}`
          );
  
          for (const element of articles.toArray()) {
            const articleId = $$(element).attr('id');
            const advertLink = $$(element).find('a').first().attr('href');
  
            if (articleId && advertLink) {
              const fullAdvertLink = `${advertBaseUrl}${articleId}`;
             
              const existingAdvert = await Advert.findOne({
                where: { autoscout_id: articleId },
              });
  
              if (!existingAdvert) {
                console.log(
                  `🆕 Fetching details for new advert ID: ${articleId}`
                );
                await extractNewAdvert(fullAdvertLink, articleId);
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
                  console.log(`✅ Advert ID ${articleId} marked as seen.`);
                }
              }
            }
          }
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

  module.exports = {
    searchAllPages
  }