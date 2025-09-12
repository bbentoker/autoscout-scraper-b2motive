/**
 * User Service
 * Handles API calls for fetching users to scrape
 */

async function getUsersToScrape(context = 'SCRAPER') {
    // Validate API_URL environment variable
    if (!process.env.API_URL) {
        throw new Error('API_URL environment variable is not set. Please create a .env file with API_URL=https://your-api-domain.com');
    }
    const apiUrl = process.env.API_URL;
  
    console.log(`[${context}] Fetching from: ${apiUrl}/auth/autoscout-scraper-user-infos`);
    
    const response = await fetch(`${apiUrl}/auth/autoscout-scraper-user-infos`);
    
    if (!response.ok) { 
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data?.data;
}

module.exports = {
    getUsersToScrape
}; 