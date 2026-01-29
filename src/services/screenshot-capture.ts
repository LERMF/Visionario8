/**
 * PatriciaX - Screenshot Capture Service
 * Handles full-page and component-level screenshot capture
 */

import type { Page } from '@cloudflare/playwright'
import type { Logger, PageConfig, ScreenshotInfo } from '../types'

export class ScreenshotCapture {
  constructor(private logger: Logger) {}

  /**
   * Capture full-page screenshot
   */
  async captureFullPage(page: Page, pageName: string): Promise<Buffer> {
    this.logger.debug('Capturing full-page screenshot', { page: pageName })

    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'png',
    })

    return Buffer.from(screenshot)
  }

  /**
   * Capture component screenshot by selector
   */
  async captureComponent(
    page: Page,
    selector: string,
    pageName: string
  ): Promise<Buffer | null> {
    this.logger.debug('Capturing component screenshot', { page: pageName, selector })

    try {
      const element = await page.$(selector)
      if (!element) {
        this.logger.warn('Component not found', { selector, page: pageName })
        return null
      }

      const isVisible = await element.isVisible()
      if (!isVisible) {
        this.logger.warn('Component not visible', { selector, page: pageName })
        return null
      }

      const screenshot = await element.screenshot({ type: 'png' })
      return Buffer.from(screenshot)
    } catch (error) {
      this.logger.error('Failed to capture component', error as Error, {
        selector,
        page: pageName,
      })
      return null
    }
  }

  /**
   * Capture all configured screenshots for a page
   */
  async captureAll(page: Page, config: PageConfig): Promise<Map<string, Buffer>> {
    const screenshots = new Map<string, Buffer>()
    const pageName = config.name || config.path

    // Always capture full page
    const fullPageBuffer = await this.captureFullPage(page, pageName)
    screenshots.set('full', fullPageBuffer)

    // Capture predefined components if not custom list
    if (!config.captureOptions?.components) {
      const defaultComponents = [
        { selector: '.sg-header, header, [role="banner"]', name: 'header' },
        { selector: '.sg-content-paper, main, [role="main"]', name: 'content' },
        { selector: '.sg-footer, footer, [role="contentinfo"]', name: 'footer' },
      ]

      for (const component of defaultComponents) {
        const buffer = await this.captureComponent(page, component.selector, pageName)
        if (buffer) {
          screenshots.set(component.name, buffer)
        }
      }
    } else {
      // Capture custom components
      for (const selector of config.captureOptions.components) {
        const componentName = selector.replace(/[^a-z0-9]/gi, '-').toLowerCase()
        const buffer = await this.captureComponent(page, selector, pageName)
        if (buffer) {
          screenshots.set(componentName, buffer)
        }
      }
    }

    this.logger.info('Captured screenshots', {
      page: pageName,
      count: screenshots.size,
      types: Array.from(screenshots.keys()),
    })

    return screenshots
  }

  /**
   * Get screenshot dimensions
   */
  async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    // PNG signature: first 8 bytes, then IHDR chunk at offset 16 contains width/height
    if (buffer.length < 24) {
      throw new Error('Invalid PNG buffer')
    }

    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)

    return { width, height }
  }

  /**
   * Calculate SHA-256 hash of screenshot (for regression detection)
   */
  async calculateHash(buffer: Buffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Create screenshot info object
   */
  async createScreenshotInfo(
    type: string,
    buffer: Buffer,
    r2Key: string,
    r2Url: string,
    selector?: string
  ): Promise<ScreenshotInfo> {
    const dimensions = await this.getImageDimensions(buffer)
    const hash = await this.calculateHash(buffer)

    return {
      type: type as ScreenshotInfo['type'],
      selector,
      url: r2Url,
      key: r2Key,
      size: buffer.length,
      dimensions,
      capturedAt: Date.now(),
      hash,
    }
  }
}
