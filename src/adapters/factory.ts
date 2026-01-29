/**
 * PatriciaX - Browser Adapter Factory
 * Creates and manages browser adapters with fallback support
 */

import type { Env, Logger } from '../types'
import type { BrowserAdapter } from './browser-adapter'
import { PlaywrightAdapter } from './playwright-adapter'
import { PuppeteerAdapter } from './puppeteer-adapter'

export type BrowserEngine = 'playwright' | 'puppeteer' | 'auto'

export class BrowserAdapterFactory {
  /**
   * Create a browser adapter based on engine type
   */
  static create(
    engine: BrowserEngine,
    env: Env,
    logger: Logger
  ): BrowserAdapter {
    switch (engine) {
      case 'playwright':
        return new PlaywrightAdapter(env, logger)
      case 'puppeteer':
        return new PuppeteerAdapter(env, logger)
      case 'auto':
      default:
        // By default we return a wrapped adapter that handles fallbacks
        return new FallbackBrowserAdapter(env, logger)
    }
  }
}

/**
 * Wrapper that implements automatic fallback between engines
 */
class FallbackBrowserAdapter implements BrowserAdapter {
  private currentAdapter: BrowserAdapter
  private primaryEngine: 'playwright' | 'puppeteer' = 'playwright'
  readonly engine = 'auto'

  constructor(
    private env: Env,
    private logger: Logger
  ) {
    this.currentAdapter = new PlaywrightAdapter(env, logger)
  }

  async launch(): Promise<void> {
    try {
      this.logger.info('Attempting to launch primary engine (Playwright)')
      await this.currentAdapter.launch()
    } catch (error) {
      this.logger.warn('Playwright launch failed, falling back to Puppeteer', {
        error: (error as Error).message
      })
      
      this.currentAdapter = new PuppeteerAdapter(this.env, this.logger)
      await this.currentAdapter.launch()
      this.primaryEngine = 'puppeteer'
    }
  }

  async navigate(url: string, options?: any): Promise<void> {
    return this.currentAdapter.navigate(url, options)
  }

  async takeScreenshot(options?: any): Promise<Buffer> {
    return this.currentAdapter.takeScreenshot(options)
  }

  async extractElements(selectors: string[]): Promise<any[]> {
    return this.currentAdapter.extractElements(selectors)
  }

  async getElement(selector: string): Promise<any> {
    return this.currentAdapter.getElement(selector)
  }

  async evaluate<T>(script: any, ...args: any[]): Promise<T> {
    return this.currentAdapter.evaluate(script, ...args)
  }

  async setViewport(width: number, height: number): Promise<void> {
    return this.currentAdapter.setViewport(width, height)
  }

  async emulateMedia(options: any): Promise<void> {
    return this.currentAdapter.emulateMedia(options)
  }

  async close(): Promise<void> {
    return this.currentAdapter.close()
  }

  async waitForTimeout(ms: number): Promise<void> {
    return this.currentAdapter.waitForTimeout(ms)
  }

  get activeEngine(): string {
    return this.currentAdapter.engine
  }
}
