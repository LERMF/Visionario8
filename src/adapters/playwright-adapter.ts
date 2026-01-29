/**
 * PatriciaX - Playwright Browser Adapter
 * Implementation of BrowserAdapter using @cloudflare/playwright
 */

import { launch } from '@cloudflare/playwright'
import type { Browser, BrowserContext, Page } from '@cloudflare/playwright'
import type { BrowserAdapter, ElementData, NavigationOptions, ScreenshotOptions } from './browser-adapter'
import type { Env, Logger } from '../types'

export class PlaywrightAdapter implements BrowserAdapter {
  readonly engine = 'playwright'
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null

  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  async launch(): Promise<void> {
    try {
      this.logger.debug('Launching Playwright browser')
      this.browser = await launch(this.env.BROWSER)
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 PatriciaX/1.0 (Cloudflare Workers)',
      })
      this.page = await this.context.newPage()
    } catch (error) {
      this.logger.error('Playwright launch failed', error as Error)
      throw error
    }
  }

  async navigate(url: string, options: NavigationOptions = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    
    const { waitUntil = 'networkidle', timeout = 60000 } = options
    
    await this.page.goto(url, { waitUntil, timeout })
    
    // Wait for fonts to load
    await this.page.evaluate(() => document.fonts.ready)
  }

  async takeScreenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    if (!this.page) throw new Error('Browser not launched')

    const { fullPage = true, type = 'png', selector } = options

    if (selector) {
      const element = await this.page.$(selector)
      if (!element) throw new Error(`Element not found: ${selector}`)
      const buffer = await element.screenshot({ type })
      return Buffer.from(buffer)
    }

    const buffer = await this.page.screenshot({ fullPage, type })
    return Buffer.from(buffer)
  }

  async extractElements(selectors: string[]): Promise<ElementData[]> {
    if (!this.page) throw new Error('Browser not launched')

    const results: ElementData[] = []

    for (const selector of selectors) {
      const elements = await this.page.$$(selector)
      for (const element of elements) {
        const data = await this.getElementData(element, selector)
        results.push(data)
      }
    }

    return results
  }

  async getElement(selector: string): Promise<ElementData | null> {
    if (!this.page) throw new Error('Browser not launched')

    const element = await this.page.$(selector)
    if (!element) return null

    return this.getElementData(element, selector)
  }

  private async getElementData(element: any, selector: string): Promise<ElementData> {
    const isVisible = await element.isVisible()
    const boundingBox = await element.boundingBox()
    
    const computedStyle = await element.evaluate((el: HTMLElement) => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        color: style.color,
        backgroundColor: style.backgroundColor,
      }
    })

    const textContent = await element.textContent()

    return {
      selector,
      isVisible,
      boundingBox,
      computedStyle,
      textContent: textContent || undefined
    }
  }

  async evaluate<T>(script: any, ...args: any[]): Promise<T> {
    if (!this.page) throw new Error('Browser not launched')
    return await this.page.evaluate(script, ...args)
  }

  async setViewport(width: number, height: number): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    await this.page.setViewportSize({ width, height })
  }

  async emulateMedia(options: { colorScheme?: 'light' | 'dark' }): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    await this.page.emulateMedia({ colorScheme: options.colorScheme })
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close()
    if (this.browser) await this.browser.close()
    this.page = null
    this.context = null
    this.browser = null
  }

  async waitForTimeout(ms: number): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    await this.page.waitForTimeout(ms)
  }
}
