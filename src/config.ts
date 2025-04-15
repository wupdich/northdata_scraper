import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface Config {
  port: number;
  northdata: {
    username: string;
    password: string;
  };
  browser: {
    timeout: number;
    requestDelay: number;
    maxRetries: number;
    headless: boolean;
    typingDelay: {
      min: number;
      max: number;
    };
    waitForNetworkIdle: boolean;
    networkIdleTimeout: number;
  };
}

// Get environment variables with defaults
const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  northdata: {
    username: process.env.NORTHDATA_USERNAME || '',
    password: process.env.NORTHDATA_PASSWORD || '',
  },
  browser: {
    timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
    requestDelay: parseInt(process.env.REQUEST_DELAY || '2000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    headless: process.env.BROWSER_HEADLESS !== 'false', // Default to headless mode unless explicitly set to 'false'
    typingDelay: {
      min: parseInt(process.env.TYPING_DELAY_MIN || '50', 10),  // Minimum delay between keystrokes in ms
      max: parseInt(process.env.TYPING_DELAY_MAX || '150', 10), // Maximum delay between keystrokes in ms
    },
    waitForNetworkIdle: process.env.WAIT_FOR_NETWORK_IDLE !== 'false', // Default to waiting for network idle
    networkIdleTimeout: parseInt(process.env.NETWORK_IDLE_TIMEOUT || '1000', 10), // Time in ms to wait for no network activity
  },
};

// Validate required configuration
if (!config.northdata.username || !config.northdata.password) {
  console.error('Error: Northdata credentials are required');
  process.exit(1);
}

export default config;
