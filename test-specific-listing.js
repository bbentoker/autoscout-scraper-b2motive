const {
  extractDealerIdFromChUrl,
  fetchAllSwissDealerListings,
  fetchSwissListingById,
  isSwissRegionUrl
} = require('./src/services/autoscoutChApi');
require('dotenv').config();

/**
 * Test specific Swiss dealer and find specific listing
 */

async function testSpecificListing() {
  try {
    console.log('🎯 SPECIFIC LISTING TESTER');
    console.log('==========================');
    
    const dealerUrl = 'https://www.autoscout24.ch/de/s/seller-60283';
    const targetListingId = '12699536';
    const targetListingUrl = 'https://www.autoscout24.ch/de/d/12699536';
    
    console.log(`🏢 Testing dealer: ${dealerUrl}`);
    console.log(`🎯 Looking for listing ID: ${targetListingId}`);
    console.log(`📄 Listing URL: ${targetListingUrl}\n`);
    
    // Step 1: Verify Swiss URL and extract dealer ID
    console.log('🔍 Step 1: Extracting dealer information...');
    if (!isSwissRegionUrl(dealerUrl)) {
      console.log('❌ Not a Swiss URL');
      return;
    }
    
    const dealerId = extractDealerIdFromChUrl(dealerUrl);
    if (!dealerId) {
      console.log('❌ Could not extract dealer ID');
      return;
    }
    
    console.log(`✅ Dealer ID: ${dealerId}`);
    
    // Step 2: Fetch all listings for this dealer
    console.log('\n📡 Step 2: Fetching all dealer listings...');
    const allListings = await fetchAllSwissDealerListings(dealerId);
    
    console.log(`📊 Total listings from dealer: ${allListings.length}`);
    
    // Step 3: Search for the specific listing
    console.log(`\n🔍 Step 3: Searching for listing ID ${targetListingId}...`);
    
    const targetListing = allListings.find(listing => String(listing.id) === targetListingId);
    
    if (!targetListing) {
      console.log(`❌ Listing ${targetListingId} NOT FOUND in dealer's listings`);
      console.log('\n📋 Available listing IDs from this dealer:');
      allListings.slice(0, 10).forEach((listing, index) => {
        console.log(`   ${index + 1}. ${listing.id} - ${listing.make?.name} ${listing.model?.name} (${listing.price} CHF)`);
      });
      if (allListings.length > 10) {
        console.log(`   ... and ${allListings.length - 10} more listings`);
      }
      
      // Try to fetch the listing directly by ID as a fallback
      console.log(`\n🔄 Step 4: Trying to fetch listing ${targetListingId} directly...`);
      try {
        const directListing = await fetchSwissListingById(targetListingId);
        if (directListing) {
          console.log(`✅ Found listing ${targetListingId} via direct API call!`);
          console.log('\n📄 COMPLETE LISTING DETAILS (Direct API):');
          console.log('=========================================');
          console.log(JSON.stringify(directListing, null, 2));
        } else {
          console.log(`❌ Listing ${targetListingId} not found via direct API either`);
        }
      } catch (error) {
        console.log(`❌ Error fetching listing directly: ${error.message}`);
      }
      
      return;
    }
    
    // Step 4: Display complete listing details
    console.log(`✅ FOUND LISTING ${targetListingId}!`);
    console.log('\n📄 COMPLETE LISTING DETAILS:');
    console.log('============================');
    
    // Basic information
    console.log('\n🚗 VEHICLE INFORMATION:');
    console.log(`   ID: ${targetListing.id}`);
    console.log(`   Make: ${targetListing.make?.name || 'N/A'}`);
    console.log(`   Model: ${targetListing.model?.name || 'N/A'}`);
    console.log(`   Version: ${targetListing.versionFullName || 'N/A'}`);
    console.log(`   Condition: ${targetListing.conditionType || 'N/A'}`);
    console.log(`   Category: ${targetListing.vehicleCategory || 'N/A'}`);
    
    // Technical details
    console.log('\n⚙️ TECHNICAL DETAILS:');
    console.log(`   First Registration: ${targetListing.firstRegistrationDate || 'N/A'} (${targetListing.firstRegistrationYear || 'N/A'})`);
    console.log(`   Mileage: ${targetListing.mileage ? targetListing.mileage.toLocaleString() + ' km' : 'N/A'}`);
    console.log(`   Fuel Type: ${targetListing.fuelType || 'N/A'}`);
    console.log(`   Power: ${targetListing.horsePower || 'N/A'} HP (${targetListing.kiloWatts || 'N/A'} kW)`);
    console.log(`   Transmission: ${targetListing.transmissionType || 'N/A'} (${targetListing.transmissionTypeGroup || 'N/A'})`);
    console.log(`   Consumption: ${targetListing.consumption?.combined || 'N/A'} L/100km`);
    console.log(`   Range: ${targetListing.range || 'N/A'}`);
    
    // Condition and features
    console.log('\n🔧 CONDITION & FEATURES:');
    console.log(`   Had Accident: ${targetListing.hadAccident ? 'Yes' : 'No'}`);
    console.log(`   Inspected: ${targetListing.inspected ? 'Yes' : 'No'}`);
    console.log(`   Additional Tires: ${targetListing.hasAdditionalSetOfTires ? 'Yes' : 'No'}`);
    console.log(`   Features: ${targetListing.features?.length ? targetListing.features.length + ' features' : 'None listed'}`);
    console.log(`   Warranty: ${targetListing.warranty?.type || 'N/A'}`);
    
    // Pricing and financial
    console.log('\n💰 PRICING & FINANCIAL:');
    console.log(`   Price: ${targetListing.price ? targetListing.price.toLocaleString() + ' CHF' : 'N/A'}`);
    console.log(`   Previous Price: ${targetListing.previousPrice ? targetListing.previousPrice.toLocaleString() + ' CHF' : 'N/A'}`);
    console.log(`   Financing Available: ${targetListing.financing?.providerName || 'N/A'}`);
    console.log(`   Insurance Available: ${targetListing.insurance?.providerName || 'N/A'}`);
    console.log(`   Leasing: ${targetListing.leasing || 'N/A'}`);
    
    // Seller information
    console.log('\n🏢 SELLER INFORMATION:');
    console.log(`   Name: ${targetListing.seller?.name || 'N/A'}`);
    console.log(`   Type: ${targetListing.seller?.type || 'N/A'}`);
    console.log(`   City: ${targetListing.seller?.city || 'N/A'}`);
    console.log(`   ZIP Code: ${targetListing.seller?.zipCode || 'N/A'}`);
    console.log(`   Phone: ${targetListing.seller?.phoneNumber || 'N/A'}`);
    console.log(`   Logo: ${targetListing.seller?.logoKey || 'N/A'}`);
    console.log(`   Features: ${targetListing.seller?.features?.map(f => f.feature).join(', ') || 'N/A'}`);
    
    // Quality and certification
    console.log('\n🏆 QUALITY & CERTIFICATION:');
    console.log(`   Quality Logo ID: ${targetListing.qualiLogoId || 'N/A'}`);
    console.log(`   Quality Logo URL: ${targetListing.qualiLogo?.url || 'N/A'}`);
    
    // Images
    console.log('\n📸 IMAGES:');
    console.log(`   Image Count: ${targetListing.images?.length || 0}`);
    if (targetListing.images && targetListing.images.length > 0) {
      console.log(`   First Image: https://listing-images.autoscout24.ch/${targetListing.images[0].key}`);
      if (targetListing.images.length > 1) {
        console.log(`   Additional Images: ${targetListing.images.length - 1} more`);
      }
    }
    
    // Dates and metadata
    console.log('\n📅 DATES & METADATA:');
    console.log(`   Created: ${targetListing.createdDate || 'N/A'}`);
    console.log(`   Last Modified: ${targetListing.lastModifiedDate || 'N/A'}`);
    console.log(`   Teaser: ${targetListing.teaser || 'N/A'}`);
    
    // Step 5: Check for null fields
    console.log('\n🔍 NULL FIELD ANALYSIS:');
    console.log('======================');
    
    function findNullFields(obj, path = '') {
      const nullFields = [];
      
      if (obj === null) {
        nullFields.push(path);
        return nullFields;
      }
      
      if (obj === undefined) {
        nullFields.push(`${path} (undefined)`);
        return nullFields;
      }
      
      if (typeof obj !== 'object') {
        return nullFields;
      }
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          nullFields.push(...findNullFields(item, `${path}[${index}]`));
        });
        return nullFields;
      }
      
      // Regular object
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        nullFields.push(...findNullFields(value, currentPath));
      }
      
      return nullFields;
    }
    
    const nullFields = findNullFields(targetListing);
    if (nullFields.length === 0) {
      console.log('✅ No null or undefined fields found!');
    } else {
      console.log(`⚠️ Found ${nullFields.length} null/undefined fields:`);
      nullFields.forEach(field => {
        console.log(`   • ${field}`);
      });
    }
    
    // Step 6: Raw JSON output
    console.log('\n📄 COMPLETE RAW JSON STRUCTURE:');
    console.log('===============================');
    console.log(JSON.stringify(targetListing, null, 2));
    
    console.log('\n✅ SPECIFIC LISTING TEST COMPLETED!');
    
  } catch (error) {
    console.error('\n❌ ERROR DURING SPECIFIC LISTING TEST:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

// Run the test
if (require.main === module) {
  testSpecificListing().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { testSpecificListing };
