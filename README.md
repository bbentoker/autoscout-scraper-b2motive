# AutoScout24 Scraper

A Node.js application for scraping car listings from AutoScout24 with automated daily scheduling and memory-optimized processing.

## Project Structure

```
autoscout-scraper-b2motive/
├── src/                          # Source code
│   ├── services/                 # Business logic services
│   │   ├── scraper.js           # Main scraping logic
│   │   ├── extractNewAdvert.js  # Advert extraction logic
│   │   ├── userService.js       # User API operations
│   │   └── advertService.js     # Advert database operations
│   ├── utils/                    # Utility functions
│   └── index.js                  # Main application entry point
├── models/                       # Database models
│   ├── advert.js
│   ├── control.js
│   └── index.js
├── config/                       # Configuration files
│   └── database.js              # Database configuration
├── scripts/                      # Utility scripts
│   └── example.js               # Example implementation
├── docs/                         # Documentation
│   └── database_schema.sql      # Database schema
├── main.js                       # Application entry point
└── package.json
```

## Features

- **Multi-user scraping**: Scrapes listings for multiple users
- **Advert tracking**: Tracks which adverts are active/inactive
- **Last seen tracking**: Records when adverts were last seen
- **Error handling**: Comprehensive error handling and logging
- **Modular architecture**: Clean separation of concerns

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your configuration:
   ```
   API_URL=https://your-api-domain.com
   ```

3. Set up your database using the schema in `docs/database_schema.sql`

## Usage

Run the scraper:
```bash
node main.js
```

## Services

### Scraper Service (`src/services/scraper.js`)
Handles the main scraping logic for AutoScout24 pages.

### Advert Service (`src/services/advertService.js`)
Manages advert-related database operations:
- Preparing seen info records
- Marking adverts as inactive
- Tracking advert lifecycle

### User Service (`src/services/userService.js`)
Handles API calls for fetching users to scrape.

### Advert Extractor (`src/services/extractNewAdvert.js`)
Extracts detailed information from individual advert pages.

## Database Models

- **Advert**: Stores car listing information
- **Control**: Tracks scraping sessions

## Logging

The application uses emoji-based logging for better readability:
- 🚀 Starting processes
- 📌 Control records
- 👥 User operations
- 📝 Scraping operations
- ✅ Success messages
- ❌ Error messages

## 🕐 Daily Scheduler

The application now runs on an automated daily schedule with memory-optimized processing:

### Schedule
- **Scraper**: Runs daily at **00:00 UTC (Midnight)**
- **Checker**: Runs daily at **02:00 UTC (2 AM)**

### Memory Management
- **Sequential Processing**: All operations run one-by-one to prevent memory overflow
- **Aggressive Cleanup**: Multiple garbage collection passes after each job
- **Deep Memory Monitoring**: Real-time heap usage tracking
- **Automatic Recovery**: Emergency cleanup on errors

### Usage

#### Production Mode
```bash
# Start the scheduler (runs jobs at scheduled times)
npm start

# Memory-optimized mode with limited heap size
npm run start:memory-optimized
```

#### Testing Mode
```bash
# Test both scraper and checker immediately
npm run test-scheduler

# Test only the scraper
npm run test-scraper-only

# Test only the checker
npm run test-checker-only
```

#### Environment Variables
```bash
# Enable/disable components and initial runs
SCRAPER_ON=true          # Enable daily scraper + run once on startup (default: true)
CHECKER_ON=true          # Enable daily checker + run once on startup (default: true)

# Memory optimization
NODE_OPTIONS="--expose-gc --max-old-space-size=512"
```

#### Startup Behavior
The application will automatically run jobs once on startup based on environment variables:

- `SCRAPER_ON=true` → Runs scraper once on startup + schedules daily at midnight
- `CHECKER_ON=true` → Runs checker once on startup + schedules daily at 2 AM
- `SCRAPER_ON=false CHECKER_ON=true` → Only runs checker on startup + daily schedule
- Both `false` → No jobs run, only waits for manual execution

### Memory Optimization Features

1. **Sequential Processing**: 
   - Users processed one-by-one (no parallel processing)
   - Makes processed one-by-one per user
   - Adverts processed one-by-one per make

2. **Aggressive Memory Cleanup**:
   - Garbage collection every 2-5 operations
   - Deep cleanup after each user/job
   - Multiple GC passes for thorough cleanup

3. **Monitoring & Recovery**:
   - Real-time memory usage logging
   - Emergency cleanup on uncaught exceptions
   - Graceful shutdown with memory cleanup

### Schedule Configuration

The cron schedules can be modified in `main.js`:

```javascript
// Scraper: Daily at midnight
cron.schedule('0 0 * * *', async () => {
    await runScraper();
});

// Checker: Daily at 2 AM  
cron.schedule('0 2 * * *', async () => {
    await runChecker();
});
```

### Timezone Configuration

By default, the scheduler uses UTC time. To change timezone:

```javascript
{
    scheduled: true,
    timezone: "Europe/Berlin" // Change to your timezone
}
```