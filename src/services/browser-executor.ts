/**
 * PatriciaX - Browser Executor Service
 * Manages browser lifecycle and parallel page processing using modular adapters
 */

import type { BrowserAdapter } from '../adapters/browser-adapter'
import { BrowserAdapterFactory, type BrowserEngine } from '../adapters/factory'
import type { DiagnosticOptions, Env, Logger, PageConfig } from '../types'
import { BrowserRateLimiter } from '../utils/rate-limiter'

export class BrowserExecutor {
  private adapter: BrowserAdapter | null = null
  private rateLimiter = new BrowserRateLimiter()

  constructor(
    private env: Env,
    private logger: Logger,
    private engine: BrowserEngine = 'auto'
  ) {
    this.adapter = BrowserAdapterFactory.create(this.engine, this.env, this.logger)
  }

  /**
   * Launch browser instance
   */
  async launch(): Promise<void> {
    await this.rateLimiter.waitForSlot()

    this.logger.info('Launching browser', {
      rateLimit: this.rateLimiter.getStatus(),
      engine: this.engine,
    })

    this.rateLimiter.recordStart()

    try {
      if (!this.adapter) {
        throw new Error('Adapter not initialized')
      }
      await this.adapter.launch()
      this.logger.info('Browser launched successfully', { 
        activeEngine: this.adapter.engine 
      })
    } catch (error) {
      this.rateLimiter.recordEnd()
      this.logger.error('Failed to launch browser', error as Error)
      throw error
    }
  }

  /**
   * Configure page based on config
   */
  async configurePage(config: PageConfig): Promise<void> {
    if (!this.adapter) {
      throw new Error('Browser adapter not initialized')
    }

    // Apply viewport if specified
    if (config.viewport) {
      await this.adapter.setViewport(config.viewport.width, config.viewport.height)
    }

    // Apply mobile emulation if requested
    if (config.captureOptions?.mobile) {
      await this.adapter.setViewport(375, 667)
      // Custom user agent emulation would go here via adapter.evaluate if needed
    }

    // Apply dark mode if requested
    if (config.captureOptions?.darkMode) {
      await this.adapter.emulateMedia({ colorScheme: 'dark' })
    }
  }

  /**
   * Navigate to URL
   */
  async navigate(
    url: string,
    options: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number } = {}
  ): Promise<void> {
    if (!this.adapter) throw new Error('Adapter not initialized')

    this.logger.debug('Navigating to page', { url, ...options })

    try {
      await this.adapter.navigate(url, options)
      
      // Stability wait
      await this.adapter.waitForTimeout(2000)

      this.logger.debug('Page loaded successfully', { url })
    } catch (error) {
      this.logger.error('Navigation failed', error as Error, { url })
      throw error
    }
  }

  /**
   * Take screenshot via adapter
   */
  async takeScreenshot(options?: any): Promise<Buffer> {
    if (!this.adapter) throw new Error('Adapter not initialized')
    return await this.adapter.takeScreenshot(options)
  }

  /**
   * Extract element data via adapter
   */
  async extractElements(selectors: string[]): Promise<any[]> {
    if (!this.adapter) throw new Error('Adapter not initialized')
    return await this.adapter.extractElements(selectors)
  }

  /**
   * Get browser metrics
   */
  async getMetrics(): Promise<Record<string, number>> {
    if (!this.adapter) return {}
    
    try {
      const metrics = await this.adapter.evaluate(() => {
        const perfData = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
        return {
          domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
          load: perfData.loadEventEnd - perfData.loadEventStart,
          domInteractive: perfData.domInteractive,
          responseStart: perfData.responseStart,
          fetchStart: perfData.fetchStart,
        }
      })

      return metrics as Record<string, number>
    } catch (error) {
      this.logger.warn('Failed to get page metrics', { error: (error as Error).message })
      return {}
    }
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close()
      this.rateLimiter.recordEnd()
      this.logger.info('Browser closed')
    }
  }

  /**
   * Get current adapter engine
   */
  getEngine(): string {
    return this.adapter?.engine || 'none'
  }
}
