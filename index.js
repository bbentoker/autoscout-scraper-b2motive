require('dotenv').config();
const { searchAllPages } = require('./scraper');
const { Control, SeenInfo, Advert } = require('./models');

async function main() {
    try {
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        console.log(`📌 Created control ID: ${control.id}`);
        
        // Prepare SeenInfo records for existing active adverts
        await prepareForNotExistingAdvertCheck(control.id);
        
        const users = await getUsersToScrape();
        for(const user of users) {
            console.log(`📝 Scraping user: ${user.id}`);
            await scrapeUsersListings(user, control);
        }
        
        // Mark adverts as inactive if they weren't seen in this session
        await markUnseenAdvertsAsInactive(control);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function getUsersToScrape() {
    // Validate API_URL environment variable
    if (!process.env.API_URL) {
        throw new Error('API_URL environment variable is not set. Please create a .env file with API_URL=https://your-api-domain.com');
    }
    const apiUrl = process.env.API_URL;
  
    console.log(`Fetching from: ${apiUrl}/auth/autoscout-scraper-user-infos`);
    
    const response = await fetch(`${apiUrl}/auth/autoscout-scraper-user-infos`);
    
    if (!response.ok) { 
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data?.data;
}

async function prepareForNotExistingAdvertCheck(controlID) {
    console.log('📋 Preparing SeenInfo records for existing adverts...');
    
    const adverts = await Advert.findAll({ where: { is_active: true } });
    const advertIds = adverts.map((advert) => advert.autoscout_id);

    console.log(`📝 Creating SeenInfo records for ${advertIds.length} active adverts`);

    await Promise.all(
        advertIds.map((advertId) =>
            SeenInfo.create({
                control_id: controlID,
                advert_id: advertId,
                seen: false,
            })
        )
    );
    
    console.log('✅ Finished creating SeenInfo records');
}

async function scrapeUsersListings(user, control) {
    await searchAllPages(user, control);
}

async function markUnseenAdvertsAsInactive(control) {
    console.log('🔄 Marking unseen adverts as inactive...');
    
    const advertsToUpdate = await SeenInfo.findAll({
        where: { control_id: control.id, seen: false },
    });

    console.log(`📝 Found ${advertsToUpdate.length} adverts to mark as inactive`);

    for (const seenInfo of advertsToUpdate) {
        const advert = await Advert.findOne({
            where: { autoscout_id: seenInfo.advert_id },
        });
        
        if (advert) {
            advert.is_active = false;
            advert.last_seen = control.date;
            await advert.save();
            console.log(`🔄 Advert ID ${seenInfo.advert_id} marked as inactive.`);
        }
    }
    
    console.log('✅ Finished marking unseen adverts as inactive');
}


main();