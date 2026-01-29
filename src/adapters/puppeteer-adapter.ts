/**
 * PatriciaX - Puppeteer Browser Adapter
 * Implementation of BrowserAdapter using @cloudflare/puppeteer
 */

import puppeteer from '@cloudflare/puppeteer'
import type { Browser, Page } from '@cloudflare/puppeteer'
import type { BrowserAdapter, ElementData, NavigationOptions, ScreenshotOptions } from './browser-adapter'
import type { Env, Logger } from '../types'

export class PuppeteerAdapter implements BrowserAdapter {
  readonly engine = 'puppeteer'
  private browser: Browser | null = null
  private page: Page | null = null

  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  async launch(): Promise<void> {
    try {
      this.logger.debug('Launching Puppeteer browser')
      this.browser = await puppeteer.launch(this.env.BROWSER as any)
      this.page = await this.browser.newPage()
      await this.page.setViewport({ width: 1920, height: 1080 })
    } catch (error) {
      this.logger.error('Puppeteer launch failed', error as Error)
      throw error
    }
  }

  async navigate(url: string, options: NavigationOptions = {}): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    
    const { waitUntil = 'networkidle0', timeout = 60000 } = options
    
    // Map Playwright waitUntil to Puppeteer
    const puppeteerWaitUntil = waitUntil === 'networkidle' ? 'networkidle0' : waitUntil
    
    await this.page.goto(url, { waitUntil: puppeteerWaitUntil as any, timeout })
    
    // Wait for fonts to load
    await this.page.evaluate(() => (document as any).fonts.ready)
  }

  async takeScreenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    if (!this.page) throw new Error('Browser not launched')

    const { fullPage = true, type = 'png', selector, quality } = options

    if (selector) {
      const element = await this.page.$(selector)
      if (!element) throw new Error(`Element not found: ${selector}`)
      const buffer = await element.screenshot({ type, quality })
      return Buffer.from(buffer as Uint8Array)
    }

    const buffer = await this.page.screenshot({ fullPage, type, quality })
    return Buffer.from(buffer as Uint8Array)
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
    // Puppeteer's boundingBox is async
    const boundingBox = await element.boundingBox()
    
    // Visibility check in Puppeteer usually requires checking computed style or offsetParent
    const isVisible = await this.page!.evaluate((el: HTMLElement) => {
      const style = window.getComputedStyle(el)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && el.offsetWidth > 0 && el.offsetHeight > 0
    }, element)
    
    const computedStyle = await this.page!.evaluate((el: HTMLElement) => {
      const style = window.getComputedStyle(el)
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        color: style.color,
        backgroundColor: style.backgroundColor,
      }
    }, element)

    const textContent = await this.page!.evaluate((el: HTMLElement) => el.textContent, element)

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
    await this.page.setViewport({ width, height })
  }

  async emulateMedia(options: { colorScheme?: 'light' | 'dark' }): Promise<void> {
    if (!this.page) throw new Error('Browser not launched')
    if (options.colorScheme) {
      await this.page.emulateMediaType('screen')
      await this.page.evaluate((scheme) => {
        // Puppeteer doesn't have a direct emulateMedia for colorScheme in some versions on Workers
        // This is a workaround to trigger media query change
        (window as any).matchMedia = (query: string) => ({
          matches: query.includes(scheme),
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        })
      }, options.colorScheme)
    }
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close()
    this.page = null
    this.browser = null
  }

  async waitForTimeout(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }
}
