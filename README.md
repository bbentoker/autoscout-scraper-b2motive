# AutoScout24 Scraper

A Node.js application for scraping car listings from AutoScout24.

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
│   ├── seen_info.js
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
- **SeenInfo**: Tracks which adverts were seen in each session

## Logging

The application uses emoji-based logging for better readability:
- 🚀 Starting processes
- 📌 Control records
- 👥 User operations
- 📝 Scraping operations
- ✅ Success messages
- ❌ Error messages 