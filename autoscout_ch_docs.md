# AutoScout24.ch Scraper API Endpoints Documentation

## Overview
This document outlines all API endpoints used by the AutoScout24.ch scraper system. The scraper consists of three main components: data collection, availability checking, and data conversion.

## Base Information
- **Platform**: AutoScout24.ch (Swiss car marketplace)
- **Country**: Switzerland (CH)
- **API Base URL**: `https://api.autoscout24.ch`
- **Website Base URL**: `https://www.autoscout24.ch`

## API Endpoints

### 1. Listings Search API
**Endpoint**: `https://api.autoscout24.ch/v1/listings/search`
**Method**: POST
**Purpose**: Primary endpoint for retrieving car listings and dealer-specific searches

#### Usage Scenarios:

##### A. General Car Listings (get_all_cars.py)
- **Purpose**: Scrape all available car listings from the platform
- **Pagination**: Uses page-based pagination (20 items per page)
- **Filter**: Only professional sellers (dealers)

**Request Payload**:
```json
{
    "query": {
        "vehicleCategories": ["car"]
    },
    "pagination": {
        "page": 0,  // 0-indexed
        "size": 20
    },
    "sort": [
        {
            "order": "DESC",
            "type": "RELEVANCE",
            "variant": "v1"
        }
    ]
}
```

##### B. Dealer-Specific Listings (check_availability.py)
- **Purpose**: Get all car listings from a specific dealer to check availability
- **Pagination**: Same structure as general listings
- **Filter**: Specific dealer ID

**Request Payload**:
```json
{
    "query": {
        "sellerIds": [123456],  // Dealer ID as integer
        "vehicleCategories": ["car"]
    },
    "pagination": {
        "page": 0,  // 0-indexed
        "size": 20
    },
    "sort": []
}
```

#### Common Request Headers:
```
accept: */*
accept-language: en-US,en;q=0.9,tr;q=0.8
content-type: application/json
origin: https://www.autoscout24.ch
priority: u=1, i
referer: https://www.autoscout24.ch/
sec-ch-ua: "Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: "Windows"
sec-fetch-dest: empty
sec-fetch-mode: cors
sec-fetch-site: same-site
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36
```

#### Response Structure:
```json
{
    "content": [
        {
            "id": 12345678,
            "createdDate": "2025-04-21T13:19:45.298Z",
            "seller": {
                "id": 123456,
                "type": "professional",
                "name": "Dealer Name"
            },
            // ... other car details
        }
    ],
    "totalPages": 150,
    "totalElements": 3000,
    // ... other pagination info
}
```

#### Status Codes & Error Handling:
- **200**: Success
- **429**: Rate limited (triggers retry with exponential backoff)
- **500, 502, 503, 504**: Server errors (triggers retry with exponential backoff)

#### Retry Logic:
- **Max Retries**: 3 attempts
- **Initial Delay**: 1 second
- **Backoff Strategy**: Exponential (delay × 2 for each retry)
- **Timeout**: 30 seconds per request

## URL Patterns Used

### 1. Car Detail URLs
**Pattern**: `https://www.autoscout24.ch/de/d/{car_id}`
- **Purpose**: Direct link to individual car listing page
- **Example**: `https://www.autoscout24.ch/de/d/12345678`
- **Usage**: Stored in database for reference, not actively scraped

## Technical Implementation Details

### Proxy Usage
- All API requests use rotating proxies from the database
- Proxy selection: `self.db.get_random_proxy("requests")`

### Threading & Concurrency
- **Default Workers**: 10 concurrent threads
- **Queue-based Processing**: Uses Python's `queue.Queue` for thread-safe operations
- **Thread Pool**: `ThreadPoolExecutor` for managed concurrency

### Rate Limiting Strategy
- Exponential backoff on rate limits (429) and server errors
- Built-in delays between retries
- Proxy rotation to distribute load

### Data Flow
1. **get_all_cars.py**: Scrapes all listings → Stores raw data
2. **check_availability.py**: Monitors existing cars → Updates sold status
3. **convert_raw_to_structured.py**: Processes raw data → Creates structured records

## Integration Points

### Database Operations
- **MongoDB**: Primary data storage
- **Collections**: raw_data, dealers, cars
- **Proxy Management**: Integrated proxy rotation system

### External Services
- **OpenAI API**: Used in helpers.py for parsing car data (not an AutoScout24 endpoint)

## Security Measures & Anti-Bot Protection

### 1. Browser Fingerprinting Detection
The API implements sophisticated browser fingerprinting to detect automated requests:

#### Required Security Headers (sec-fetch-* family):
- `sec-fetch-dest: empty` - Indicates request destination
- `sec-fetch-mode: cors` - Specifies request mode
- `sec-fetch-site: same-site` - Cross-site request policy
- `sec-ch-ua: "Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"` - Browser identification
- `sec-ch-ua-mobile: ?0` - Mobile device detection
- `sec-ch-ua-platform: "Windows"` - Operating system detection

#### Browser Simulation Requirements:
- **Complete Header Set**: Must include all browser headers to avoid detection
- **User Agent**: Specific Chrome 135 user agent string required
- **Origin/Referer**: Must match official website domains
- **Accept Headers**: Must match browser's content negotiation

### 2. Rate Limiting & Request Throttling
**Primary Protection**: HTTP 429 (Too Many Requests) status code
- **Trigger**: Excessive requests from same IP/session
- **Response**: Forces exponential backoff delays
- **Bypass Strategy**: Proxy rotation required for sustained access

**Server-Side Rate Limits**:
- Status codes `429, 500, 502, 503, 504` indicate various rate limiting scenarios
- No specific rate limit numbers exposed in responses

### 3. IP-Based Blocking
**Evidence**: Scraper requires proxy rotation system
- **Proxy Database**: Uses `self.db.get_random_proxy("requests")`
- **Rotation Strategy**: Random proxy selection for each request
- **Necessity**: Without proxies, IP blocking occurs quickly

### 4. Request Timeout Protection
- **Timeout**: 30-second maximum per request
- **Purpose**: Prevents slow/hanging connections that could indicate automation
- **Implementation**: `timeout=30` in all requests

### 5. CORS (Cross-Origin Resource Sharing) Policy
**Strict Origin Validation**:
- `origin: https://www.autoscout24.ch` - Must match exact domain
- `referer: https://www.autoscout24.ch/` - Referrer validation
- `sec-fetch-site: same-site` - Same-site enforcement

### 6. Request Payload Validation
**Structured JSON Requirements**:
- Specific payload structure for search queries
- Pagination parameters validated
- Sort parameters must match expected format
- Invalid payloads likely rejected silently

### 7. Session/Request Pattern Analysis
**Behavioral Detection Indicators**:
- Sequential page requests might trigger suspicion
- Requires realistic browsing patterns
- Thread pooling (10 concurrent workers) suggests need for distributed requests

### 8. Anti-Automation Measures

#### Response to Automated Behavior:
- **Status Code Escalation**: 429 → 5xx error codes
- **Progressive Blocking**: Increasing severity with continued automation
- **Temporary Bans**: Based on observed retry patterns

#### Required Evasion Techniques:
- **Exponential Backoff**: Mandatory delay increases (1s → 2s → 4s)
- **Retry Logic**: Maximum 3 attempts with delays
- **Proxy Rotation**: Essential for avoiding IP blocks
- **Request Spacing**: Built-in delays between requests

### 9. Content Protection
**Professional Seller Filtering**:
- Only dealer listings are processed (`seller.type == 'professional'`)
- Suggests different access levels for different content types

### 10. API Versioning Security
**Endpoint Structure**: `/v1/listings/search`
- Version-controlled API suggests active development and security updates
- Older versions likely deprecated/blocked

### Security Assessment Level: **HIGH**

**Sophistication Indicators**:
1. **Modern Browser Fingerprinting** - Uses latest sec-fetch headers
2. **Multi-Layer Protection** - Rate limiting + IP blocking + header validation
3. **Behavioral Analysis** - Pattern detection requiring human-like behavior
4. **Active Monitoring** - Multiple status codes suggest real-time threat detection

**Bypass Requirements**:
- High-quality proxy infrastructure
- Perfect browser header simulation  
- Realistic request timing patterns
- Robust error handling and retry mechanisms
- Distributed request architecture

**Risk Level for Scrapers**: **Very High**
- Requires sophisticated infrastructure
- Frequent proxy rotation necessary
- Must maintain perfect browser simulation
- Risk of progressive blocking/banning

## Monitoring & Logging
- Console logging for errors and retries
- Database status tracking (is_sold, converted flags)   
- Timestamp tracking for all operations

## Notes
- Only professional sellers (dealers) are processed
- Car availability is determined by presence/absence in dealer listings
- All timestamps are stored in UTC
- Swiss market focus (country code: CH)


This is the api for autoscout ch region

I need you to inspect the flow of main sraper.js

if a dealers url is https://www.autoscout24.ch/de/s/seller-1729890, which is ch region, 
you should fetch according to this api , 
create a new service or file for ch region and implement it into flow of the scraper js main