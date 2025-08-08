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
}

export interface NetworkSvgResult {
  svg: string;
  url: string;
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
      
      // Remove all style tags
      const styles = sectionClone.querySelectorAll('style');
      styles.forEach(style => style.remove());
      
      // =========================================================================
      // == CHANGE REVERTED: Remove styles and classes from ALL elements again.
      // =========================================================================
      // This section is now identical to your original code, removing inline
      // styles and classes from every element, including SVGs.
      
      // Remove all inline styles
      const elementsWithStyle = sectionClone.querySelectorAll('[style]');
      elementsWithStyle.forEach(el => el.removeAttribute('style'));
      
      // Remove all class attributes (which often reference CSS)
      const elementsWithClass = sectionClone.querySelectorAll('[class]');
      elementsWithClass.forEach(el => el.removeAttribute('class'));

      // Remove all links (a tags) but keep their text content
      const links = sectionClone.querySelectorAll('a');
      links.forEach(link => {
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
      
      // Remove all event handlers (onclick, onmouseover, etc.)
      const allElements = sectionClone.querySelectorAll('*');
      allElements.forEach(el => {
        const attributes = Array.from(el.attributes);
        attributes.forEach(attr => {
          if (attr.name.startsWith('on') || 
              attr.name === 'href' || 
              attr.name === 'src' || 
              attr.name === 'id' || 
              attr.name === 'target' || 
              attr.name === 'rel') {
            el.removeAttribute(attr.name);
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

      // Construct the suggestions URL
      const suggestUrl = `https://www.northdata.de/suggest.json?query=${encodeURIComponent(query)}&countries=DE`;

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

      // Navigate to search page
      await navigateAndWait(page, 'https://www.northdata.de/');

      // Type search query with human-like typing using XPath
      const searchInputXPath = '/html/body/main/div/div/div/form/div/input';
      await typeHumanLike(page, searchInputXPath, query);

      // Small pause before submitting search
      await new Promise(resolve => setTimeout(resolve, 500));

      // Submit search form using XPath
      const searchButtonXPath = '/html/body/main/div/div/div/form/div/button';

      // Click the search button and wait for navigation
      await Promise.all([
        clickByXPath(page, searchButtonXPath),
        page.waitForNavigation({
          timeout: config.browser.timeout,
          waitUntil: config.browser.waitForNetworkIdle ? 'networkidle2' as const : 'load' as const,
        }),
      ]);

      // Additional wait for network idle
      if (config.browser.waitForNetworkIdle) {
        await new Promise(resolve => setTimeout(resolve, config.browser.networkIdleTimeout));
      }

      // Wait for search results to load
      await page.waitForSelector('.search-results', { timeout: config.browser.timeout });

      // Extract search results HTML
      const resultsHtml = await page.evaluate(() => {
        const resultsElement = document.querySelector('.search-results');
        return resultsElement ? resultsElement.outerHTML : '';
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

  /**
   * Get the raw SVG markup of the network graph for a specific northdata.de page
   */
  public async getNetworkSvg(url: string, retryCount = 0): Promise<NetworkSvgResult> {
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
      await page.setViewport({ width: 1440, height: 900 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Login if not already logged in
      await this.login(page);

      // Navigate to the requested URL
      await navigateAndWait(page, url);

      // Try to wait for the network placeholder to disappear if present
      try {
        await page.waitForFunction(
          () => !document.body.innerText.includes('Netzwerk wird geladen'),
          { timeout: 20000 }
        );
      } catch {
        // Continue even if the placeholder was not detected
      }

      // Ensure the SVG is present in the DOM and the layout is populated
      await page.waitForSelector('svg[aria-label="Netzwerk"]', { timeout: config.browser.timeout });
      await page.waitForFunction(
        () => {
          const svg = document.querySelector('svg[aria-label="Netzwerk"]');
          if (!svg) return false;
          const hasNodes = (svg.querySelectorAll('.node').length + svg.querySelectorAll('a.node').length) > 0;
          const hasLinks = svg.querySelectorAll('.link').length > 0;
          const rects = Array.from(svg.querySelectorAll('rect')) as SVGRectElement[];
          const rectsSized = rects.some(r => {
            const w = r.getAttribute('width');
            if (w && parseFloat(w) > 0) return true;
            try {
              const bb = r.getBBox();
              return bb && bb.width > 0;
            } catch { return false; }
          });
          return hasNodes && hasLinks && rectsSized;
        },
        { timeout: Math.max(5000, config.browser.timeout / 2) }
      );

      // Small delay to let final layout settle
      await new Promise(resolve => setTimeout(resolve, 500));

      // Extract a self-contained SVG by embedding page CSS into the SVG
      const svgMarkup = await page.evaluate(() => {
        const svg = document.querySelector('svg[aria-label="Netzwerk"]') as SVGElement | null;
        if (!svg) return '';

        const clone = svg.cloneNode(true) as SVGElement;

        // Ensure namespace attributes for standalone viewing
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        if (!clone.getAttribute('xmlns:xlink')) {
          clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        }

        // Collect CSS text from accessible stylesheets and inline <style> tags in the document
        let cssText = '';
        // Inline <style> elements in document
        document.querySelectorAll('style').forEach(styleEl => {
          if (styleEl.textContent) cssText += styleEl.textContent + '\n';
        });

        // External stylesheets (might throw for cross-origin; ignore those)
        const styleSheets = Array.from(document.styleSheets) as CSSStyleSheet[];
        for (const sheet of styleSheets) {
          try {
            const rules = sheet.cssRules;
            if (!rules) continue;
            for (const rule of Array.from(rules)) {
              cssText += rule.cssText + '\n';
            }
          } catch (e) {
            // Ignore cross-origin stylesheets we cannot read
            continue;
          }
        }

        // Embed CSS into the SVG
        if (cssText.trim().length > 0) {
          const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          const styleInSvg = document.createElementNS('http://www.w3.org/2000/svg', 'style');
          styleInSvg.setAttribute('type', 'text/css');
          // Wrap in CDATA for XML compatibility
          styleInSvg.textContent = `/* <![CDATA[ */\n${cssText}\n/* ]]> */`;
          defs.appendChild(styleInSvg);
          clone.insertBefore(defs, clone.firstChild);
        }

        return clone.outerHTML;
      });

      const currentUrl = page.url();

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, config.browser.requestDelay));

      await page.close();

      if (!svgMarkup) {
        throw new Error('Network SVG not found on the page');
      }

      return {
        svg: svgMarkup,
        url: currentUrl,
      };
    } catch (error) {
      await page.close();

      // Retry logic
      if (retryCount < config.browser.maxRetries) {
        console.log(`Network SVG request failed, retrying (${retryCount + 1}/${config.browser.maxRetries})...`);
        await this.close();
        await this.initialize();
        return this.getNetworkSvg(url, retryCount + 1);
      }

      console.error('Network SVG request failed after retries:', error);
      throw error;
    }
  }
}
// Create and export a singleton instance
export const scraper = new NorthDataScraper();
