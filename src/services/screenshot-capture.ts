/**
 * PatriciaX - Screenshot Capture Service
 * Handles full-page and component-level screenshot capture using BrowserExecutor
 */

import type { BrowserExecutor } from './browser-executor'
import type { Logger, PageConfig, ScreenshotInfo } from '../types'

export class ScreenshotCapture {
  constructor(private logger: Logger) {}

  /**
   * Capture all configured screenshots for a page
   */
  async captureAll(executor: BrowserExecutor, config: PageConfig): Promise<Map<string, Buffer>> {
    const screenshots = new Map<string, Buffer>()
    const pageName = config.name || config.path

    // Always capture full page
    this.logger.debug('Capturing full-page screenshot', { page: pageName })
    const fullPageBuffer = await executor.takeScreenshot({ fullPage: true })
    screenshots.set('full', fullPageBuffer)

    // Capture predefined components if not custom list
    if (!config.captureOptions?.components) {
      const defaultComponents = [
        { selector: '.sg-header, header, [role="banner"]', name: 'header' },
        { selector: '.sg-content-paper, main, [role="main"]', name: 'content' },
        { selector: '.sg-footer, footer, [role="contentinfo"]', name: 'footer' },
      ]

      for (const component of defaultComponents) {
        try {
          const buffer = await executor.takeScreenshot({ selector: component.selector })
          if (buffer) {
            screenshots.set(component.name, buffer)
          }
        } catch (e) {
          this.logger.warn(`Could not capture component: ${component.name}`, { selector: component.selector })
        }
      }
    } else {
      // Capture custom components
      for (const selector of config.captureOptions.components) {
        try {
          const componentName = selector.replace(/[^a-z0-9]/gi, '-').toLowerCase()
          const buffer = await executor.takeScreenshot({ selector })
          if (buffer) {
            screenshots.set(componentName, buffer)
          }
        } catch (e) {
          this.logger.warn(`Could not capture component: ${selector}`)
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
    if (buffer.length < 24) {
      throw new Error('Invalid PNG buffer')
    }
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    return { width, height }
  }

  /**
   * Calculate SHA-256 hash
   */
  async calculateHash(buffer: Buffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer.buffer as ArrayBuffer)
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
