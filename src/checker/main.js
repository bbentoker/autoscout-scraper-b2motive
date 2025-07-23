require('dotenv').config();
const axios = require('axios');
const { Advert, SeenInfo, Control } = require('../../models');
const { getListingInfos } = require('../services/extractNewAdvert');

/**
 * Handle 404 error for an advert by marking it as inactive and setting last_seen
 * @param {string} autoscoutId - The AutoScout ID of the advert
 */
async function handleAdvertNotFound(autoscoutId) {
    try {
        console.log(`🚫 Advert ${autoscoutId} not found (404), marking as inactive...`);
        
        // Find the advert
        const advert = await Advert.findOne({
            where: { autoscout_id: autoscoutId }
        });
        
        if (!advert) {
            console.error(`❌ Advert ${autoscoutId} not found in database`);
            return;
        }
        
        // Find the latest seen info for this advert
        const latestSeenInfo = await SeenInfo.findOne({
            where: { advert_id: autoscoutId },
            order: [['id', 'DESC']], // Use id instead of created_at since timestamps are false
            include: [{
                model: Control,
                as: 'control'
            }]
        });
        
        if (latestSeenInfo && latestSeenInfo.control) {
            // Set last_seen to the control date
            advert.last_seen = latestSeenInfo.control.date;
            console.log(`📅 Setting last_seen to: ${latestSeenInfo.control.date}`);
        } else {
            // If no seen info found, set to current date
            advert.last_seen = new Date();
            console.log(`📅 Setting last_seen to current date: ${new Date()}`);
        }
        
        // Mark as inactive
        advert.is_active = false;
        await advert.save();
        
        console.log(`✅ Advert ${autoscoutId} marked as inactive with last_seen updated`);
        
    } catch (error) {
        console.error(`❌ Error handling 404 for advert ${autoscoutId}:`, error.message);
        
        // Fallback: just mark as inactive without setting last_seen
        try {
            const advert = await Advert.findOne({
                where: { autoscout_id: autoscoutId }
            });
            
            if (advert) {
                advert.is_active = false;
                await advert.save();
                console.log(`✅ Advert ${autoscoutId} marked as inactive (fallback)`);
            }
        } catch (fallbackError) {
            console.error(`❌ Fallback error for advert ${autoscoutId}:`, fallbackError.message);
        }
    }
}

/**
 * Fetch HTML content for a specific advert
 * @param {string} autoscoutId - The AutoScout ID of the advert
 * @returns {Promise<string>} - The HTML content
 */
async function fetchAdvertHtml(autoscoutId) {
    const url = `${process.env.AUTOSCOUT_URL}/offers/${autoscoutId}`;
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 30000 // 30 second timeout
        });
        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching HTML for advert ${autoscoutId}:`, error.message);
        throw error;
    }
}

/**
 * Process adverts in parallel with a concurrency limit
 * @param {Array} adverts - Array of advert objects to process
 * @param {number} concurrencyLimit - Maximum number of concurrent operations
 */
async function processAdvertsInParallel(adverts, concurrencyLimit = process.env.ADVERT_PROCESSING_CONCURRENCY || 5) {
    const results = [];
    
    for (let i = 0; i < adverts.length; i += concurrencyLimit) {
        const batch = adverts.slice(i, i + concurrencyLimit);
        console.log(`🔄 Processing batch ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(adverts.length / concurrencyLimit)} (${batch.length} adverts)`);
        
        const batchPromises = batch.map(async (advert) => {
            try {
                console.log(`📋 Extracting listing info for advert: ${advert.autoscout_id}`);
                
                // Create a mock user object for the getListingInfos function
                const mockUser = { id: advert.seller_id || 1 };
                const advertUrl = `${process.env.AUTOSCOUT_URL}/offers/${advert.autoscout_id}`;
                
                // Extract listing information using the same method as scraper
                const listingInfo = await getListingInfos(advertUrl, advert.autoscout_id, mockUser);
               
                return { 
                    autoscout_id: advert.autoscout_id, 
                    status: 'success',
                    listingInfo: listingInfo
                };
            } catch (error) {
                console.error(`❌ Error processing advert ${advert.autoscout_id}:`, error.message);
                
                // Check if this is a 404 error from getListingInfos
                if (error.message.includes('Request failed with status code 404') || 
                    error.message.includes('404') ||
                    (error.response && error.response.status === 404)) {
                    
                    // Handle 404 error by marking advert as inactive
                    await handleAdvertNotFound(advert.autoscout_id);
                    
                    return { 
                        autoscout_id: advert.autoscout_id, 
                        status: 'inactive',
                        message: 'Advert marked as inactive due to 404'
                    };
                }
                
                return { 
                    autoscout_id: advert.autoscout_id, 
                    status: 'error', 
                    error: error.message 
                };
            }
        });
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches to be respectful to the server
        if (i + concurrencyLimit < adverts.length) {
            console.log('⏳ Waiting 2 seconds before next batch...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return results;
}

/**
 * Check listings function
 * Fetches all active adverts and processes them concurrently
 */
async function checkListings() {
    console.log('📋 Starting check listings job...');
    try {
        // Fetch all active adverts
        const activeAdverts = await Advert.findAll({
            where: { is_active: true },
            attributes: ['autoscout_id', 'seller_id']
        });
        
        console.log(`📊 Found ${activeAdverts.length} active adverts to check`);
        
        if (activeAdverts.length === 0) {
            console.log('ℹ️ No active adverts found to check');
            return;
        }
        
        // Process adverts in parallel with concurrency limit
        const results = await processAdvertsInParallel(activeAdverts);
        
        // Log summary of results
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
        const inactive = results.filter(r => r.status === 'fulfilled' && r.value.status === 'inactive').length;
        const failed = results.filter(r => r.status === 'fulfilled' && r.value.status === 'error').length;
        const rejected = results.filter(r => r.status === 'rejected').length;
        
        console.log(`📊 Processing complete: ${successful} successful, ${inactive} marked inactive, ${failed} failed, ${rejected} rejected`);
        
        console.log('✅ Check listings job completed successfully');
    } catch (error) {
        console.error('❌ Check listings job failed:', error.message);
        throw error;
    }
}

/**
 * Main checking function
 * Orchestrates the entire checking process
 */
async function main() {
    const startTime = new Date();
    console.log('📋 Starting AutoScout24 listings checker...');
    console.log(`⏰ Start time: ${startTime.toLocaleString()}`);
    
    try {
        // Run the check listings process
        await checkListings();
        
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        console.log(`⏰ End time: ${endTime.toLocaleString()}`);
        console.log(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        console.log('✅ Checking session completed successfully');
        
    } catch (error) {
        const endTime = new Date();
        const duration = endTime - startTime;
        const durationMinutes = Math.floor(duration / 60000);
        const durationSeconds = Math.floor((duration % 60000) / 1000);
        const durationMs = duration % 1000;
        
        console.log(`⏰ End time: ${endTime.toLocaleString()}`);
        console.log(`⏱️ Total duration: ${durationMinutes}m ${durationSeconds}s ${durationMs}ms`);
        console.error('❌ Error during checking session:', error.message);
        throw error;
    }
}

module.exports = { main, checkListings }; 