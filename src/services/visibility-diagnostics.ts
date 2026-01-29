/**
 * PatriciaX - Visibility Diagnostics Service
 * Performs comprehensive visual checks on web pages
 */

import type { Page } from '@cloudflare/playwright'
import type { CheckType, Logger, VisibilityCheck, VisibilityReport } from '../types'
import { calculateContrast } from '../utils/contrast-calculator'

export class VisibilityDiagnostics {
  constructor(private logger: Logger) {}

  /**
   * Run all diagnostics on a page
   */
  async runDiagnostics(page: Page, pagePath: string): Promise<VisibilityReport> {
    this.logger.info('Running visibility diagnostics', { page: pagePath })

    const checks: VisibilityCheck[] = []

    // Critical CSS selectors to check
    const criticalSelectors = [
      '.sg-shell',
      '.sg-header',
      '.sg-card',
      '.sg-content-paper',
      '.sg-title',
      '.sg-nav-item',
      '.crystal-navbar',
      'header',
      'main',
      'footer',
      'h1',
      'h2',
      'nav',
    ]

    for (const selector of criticalSelectors) {
      const elementChecks = await this.checkElement(page, selector)
      checks.push(...elementChecks)
    }

    // Check for broken images
    const imageChecks = await this.checkImages(page)
    checks.push(...imageChecks)

    // Check color contrast
    const contrastChecks = await this.checkContrast(page)
    checks.push(...contrastChecks)

    const summary = {
      totalChecks: checks.length,
      passed: checks.filter((c) => c.status === 'pass').length,
      warnings: checks.filter((c) => c.status === 'warn').length,
      failures: checks.filter((c) => c.status === 'fail').length,
    }

    this.logger.info('Diagnostics complete', { page: pagePath, summary })

    return {
      page: pagePath,
      timestamp: Date.now(),
      checks,
      summary,
    }
  }

  /**
   * Check element visibility and dimensions
   */
  private async checkElement(page: Page, selector: string): Promise<VisibilityCheck[]> {
    const checks: VisibilityCheck[] = []

    try {
      const elements = await page.$$(selector)

      if (elements.length === 0) {
        // Not finding an element is a warning, not failure (might not exist on this page)
        return []
      }

      for (let i = 0; i < elements.length; i++) {
        const element = elements[i]
        const selectorWithIndex = elements.length > 1 ? `${selector}[${i}]` : selector

        // Check if visible
        const isVisible = await element.isVisible()
        const boundingBox = await element.boundingBox()

        if (!isVisible) {
          const computedStyle = await element.evaluate((el) => {
            const style = window.getComputedStyle(el)
            return {
              display: style.display,
              visibility: style.visibility,
              opacity: style.opacity,
            }
          })

          checks.push({
            type: 'element-hidden',
            selector: selectorWithIndex,
            status: 'warn',
            message: `Element is hidden (display: ${computedStyle.display}, visibility: ${computedStyle.visibility}, opacity: ${computedStyle.opacity})`,
            details: { computedStyle },
          })
          continue
        }

        // Check for zero dimensions
        if (boundingBox && (boundingBox.width === 0 || boundingBox.height === 0)) {
          checks.push({
            type: 'zero-dimensions',
            selector: selectorWithIndex,
            status: 'fail',
            message: `Element has zero dimensions (${boundingBox.width}x${boundingBox.height})`,
            details: { boundingBox },
          })
          continue
        }

        // Element is visible and has dimensions
        checks.push({
          type: 'element-visible',
          selector: selectorWithIndex,
          status: 'pass',
          message: 'Element is visible and properly rendered',
          details: { boundingBox },
        })
      }
    } catch (error) {
      this.logger.warn('Failed to check element', { selector, error: (error as Error).message })
    }

    return checks
  }

  /**
   * Check for broken images
   */
  private async checkImages(page: Page): Promise<VisibilityCheck[]> {
    const checks: VisibilityCheck[] = []

    try {
      const images = await page.$$('img')

      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        const src = await img.getAttribute('src')
        const alt = await img.getAttribute('alt')

        if (!src) continue

        const isLoaded = await img.evaluate((el: HTMLImageElement) => {
          return el.complete && el.naturalHeight !== 0
        })

        if (!isLoaded) {
          checks.push({
            type: 'broken-image',
            selector: `img[src="${src}"]`,
            status: 'fail',
            message: `Image failed to load: ${src}`,
            details: { src, alt },
          })
        }
      }
    } catch (error) {
      this.logger.warn('Failed to check images', { error: (error as Error).message })
    }

    return checks
  }

  /**
   * Check color contrast (WCAG compliance)
   */
  private async checkContrast(page: Page): Promise<VisibilityCheck[]> {
    const checks: VisibilityCheck[] = []

    try {
      // Check common text elements
      const textSelectors = ['p', 'h1', 'h2', 'h3', 'a', 'span', 'button', '.sg-title']

      for (const selector of textSelectors) {
        const elements = await page.$$(selector)

        for (let i = 0; i < Math.min(elements.length, 5); i++) {
          // Limit to 5 per selector
          const element = elements[i]

          const hasText = await element.evaluate((el) => {
            return el.textContent?.trim().length > 0
          })

          if (!hasText) continue

          const colors = await element.evaluate((el) => {
            const style = window.getComputedStyle(el)
            return {
              color: style.color,
              backgroundColor: style.backgroundColor,
            }
          })

          const contrast = calculateContrast(colors.color, colors.backgroundColor)

          if (!contrast.passAA) {
            checks.push({
              type: 'low-contrast',
              selector: `${selector}[${i}]`,
              status: contrast.ratio < 3 ? 'fail' : 'warn',
              message: `Low contrast ratio: ${contrast.ratio.toFixed(2)}:1 (WCAG AA requires 4.5:1)`,
              details: {
                ...colors,
                contrast: contrast.ratio,
                wcag: {
                  passAA: contrast.passAA,
                  passAAA: contrast.passAAA,
                },
              },
            })
          }
        }
      }
    } catch (error) {
      this.logger.warn('Failed to check contrast', { error: (error as Error).message })
    }

    return checks
  }
}
