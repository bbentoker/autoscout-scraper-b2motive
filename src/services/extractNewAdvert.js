const axios = require('axios');
const cheerio = require('cheerio');
const { uploadImageToS3 } = require('./awsService');
const { determineFuelType, determinePowerHP } = require('./gptService');
const { Advert} = require('../../models');

function extractFirstMileageValue(mileageRaw) {
  if (!mileageRaw || typeof mileageRaw !== 'string') {
    return null;
  }

  const kmPattern = /(\d{1,3}(?:[.,\s]\d{3})*|\d+)\s*km/gi;
  const matches = Array.from(mileageRaw.matchAll(kmPattern));

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    console.log('[SCRAPER] Multiple mileage values detected, using the first one:', mileageRaw);
  }

  const firstMatch = matches[0][0];
  return firstMatch.replace(/\s+/g, ' ').trim();
}

async function getListingInfos(advertUrl, advertId, user, isInitialRun = false) {
  try {
    console.log(`[SCRAPER] Fetching advert page: ${advertUrl}`);
    const response = await axios.get(advertUrl);

    const html = response.data;
    const $ = cheerio.load(html);

    const make = $('.StageTitle_makeModelContainer__RyjBP').text().trim();
    const model = $('.StageTitle_modelVersion__Yof2Z').text().trim();
    const location = $('.scr-link.LocationWithPin_locationItem__tK1m5').text().trim();

    const priceElement = $('.PriceInfo_price__XU0aF');
    const price = priceElement.contents().filter(function() {
      return this.type === 'text';
    }).text().trim();

    let sellerName = $('.CommonComponents_nameContainer__TtFCL').text().trim();

    if(!sellerName){
      sellerName = $('.TieredPricingRatingsSection_nameContainer__fMSj2').text().trim();
      console.log('[SCRAPER] Seller name:', sellerName) 
    }
    const extractDetail = (label) => {
      return $(`dt:contains("${label}")`).next('dd').text().trim();
    };
    
    // Extract image URL
    const imageUrl = $('img').eq(9).attr('src');
    console.log('[SCRAPER] Found image URL:', imageUrl);
    
    // Upload image to S3 and get the S3 URL
    const s3ImageUrl = await uploadImageToS3(imageUrl, advertId);
    
    const bodyType = extractDetail('Body type');
    const type = extractDetail('Type');
    const drivetrain = extractDetail('Drivetrain');
    const seats = extractDetail('Seats');
    const doors = extractDetail('Doors');
    const countryVersion = extractDetail('Country version');
    const colour = extractDetail('Colour');
    const paint = extractDetail('Paint');
    const upholsteryColour = extractDetail('Upholstery colour');
    const upholstery = extractDetail('Upholstery');
    const emissionClass = extractDetail('Emission class');
    const fuelTypeRaw = extractDetail('Fuel type');
    const fuelType = await determineFuelType(fuelTypeRaw);
    const fuelConsumption = extractDetail('Fuel consumption');
    const co2Emissions = extractDetail('CO₂-emissions');
    const powerRaw = extractDetail('Power');
    const power = await determinePowerHP(powerRaw);
    const gearbox = extractDetail('Gearbox');
    const engineSize = extractDetail('Engine size');
    const gears = extractDetail('Gears');
    const cylinders = extractDetail('Cylinders');
    const emptyWeight = extractDetail('Empty weight');
    const mileageRaw = extractDetail('Mileage');
    
    const mileage = extractFirstMileageValue(mileageRaw);
    const firstRegistrationRaw = extractDetail('First registration');
   
    console.log("[SCRAPER] First registration raw value:", firstRegistrationRaw);
    let firstRegistration = null;

    if (firstRegistrationRaw != null && firstRegistrationRaw != '-' && firstRegistrationRaw != '') {
      const [month, year] = firstRegistrationRaw.split('/');
     
      firstRegistration = new Date(`01-${month}-${year}`).toISOString(); 
    }
    else {
      firstRegistration = null;
    }
    const lastService = extractDetail('Last service');
    const previousOwner = extractDetail('Previous owner');
    const fullServiceHistory = extractDetail('Full service history');

    console.log(`[SCRAPER] Extracted details for advert ID ${advertId}: \n`);
    // console.log({
    //   make,
    //   model,
    //   location,
    //   price,
    //   sellerName,
    //   bodyType,
    //   type,
    //   drivetrain,
    //   seats,
    //   doors,
    //   countryVersion,
    //   colour,
    //   paint,
    //   upholsteryColour,
    //   upholstery,
    //   emissionClass,
    //   fuelType,
    //   fuelConsumption,
    //   co2Emissions,
    //   power,
    //   gearbox,
    //   engineSize,
    //   gears,
    //   cylinders,
    //   emptyWeight,
    //   mileage,
    //   firstRegistration,
    //   lastService,
    //   previousOwner,
    //   fullServiceHistory,
    //   s3ImageUrl,
    // });
    // Return the extracted data instead of saving to database
    return {
      seller_id: user.id,
      autoscout_id: advertId,
      make: make || 'Unknown Make',
      model: model || 'Unknown Model',
      location: location || 'Unknown Location',
      price: parseFloat(price.replace(/[^0-9.]/g, '')) || 0,
      seller_name: sellerName || 'Unknown Seller',
      body_type: bodyType || 'Unknown Body Type',
      type: type || 'Unknown Type',
      drivetrain: drivetrain || 'Unknown Drivetrain',
      seats: parseInt(seats) || null,
      doors: parseInt(doors) || null,
      color: colour || 'Unknown Colour',
      paint: paint || 'Unknown Paint',
      upholstery_color: upholsteryColour || 'Unknown Upholstery Colour',
      upholstery: upholstery || 'Unknown Upholstery',
      emission_class: emissionClass || 'Unknown Emission Class',
      fuel_type: fuelType || 'Unknown Fuel Type',
      fuel_consumption: fuelConsumption || 'Unknown Fuel Consumption',
      co_2_emissions: co2Emissions || 'Unknown CO₂ Emissions',
      power: power || 'Unknown Power',
      gearbox: gearbox || 'Unknown Gearbox',
      engine_size: engineSize || 'Unknown Engine Size',
      gears: parseInt(gears) || null,
      cylinders: parseInt(cylinders) || null,
      empty_weight: emptyWeight || 'Unknown Empty Weight',
      mileage: mileage || 'Unknown Mileage',
      first_registration: firstRegistration || null,
      last_service: lastService || 'Unknown Last Service',
      previous_owner: parseInt(previousOwner) || null,
      full_service_history: fullServiceHistory === 'Yes',
      image_url: s3ImageUrl || null,
      original_image_url: imageUrl || null,
      is_initial_run_listing: isInitialRun,
    };
  } catch (error) {
    console.error(`[SCRAPER] Error fetching advert page: ${advertUrl}`, error.message);
    throw error;
  }
}

// Keep the old function name for backward compatibility
async function extractNewAdvert(advertUrl, advertId, user, isInitialRun = false) {
  try {
    const extractedData = await getListingInfos(advertUrl, advertId, user, isInitialRun);
   
    // Check for existing listing with same characteristics (excluding autoscout_id and image URLs)
    const existingListing = await Advert.findOne({
      where: {
        make: extractedData.make,
        model: extractedData.model,
        seller_name: extractedData.seller_name,
        mileage: extractedData.mileage,
        location: extractedData.location,
        previous_owner: extractedData.previous_owner,
      }
    });
    if (existingListing) {
      console.log(`[SCRAPER] Found existing listing with ID: ${existingListing.id}. Updating autoscout_id and reactivating.`);
      
      // Update the existing listing with new autoscout_id and image URLs, and reactivate it
      await existingListing.update({
        autoscout_id: extractedData.autoscout_id,
        image_url: extractedData.image_url,
        original_image_url: extractedData.original_image_url,
        is_active: true,
        last_seen: new Date()
      });
      
      console.log(`[SCRAPER] Updated existing listing with new autoscout_id: ${extractedData.autoscout_id}`);
      return existingListing;
    } else {
      // No existing listing found, create new one
      if (isInitialRun) {
        console.log('[SCRAPER] No existing listing found. Creating new INITIAL RUN advert.');
      } else {
        console.log('[SCRAPER] No existing listing found. Creating new advert.');
      }
      const newAdvert = await Advert.create(extractedData);
      return newAdvert;
    }
  } catch (error) {
    console.error(`[SCRAPER] Error creating advert: ${advertUrl}`, error.message);
    throw error;
  }
}

module.exports = { extractNewAdvert, getListingInfos };
