#!/usr/bin/env node

/**
 * Test script to verify the database query for finding adverts without images
 */

const { Op } = require('sequelize');
const { Advert } = require('./models');

async function testQuery() {
  try {
    console.log('🔍 Testing database query for adverts without images...');
    
    // Test the exact query used in imageFetcher.js
    const whereConditions = {
      [Op.or]: [
        { image_url: { [Op.is]: null } },
        { image_url: '' }
      ],
      is_active: true
    };
    
    console.log('📊 Query conditions:', JSON.stringify(whereConditions, null, 2));
    
    // Count total adverts
    const totalAdverts = await Advert.count();
    console.log(`📊 Total adverts in database: ${totalAdverts}`);
    
    // Count adverts without images
    const advertsWithoutImages = await Advert.count({
      where: whereConditions
    });
    console.log(`📊 Adverts without images (active only): ${advertsWithoutImages}`);
    
    // Count all adverts without images (including inactive)
    const allAdvertsWithoutImages = await Advert.count({
      where: {
        [Op.or]: [
          { image_url: { [Op.is]: null } },
          { image_url: '' }
        ]
      }
    });
    console.log(`📊 All adverts without images (including inactive): ${allAdvertsWithoutImages}`);
    
    // Sample a few records to see what they look like
    const sampleAdverts = await Advert.findAll({
      where: whereConditions,
      limit: 5,
      attributes: ['id', 'autoscout_id', 'make', 'model', 'price_currency', 'image_url', 'original_image_url', 'is_active']
    });
    
    console.log('\n📋 Sample adverts without images:');
    sampleAdverts.forEach((advert, index) => {
      console.log(`${index + 1}. ID: ${advert.autoscout_id}, Make: ${advert.make}, Model: ${advert.model}`);
      console.log(`   Currency: ${advert.price_currency || 'null'}, Image URL: ${advert.image_url || 'null'}`);
      console.log(`   Active: ${advert.is_active}`);
    });
    
    // Test Swiss vs Normal breakdown
    const swissWithoutImages = await Advert.count({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { image_url: { [Op.is]: null } },
              { image_url: '' }
            ]
          },
          { price_currency: 'CHF' },
          { is_active: true }
        ]
      }
    });
    
    const normalWithoutImages = await Advert.count({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { image_url: { [Op.is]: null } },
              { image_url: '' }
            ]
          },
          {
            [Op.or]: [
              { price_currency: { [Op.is]: null } },
              { price_currency: '' }
            ]
          },
          { is_active: true }
        ]
      }
    });
    
    console.log(`\n🇨🇭 Swiss adverts without images: ${swissWithoutImages}`);
    console.log(`🌍 Normal adverts without images: ${normalWithoutImages}`);
    
    if (advertsWithoutImages > 0) {
      console.log('\n✅ Query is working! Found adverts without images.');
      console.log('💡 You can now run: node fetchImages.js');
    } else {
      console.log('\n⚠️  No adverts found without images. This could mean:');
      console.log('   1. All adverts already have images');
      console.log('   2. The query conditions need adjustment');
      console.log('   3. There are no active adverts in the database');
    }
    
  } catch (error) {
    console.error('❌ Error testing query:', error.message);
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testQuery().then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { testQuery };
