/**
 * PatriciaX - Playwright Executor Service
 * Manages browser lifecycle and parallel page processing
 */

import playwright from '@cloudflare/playwright'
import type { Browser, BrowserContext, Page } from '@cloudflare/playwright'
import type { DiagnosticOptions, Env, Logger, PageConfig } from '../types'
import { BrowserRateLimiter } from '../utils/rate-limiter'

export class PlaywrightExecutor {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private rateLimiter = new BrowserRateLimiter()

  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  /**
   * Launch browser instance
   */
  async launch(): Promise<void> {
    await this.rateLimiter.waitForSlot()

    this.logger.info('Launching browser', {
      rateLimit: this.rateLimiter.getStatus(),
    })

    this.rateLimiter.recordStart()

    try {
      this.browser = await playwright.launch(this.env.BROWSER)
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 PatriciaX/1.0 (Cloudflare Workers)',
      })

      this.logger.info('Browser launched successfully')
    } catch (error) {
      this.rateLimiter.recordEnd()
      this.logger.error('Failed to launch browser', error as Error)
      throw error
    }
  }

  /**
   * Create new page with configuration
   */
  async createPage(config: PageConfig): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized')
    }

    const page = await this.context.newPage()

    // Apply viewport if specified
    if (config.viewport) {
      await page.setViewportSize(config.viewport)
    }

    // Apply mobile emulation if requested
    if (config.captureOptions?.mobile) {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () =>
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
        })
      })
    }

    // Apply dark mode if requested
    if (config.captureOptions?.darkMode) {
      await page.emulateMedia({ colorScheme: 'dark' })
    }

    return page
  }

  /**
   * Navigate to URL with retry logic
   */
  async navigate(
    page: Page,
    url: string,
    options: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number } = {}
  ): Promise<void> {
    const { waitUntil = 'networkidle', timeout = 60000 } = options

    this.logger.debug('Navigating to page', { url, waitUntil, timeout })

    try {
      await page.goto(url, { waitUntil, timeout })

      // Additional stability wait
      await page.waitForTimeout(2000)

      // Wait for fonts to load
      await page.evaluate(() => {
        return document.fonts.ready
      })

      this.logger.debug('Page loaded successfully', { url })
    } catch (error) {
      this.logger.error('Navigation failed', error as Error, { url })
      throw error
    }
  }

  /**
   * Process multiple pages in parallel with rate limiting
   */
  async processPages<T>(
    pages: PageConfig[],
    processor: (page: Page, config: PageConfig) => Promise<T>,
    options: DiagnosticOptions = {}
  ): Promise<Map<string, T | Error>> {
    const results = new Map<string, T | Error>()
    const parallelLimit = options.parallelPages || 5

    this.logger.info('Processing pages in parallel', {
      totalPages: pages.length,
      parallelLimit,
    })

    // Process in batches
    for (let i = 0; i < pages.length; i += parallelLimit) {
      const batch = pages.slice(i, i + parallelLimit)

      const batchResults = await Promise.allSettled(
        batch.map(async (config) => {
          const page = await this.createPage(config)
          try {
            const result = await processor(page, config)
            return { config, result }
          } finally {
            await page.close()
          }
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.set(result.value.config.path, result.value.result)
        } else {
          const failedConfig = batch[batchResults.indexOf(result)]
          results.set(failedConfig.path, result.reason)
        }
      }
    }

    return results
  }

  /**
   * Get browser metrics
   */
  async getMetrics(page: Page): Promise<Record<string, number>> {
    try {
      const metrics = await page.evaluate(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return {
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
          load: perfData.loadEventEnd - perfData.loadEventStart,
          domInteractive: perfData.domInteractive,
          responseStart: perfData.responseStart,
          fetchStart: perfData.fetchStart,
        }
      })

      return metrics
    } catch (error) {
      this.logger.warn('Failed to get page metrics', { error: (error as Error).message })
      return {}
    }
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close()
      this.context = null
    }

    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.rateLimiter.recordEnd()
      this.logger.info('Browser closed')
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus()
  }
}
