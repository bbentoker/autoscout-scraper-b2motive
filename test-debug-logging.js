const debugLogger = require('./src/utils/debugLogger');

// Test the debug logging functionality
console.log('Testing debug logging functionality...');

// Clear the debug file
debugLogger.clearDebugFile();

// Test session start
debugLogger.logSessionStart(3);

// Test user processing logs
const testUsers = [
    { id: 1, company_name: 'Test Company 1', autoscout_url: 'https://autoscout24.com/test1' },
    { id: 2, company_name: 'Test Company 2', autoscout_url: 'https://autoscout24.com/test2' },
    { id: 3, company_name: 'Test Company 3', autoscout_url: 'https://autoscout24.com/test3' }
];

// Simulate processing each user
testUsers.forEach((user, index) => {
    const currentIndex = index + 1;
    
    // Log user start
    debugLogger.logUserStart(user, currentIndex, testUsers.length);
    
    // Simulate some processing time
    setTimeout(() => {
        if (index === 1) {
            // Simulate an error for user 2
            const error = new Error('Test error for user 2');
            debugLogger.logUserError(user, error, currentIndex, testUsers.length);
        } else {
            // Simulate successful completion
            const stats = {
                durationMinutes: Math.floor(Math.random() * 5),
                durationSeconds: Math.floor(Math.random() * 60),
                newListings: Math.floor(Math.random() * 10),
                existingListings: Math.floor(Math.random() * 20),
                totalListings: Math.floor(Math.random() * 30)
            };
            debugLogger.logUserSuccess(user, stats, currentIndex, testUsers.length);
        }
        
        // Log session completion after last user
        if (index === testUsers.length - 1) {
            setTimeout(() => {
                debugLogger.logSessionComplete({ successful: 2, failed: 1, total: 3 });
                console.log('Test completed! Check debug.txt file for output.');
            }, 100);
        }
    }, (index + 1) * 500); // Stagger the completion times
});
