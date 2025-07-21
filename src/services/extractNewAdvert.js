const axios = require('axios');
const cheerio = require('cheerio');
const AWS = require('aws-sdk');
const { Advert} = require('../../models');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

// Function to upload image to S3
async function uploadImageToS3(imageUrl, advertId) {
  try {
    if (!imageUrl) {
      console.log('No image URL found');
      return null;
    }

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `autoscout/${advertId}_${timestamp}.jpg`;
    
    // Upload to S3
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: filename,
      Body: imageResponse.data,
      ContentType: 'image/jpeg'
    };

    const uploadResult = await s3.upload(uploadParams).promise();
    console.log(`Image uploaded to S3: ${uploadResult.Location}`);
    
    return uploadResult.Location;
  } catch (error) {
    console.error('Error uploading image to S3:', error.message);
    return null;
  }
}

async function extractNewAdvert(advertUrl, advertId) {
  try {
    console.log(`Fetching advert page: ${advertUrl}`);
    const response = await axios.get(advertUrl);
    const html = response.data;

    const $ = cheerio.load(html);

    const make = $('.StageTitle_makeModelContainer__RyjBP').text().trim();
    const model = $('.StageTitle_modelVersion__Yof2Z').text().trim();
    const location = $('.scr-link.LocationWithPin_locationItem__tK1m5').text().trim();

    const price = $('.PriceInfo_price__XU0aF').text().trim();

    let sellerName = $('.CommonComponents_nameContainer__TtFCL').text().trim();

    if(!sellerName){
      sellerName = $('.TieredPricingRatingsSection_nameContainer__fMSj2').text().trim();
      console.log(sellerName) 
    }
    const extractDetail = (label) => {
      return $(`dt:contains("${label}")`).next('dd').text().trim();
    };
    
    // Extract image URL
    const imageUrl = $('img').eq(9).attr('src');
    console.log('Found image URL:', imageUrl);
    
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
    const fuelType = extractDetail('Fuel type');
    const fuelConsumption = extractDetail('Fuel consumption');
    const co2Emissions = extractDetail('CO₂-emissions');
    const power = extractDetail('Power');
    const gearbox = extractDetail('Gearbox');
    const engineSize = extractDetail('Engine size');
    const gears = extractDetail('Gears');
    const cylinders = extractDetail('Cylinders');
    const emptyWeight = extractDetail('Empty weight');
    const mileage = extractDetail('Mileage');

    const firstRegistrationRaw = extractDetail('First registration');
   
     
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

    console.log(`Extracted details for advert ID ${advertId}: \n`);
    console.log({
      make,
      model,
      location,
      price,
      sellerName,
      bodyType,
      type,
      drivetrain,
      seats,
      doors,
      countryVersion,
      colour,
      paint,
      upholsteryColour,
      upholstery,
      emissionClass,
      fuelType,
      fuelConsumption,
      co2Emissions,
      power,
      gearbox,
      engineSize,
      gears,
      cylinders,
      emptyWeight,
      mileage,
      firstRegistration,
      lastService,
      previousOwner,
      fullServiceHistory,
      s3ImageUrl,
    });

    // Save to database with image URL
    await Advert.create({
      autoscout_id: advertId,
      make: make.split(' ')[0] || 'Unknown Make',
      model: model.split(' ')[1] || 'Unknown Model',
      location: location || 'Unknown Location',
      price: parseFloat(price.replace(/[^0-9.]/g, '')) || 0,
      seller_name: sellerName || 'Unknown Seller',
      body_type: bodyType || 'Unknown Body Type',
      type: type || 'Unknown Type',
      drivetrain: drivetrain || 'Unknown Drivetrain',
      seats: parseInt(seats) || null,
      doors: parseInt(doors) || null,
      country_version: countryVersion || 'Unknown Country Version',
      colour: colour || 'Unknown Colour',
      paint: paint || 'Unknown Paint',
      upholstery_colour: upholsteryColour || 'Unknown Upholstery Colour',
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
    });
  } catch (error) {
    console.error(`Error fetching advert page: ${advertUrl}`, error.message);
  }
}

module.exports = { extractNewAdvert };
