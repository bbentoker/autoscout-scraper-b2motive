const axios = require('axios');
const cheerio = require('cheerio');
const { Advert, Control } = require('../models');
const { extractNewAdvert } = require('./extractNewAdvert');
const fs = require('fs');
const JSONStream = require('JSONStream');

const { prices } = require('./priceList');
const { kmList } = require('./kmList');

const fileStream = fs.createReadStream('./car_makes_models.json', {
  encoding: 'utf-8',
});

// const fileStream = fs.createReadStream('./copy.json', {
//   encoding: 'utf-8',
// });

const baseUrl = 'https://www.autoscout24.com/lst';
const advertBaseUrl = 'https://www.autoscout24.com';

let sortingOptions = [
  { sort: 'standard', desc: 0 }, // Default sorting
  { sort: 'price', desc: 0 }, // Price Ascending
  { sort: 'price', desc: 1 }, // Price Descending
  { sort: 'age', desc: 1 }, // Latest Offer First
  { sort: 'mileage', desc: 0 }, // Mileage Ascending
  { sort: 'mileage', desc: 1 }, // Mileage Descending
  { sort: 'power', desc: 0 }, // Power Ascending
  { sort: 'power', desc: 1 }, // Power Descending
  { sort: 'year', desc: 0 }, // First Registration Ascending
  { sort: 'year', desc: 1 }, // First Registration Descending
];

sortingOptions = [{ sort: 'standard', desc: 0 }];

const commonParams = {
  custtype: 'D', //cars from dealers
  atype: 'C',
  cy: 'B',
  damaged_listing: 'exclude',
  page: 1,
  powertype: 'kw',
  source: 'listpage_pagination',
  ustate: 'N,U',
};

const CHECKPOINT_FILE = './checkpoint.json';

const saveCheckpoint = (make) => {
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify({ lastProcessedMake: make })
  );
};

const getCheckpoint = () => {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      return checkpoint.lastProcessedMake;
    }
  } catch (error) {
    console.error('Error reading checkpoint:', error);
  }
  return null;
};

const clearCheckpoint = () => {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
    }
  } catch (error) {
    console.error('Error clearing checkpoint:', error);
  }
};



async function searchAllPages(fullUrl, control, make, model) {
  try {
    const response = await axios.get(fullUrl);
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
        `📥 Fetching content from page ${page} for ${make} - ${model}`
      );

      try {
        const pageResponse = await axios.get(fullUrl.replace('{PAGE}', page));
        const $$ = cheerio.load(pageResponse.data);

        const articles = $$('article');
        console.log(
          `📝 Found ${articles.length} <article> elements on page ${page}`
        );

        for (const element of articles.toArray()) {
          const articleId = $$(element).attr('id');
          const advertLink = $$(element).find('a').first().attr('href');

          if (articleId && advertLink) {
            const fullAdvertLink = `${advertBaseUrl}${advertLink}`;
            const existingAdvert = await Advert.findOne({
              where: { id: articleId },
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
      `❌ Error fetching content for ${make} - ${model}:`,
      error.message
    );
  }
}
async function processMake(make, models, control) {
  console.log(`🚗 Processing Make: ${make}`);
  for (const model of models) {
    console.log(`📌 Model: ${model}`);

    // search for price
    for (let j = 0; j < prices.length - 1; j++) {
      for (let i = 0; i < sortingOptions.length; i++) {
        console.log(
          `🔄 Fetching for ${make} - ${model} (Sort: ${sortingOptions[i].sort}, Desc: ${sortingOptions[i].desc})`
        );
        console.log(`💰 Price from: ${prices[j]} to: ${prices[j + 1]}`);
        const params = new URLSearchParams({
          ...commonParams,
          sort: sortingOptions[i].sort,
          desc: sortingOptions[i].desc,
          make: make,
          model: model,
          pricefrom: prices[j],
        });

        const makeSlug = make.toLowerCase().replace(/\s+/g, '-');
        const modelSlug = model.toLowerCase().replace(/\s+/g, '-');
        const fullUrl = `${baseUrl}/${makeSlug}/${modelSlug}/pr_${
          prices[j + 1]
        }?${params.toString()}`;
        console.log(`🔗 URL: ${fullUrl} \n`);
        await searchAllPages(fullUrl, control, make, model);
      }
    }

    // search for km
    for (let j = 0; j < kmList.length - 1; j++) {
      for (let i = 0; i < sortingOptions.length; i++) {
        console.log(
          `🔄 Fetching for ${make} - ${model} (Sort: ${sortingOptions[i].sort}, Desc: ${sortingOptions[i].desc})`
        );
        console.log(`💰 KM from: ${kmList[j]} to: ${kmList[j + 1]}`);
        const params = new URLSearchParams({
          ...commonParams,
          sort: sortingOptions[i].sort,
          desc: sortingOptions[i].desc,
          make: make,
          model: model,
          kmfrom: kmList[j],
          kmto: kmList[j + 1],
        });

        const makeSlug = make.toLowerCase().replace(/\s+/g, '-');
        const modelSlug = model.toLowerCase().replace(/\s+/g, '-');
        const fullUrl = `${baseUrl}/${makeSlug}/${modelSlug}?${params.toString()}`;
        console.log(`🔗 URL: ${fullUrl} \n`);
        await searchAllPages(fullUrl, control, make, model);
      }
    }
  }
}

async function fetchAndParse() {
  const startTime = new Date(); // Capture start time
  console.log(`📅 Start Time: ${startTime.toISOString()}`);

  try {
    // Dynamically import p-map
    const pMap = (await import('p-map')).default;

    let control = await Control.create({ date: new Date() });
    console.log(`📌 Latest control ID: ${control.id}`);

    const jsonStream = fileStream.pipe(JSONStream.parse('$*'));
    const makes = [];

    // Collect all makes and models
    jsonStream.on('data', ({ key: make, value: models }) => {
      makes.push({ make, models });
    });

    await new Promise((resolve, reject) => {
      jsonStream.on('end', resolve);
      jsonStream.on('error', reject);
    });

    console.log(`✅ Collected ${makes.length} makes. Starting processing...`);

    const lastProcessedMake = getCheckpoint();
    let shouldProcess = !lastProcessedMake; // Start processing if no checkpoint exists

    await pMap(
      makes,
      async ({ make, models }) => {
        if (!shouldProcess && make === lastProcessedMake) {
          // Found the last processed make, start processing from next item
          shouldProcess = true;
          console.log(`🔄 Resuming from checkpoint: ${make}`);
          return;
        }

        if (shouldProcess) {
          console.log(`🚗 Processing Make: ${make}`);
          await processMake(make, models, control);
          saveCheckpoint(make);
        } else {
          console.log(`⏭️ Skipping already processed make: ${make}`);
        }
      },
      { concurrency: 10 }
    );

    // Clear checkpoint after successful completion
    clearCheckpoint();
    console.log(`✅ Completed processing all makes & models.`);
  } catch (error) {
    console.error(`❌ Error fetching content:`, error.message);
  } finally {
    const endTime = new Date(); // Capture end time
    const duration = (endTime - startTime) / 1000; // Duration in seconds
    console.log(`📅 End Time: ${endTime.toISOString()}`);
    console.log(`⏱️ Duration: ${duration} seconds`);
  }
}

module.exports = { fetchAndParse };
