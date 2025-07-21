require('dotenv').config();
const { searchAllPages } = require('./scraper');
const { Control } = require('./models');

async function main() {
    try {
        // Create a control record for this scraping session
        const control = await Control.create({ date: new Date() });
        console.log(`📌 Created control ID: ${control.id}`);
        
        const users = await getUsersToScrape();
        for(const user of users) {
            await scrapeUsersListings(user, control);
        }
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

async function scrapeUsersListings(user, control) {
    await searchAllPages(user, control);
}


main();