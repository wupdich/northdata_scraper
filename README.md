# NorthData Scraper

Docker-based service that scrapes northdata.de via a REST API.

## Features

- Docker setup with memory limits
- Puppeteer with stealth plugin
- Express REST API
- In-memory queue for sequential processing
- Request blocking for api.rupt.dev
- Human-like behavior with slow typing
- Debug mode with visible browser window

## Setup

1. Clone the repository and navigate to the directory
2. Create a `.env` file from `.env.example`
3. Add your northdata.de credentials to `.env`

## Running

With Docker:
```
docker-compose up --build
```

For development:
```
npm install
npm run dev
```

## API Endpoints

### Search
```
POST /search
Content-Type: application/json
Body: {"query": "Company Name"}
```
Returns HTML content of search results.

### Suggestions
```
GET /suggest?query=Company
```
Returns JSON suggestions from northdata.de's suggestion API.

### Page Content
```
GET /page?url=https://www.northdata.de/...
```
Returns cleaned HTML content of a specific page, with:
- Only the main content section
- No JavaScript, CSS, links, images, or non-informational elements

### Health Check
```
GET /health
```
Returns status of the service and queue information.

## Configuration

Key environment variables:
- `PORT`: Server port (default: 3000)
- `NORTHDATA_USERNAME`: northdata.de username
- `NORTHDATA_PASSWORD`: northdata.de password
- `BROWSER_HEADLESS`: Set to 'false' for debug mode
- `TYPING_DELAY_MIN/MAX`: Keystroke delay in ms
- `WAIT_FOR_NETWORK_IDLE`: Wait for network idle after navigation

## Debug Mode

Set `BROWSER_HEADLESS=false` in `.env` to see browser interactions.

For Docker debugging (Linux only):
```
docker-compose -f docker-compose.yml -f docker-compose.debug.yml up
```
