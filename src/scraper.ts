import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import config from './config';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

/**
 * Click an element using XPath
 * @param page Puppeteer page
 * @param xpath XPath selector for the element
 * @returns Promise<boolean> True if element was found and clicked, false otherwise
 */
async function clickByXPath(page: Page, xpath: string): Promise<boolean> {
  return await page.evaluate((xpath) => {
    const element = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;

    if (element) {
      (element as HTMLElement).click();
      return true;
    }
    return false;
  }, xpath);
}

/**
 * Set up request interception to block unwanted requests
 * @param page Puppeteer page
 */
async function setupRequestInterception(page: Page): Promise<void> {
  // Only set up interception if not already set up
  if (!page.listenerCount('request')) {
    await page.setRequestInterception(true);

    // Intercept requests and block api.rupt.dev
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('https://api.rupt.dev')) {
        console.log(`Blocking request to: ${url}`);
        return request.abort();
      }
      request.continue();
    });
  }
}

/**
 * Type text with random delays between keystrokes to mimic human typing
 * @param page Puppeteer page
 * @param selector CSS selector or XPath for the input element
 * @param text Text to type
 */
async function typeHumanLike(page: Page, selector: string, text: string): Promise<void> {
  // Determine if the selector is an XPath (starts with /)
  const isXPath = selector.startsWith('/');

  try {
    // Click the input field first
    if (isXPath) {
      // Use clickByXPath helper function
      const elementExists = await clickByXPath(page, selector);

      if (!elementExists) {
        throw new Error(`XPath element not found: ${selector}`);
      }
    } else {
      await page.click(selector);
    }

    // Type each character with a random delay
    for (const char of text) {
      // Random delay between min and max typing delay
      const delay = Math.floor(
        (Math.random() * (config.browser.typingDelay.max - config.browser.typingDelay.min + 1) +
          config.browser.typingDelay.min) / 8
      );

      if (isXPath) {
        // For XPath, use evaluate to find the element and type into it
        await page.evaluate(
          (xpath, character) => {
            const element = document.evaluate(
              xpath,
              document,
              null,
              XPathResult.FIRST_ORDERED_NODE_TYPE,
              null
            ).singleNodeValue as HTMLInputElement;

            if (element && element.value !== undefined) {
              element.value += character;
            }
          },
          selector,
          char
        );

        // Add delay between keystrokes
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await page.type(selector, char, { delay });
      }
    }
  } catch (error) {
    console.error(`Error in typeHumanLike with selector "${selector}":`, error);
    throw error;
  }

  // Small pause after typing is complete
  await new Promise(resolve => setTimeout(resolve, 50));
}

/**
 * Navigate to a URL and wait for network to be idle
 * @param page Puppeteer page
 * @param url URL to navigate to
 */
async function navigateAndWait(page: Page, url: string): Promise<void> {
  await page.goto(url, {
    timeout: config.browser.timeout,
    waitUntil: config.browser.waitForNetworkIdle ? 'networkidle2' as const : 'load' as const,
  });
}

export interface SearchResult {
  html: string;
  url: string;
}

export interface SuggestionsResult {
  json: any;
  url: string;
}

export interface PageContentResult {
  html: string;
  url: string;
  // Base64 data URL for the network SVG rendered as PNG, if found
  networkPngDataUrl?: string;
}

export class NorthDataScraper {
  private browser: Browser | null = null;
  private isLoggedIn = false;

  /**
   * Initialize the browser
   */
  public async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: config.browser.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        timeout: config.browser.timeout,
      });

      console.log(`Browser initialized in ${config.browser.headless ? 'headless' : 'debug (non-headless)'} mode`);
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Close the browser
   */
  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isLoggedIn = false;
      console.log('Browser closed');
    }
  }

  /**
   * Login to northdata.de
   */
  private async login(page: Page): Promise<void> {
    if (this.isLoggedIn) {
      return;
    }

    try {
      console.log('Logging in to northdata.de...');

      // Set up request interception
      await setupRequestInterception(page);

      // Navigate directly to login page
      await navigateAndWait(page, 'https://www.northdata.de/_login');

      // Fill in login form with human-like typing using XPath selectors
      await typeHumanLike(page, '/html/body/main/div/div/div/div[1]/form/div[1]/input', config.northdata.username);
      await typeHumanLike(page, '/html/body/main/div/div/div/div[1]/form/div[2]/input', config.northdata.password);

      // Small pause before submitting form
      await new Promise(resolve => setTimeout(resolve, 50));


      // Submit form using XPath for the submit button
      const submitButtonXPath = '/html/body/main/div/div/div/div[1]/form/button';

      // Click the submit button and wait for navigation
      await Promise.all([
        clickByXPath(page, submitButtonXPath),
        page.waitForNavigation({
          timeout: config.browser.timeout,
          waitUntil: config.browser.waitForNetworkIdle ? 'networkidle2' as const : 'load' as const,
        }),
      ]);

      // Check if login was successful
      const errorElement = await page.$('.error-message');
      if (errorElement) {
        const errorText = await page.evaluate(el => el.textContent, errorElement);
        throw new Error(`Login failed: ${errorText}`);
      }

      this.isLoggedIn = true;
      console.log('Successfully logged in to northdata.de');
    } catch (error) {
      console.error('Login failed:', error);
      this.isLoggedIn = false;
      throw error;
    }
  }

/**
 * Get page content from a specific northdata.de URL
 */
public async getPageContent(url: string, retryCount = 0): Promise<PageContentResult> {
  if (!this.browser) {
    await this.initialize();
  }

  if (!this.browser) {
    throw new Error('Browser initialization failed');
  }

  const page = await this.browser.newPage();

  try {
    // Set up request interception
    await setupRequestInterception(page);
    
    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Login if not already logged in
    await this.login(page);
    
    // Navigate to the requested URL
    await navigateAndWait(page, url);

    // Wait for the "loading" placeholder to disappear.
    // This is the most reliable way to wait for dynamic content.
    try {
      console.log('Waiting for "Netzwerk wird geladen..." placeholder to disappear.');
      await page.waitForFunction(
        () => !document.body.innerText.includes('Netzwerk wird geladen'),
        { timeout: 20000 } // Wait up to 20 seconds for the chart to load
      );
      console.log('Loading placeholder has disappeared. The chart should be loaded.');
    } catch (e) {
      console.log('Did not find the loading placeholder or it did not disappear in time. Continuing anyway.');
    }

    // Add a small static delay to ensure final rendering is complete.
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try to extract the network SVG as a PNG first (optional)
    let networkPngDataUrl: string | undefined;
    try {
      // Wait briefly for the SVG to be present
      await page.waitForSelector('svg[aria-label="Netzwerk"]', { timeout: 5000 });
      const svgHandle = await page.$('svg[aria-label="Netzwerk"]');
      if (svgHandle) {
        // Ensure the element is scrolled into view
        await svgHandle.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));

        // Optionally expand viewport to fit the SVG
        const bbox = await svgHandle.boundingBox();
        if (bbox) {
          const desiredWidth = Math.ceil(Math.max(1280, bbox.width));
          const desiredHeight = Math.ceil(Math.max(800, bbox.height));
          const currentViewport = page.viewport();
          if (
            !currentViewport ||
            currentViewport.width < desiredWidth ||
            currentViewport.height < desiredHeight
          ) {
            await page.setViewport({ width: desiredWidth, height: desiredHeight });
          }
        }

        // Take a PNG screenshot of the SVG element
        const pngBase64 = await svgHandle.screenshot({ type: 'png', encoding: 'base64' });
        if (typeof pngBase64 === 'string' && pngBase64.length > 0) {
          networkPngDataUrl = `data:image/png;base64,${pngBase64}`;
        }
      }
    } catch (e) {
      // Non-fatal: continue without PNG if not found
      console.warn('Network SVG PNG capture skipped or failed:', e);
    }

    // Extract only the main content section and clean the HTML
    const cleanedHtml = await page.evaluate(() => {
      // Find the main content section
      const mainSection = document.evaluate(
        '/html/body/main/div/section', 
        document, 
        null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, 
        null
      ).singleNodeValue;
      
      if (!mainSection) {
        return '';
      }
      
      // Clone the section to avoid modifying the original DOM
      const sectionClone = mainSection.cloneNode(true) as HTMLElement;
      
      // Remove all script tags
      const scripts = sectionClone.querySelectorAll('script');
      scripts.forEach(script => script.remove());
      
      // Remove all style tags, EXCEPT those inside SVG (they may contain marker/arrow styles)
      const styles = sectionClone.querySelectorAll('style');
      styles.forEach(style => {
        if (!style.closest('svg')) {
          style.remove();
        }
      });
      
      // =========================================================================
      // == CHANGE REVERTED: Remove styles and classes from ALL elements again.
      // =========================================================================
      // This section is now identical to your original code, removing inline
      // styles and classes from every element, including SVGs.
      
      // Remove all inline styles, EXCEPT inside SVG (SVG may encode geometry/visibility via style)
      const elementsWithStyle = sectionClone.querySelectorAll('[style]');
      elementsWithStyle.forEach(el => {
        if (!el.closest('svg')) {
          el.removeAttribute('style');
        }
      });
      
      // Remove all class attributes, EXCEPT inside SVG (classes are needed to keep node/link semantics)
      const elementsWithClass = sectionClone.querySelectorAll('[class]');
      elementsWithClass.forEach(el => {
        if (!el.closest('svg')) {
          el.removeAttribute('class');
        }
      });

      // Remove all links (a tags) but keep their text content,
      // EXCEPT links inside SVG (SVG <a> often wrap nodes with transforms)
      const links = sectionClone.querySelectorAll('a');
      links.forEach(link => {
        if (link.closest('svg')) {
          return; // keep SVG links intact
        }
        if (link.textContent) {
          const textNode = document.createTextNode(link.textContent);
          link.parentNode?.replaceChild(textNode, link);
        } else {
          link.remove();
        }
      });
      
      // Remove all images (we want to keep SVGs)
      const images = sectionClone.querySelectorAll('img');
      images.forEach(img => img.remove());
      
      // Remove all buttons
      const buttons = sectionClone.querySelectorAll('button');
      buttons.forEach(button => button.remove());
      
      // Remove all forms
      const forms = sectionClone.querySelectorAll('form');
      forms.forEach(form => form.remove());
      
      // Remove all inputs
      const inputs = sectionClone.querySelectorAll('input');
      inputs.forEach(input => input.remove());
      
      // Remove all iframes
      const iframes = sectionClone.querySelectorAll('iframe');
      iframes.forEach(iframe => iframe.remove());
      
      // Remove all event handlers (onclick, onmouseover, etc.) and some attrs,
      // but PRESERVE critical attributes inside SVG (id, href/xlink:href, target)
      const allElements = sectionClone.querySelectorAll('*');
      allElements.forEach(el => {
        const isInSvg = !!el.closest('svg');
        const attributes = Array.from(el.attributes);
        attributes.forEach(attr => {
          const name = attr.name;
          const isEventHandler = name.startsWith('on');
          const isHref = name === 'href' || name === 'xlink:href';
          const isSrc = name === 'src';
          const isId = name === 'id';
          const isTarget = name === 'target';
          const isRel = name === 'rel';
          if (isEventHandler) {
            el.removeAttribute(name);
            return;
          }
          if (!isInSvg) {
            if (isHref || isSrc || isId || isTarget || isRel) {
              el.removeAttribute(name);
            }
          }
        });
      });
      
      // Get the HTML content
      let html = sectionClone.outerHTML;
      
      // Remove unnecessary whitespace
      html = html
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/^\s+/gm, '')
        .replace(/\s+$/gm, '')
        .replace(/\n+/g, '\n')
        .replace(/\s*(<\/?(?:div|p|section|table|tr|td|th|ul|ol|li|h[1-6])[^>]*>)\s*/g, '$1');
      
      return html;
    });
    
    const currentUrl = page.url();
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, config.browser.requestDelay));
    
    await page.close();
    
    return {
      html: cleanedHtml,
      url: currentUrl,
      networkPngDataUrl,
    };
  } catch (error) {
    await page.close();
    
    // Retry logic
    if (retryCount < config.browser.maxRetries) {
      console.log(`Page content request failed, retrying (${retryCount + 1}/${config.browser.maxRetries})...`);
      await this.close();
      await this.initialize();
      return this.getPageContent(url, retryCount + 1);
    }
    
    console.error('Page content request failed after retries:', error);
    throw error;
  }
}

  /**
   * Get suggestions from northdata.de
   */
  public async getSuggestions(query: string, retryCount = 0): Promise<SuggestionsResult> {
    if (!this.browser) {
      await this.initialize();
    }

    if (!this.browser) {
      throw new Error('Browser initialization failed');
    }

    const page = await this.browser.newPage();

    try {
      // Set up request interception
      await setupRequestInterception(page);

      // Set viewport and user agent
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Login if not already logged in
      await this.login(page);

      // Construct the suggestions URL (no country filter to allow international results)
      const suggestUrl = `https://www.northdata.de/suggest.json?query=${encodeURIComponent(query)}`;

      // Navigate to the suggestions URL
      await navigateAndWait(page, suggestUrl);

      // Get the JSON content from the page
      const jsonContent = await page.evaluate(() => {
        try {
          return JSON.parse(document.body.textContent || '{}');
        } catch (error) {
          return {};
        }
      });

      const currentUrl = page.url();

      await page.close();

      return {
        json: jsonContent,
        url: currentUrl,
      };
    } catch (error) {
      await page.close();

      // Retry logic
      if (retryCount < config.browser.maxRetries) {
        console.log(`Suggestions request failed, retrying (${retryCount + 1}/${config.browser.maxRetries})...`);
        // Reset browser for next attempt
        await this.close();
        await this.initialize();
        return this.getSuggestions(query, retryCount + 1);
      }

      console.error('Suggestions request failed after retries:', error);
      throw error;
    }
  }

  /**
   * Search for a company on northdata.de
   */
  public async search(query: string, retryCount = 0): Promise<SearchResult> {
    if (!this.browser) {
      await this.initialize();
    }

    if (!this.browser) {
      throw new Error('Browser initialization failed');
    }

    const page = await this.browser.newPage();

    try {
      // Set up request interception
      await setupRequestInterception(page);

      // Set viewport and user agent
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Login if not already logged in
      await this.login(page);

      // Navigate directly to the search results URL constructed from the query
      // Example: https://www.northdata.de/Ziel%20Home%20Furnishing%20Technology%20Co.%2C%20Ltd.
      const searchUrl = `https://www.northdata.de/${encodeURIComponent(query)}`;
      await navigateAndWait(page, searchUrl);

      // Additional wait for network idle
      if (config.browser.waitForNetworkIdle) {
        await new Promise(resolve => setTimeout(resolve, config.browser.networkIdleTimeout));
      }

      // Wait for search results to load
      await page.waitForSelector('.search-results .ui.feed', { timeout: config.browser.timeout });

      // Extract only the listing section (feed with result items and links)
      const resultsHtml = await page.evaluate(() => {
        const feedElement = document.querySelector('.search-results .ui.feed');
        return feedElement ? feedElement.outerHTML : '';
      });

      const currentUrl = page.url();

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, config.browser.requestDelay));

      await page.close();

      return {
        html: resultsHtml,
        url: currentUrl,
      };
    } catch (error) {
      await page.close();

      // Retry logic
      if (retryCount < config.browser.maxRetries) {
        console.log(`Search failed, retrying (${retryCount + 1}/${config.browser.maxRetries})...`);
        // Reset browser for next attempt
        await this.close();
        await this.initialize();
        return this.search(query, retryCount + 1);
      }

      console.error('Search failed after retries:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
export const scraper = new NorthDataScraper();
