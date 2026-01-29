/**
 * PatriciaX - Visibility Diagnostics Service
 * Performs comprehensive visual checks on web pages using BrowserExecutor
 */

import type { BrowserExecutor } from './browser-executor'
import type { CheckType, Logger, VisibilityCheck, VisibilityReport } from '../types'
import { calculateContrast } from '../utils/contrast-calculator'

export class VisibilityDiagnostics {
  constructor(private logger: Logger) {}

  /**
   * Run all diagnostics on a page
   */
  async runDiagnostics(executor: BrowserExecutor, pagePath: string): Promise<VisibilityReport> {
    this.logger.info('Running visibility diagnostics', { page: pagePath })

    const checks: VisibilityCheck[] = []

    // Critical CSS selectors to check
    const criticalSelectors = [
      '.sg-shell', '.sg-header', '.sg-card', '.sg-content-paper', '.sg-title',
      '.sg-nav-item', '.crystal-navbar', 'header', 'main', 'footer', 'h1', 'h2', 'nav',
    ]

    const elements = await executor.extractElements(criticalSelectors)
    
    for (const data of elements) {
      if (!data.isVisible) {
        checks.push({
          type: 'element-hidden',
          selector: data.selector,
          status: 'warn',
          message: `Element is hidden (display: ${data.computedStyle?.display}, visibility: ${data.computedStyle?.visibility})`,
          details: { computedStyle: data.computedStyle },
        })
      } else if (data.boundingBox && (data.boundingBox.width === 0 || data.boundingBox.height === 0)) {
        checks.push({
          type: 'zero-dimensions',
          selector: data.selector,
          status: 'fail',
          message: `Element has zero dimensions (${data.boundingBox.width}x${data.boundingBox.height})`,
          details: { boundingBox: data.boundingBox },
        })
      } else {
        checks.push({
          type: 'element-visible',
          selector: data.selector,
          status: 'pass',
          message: 'Element is visible and properly rendered',
          details: { boundingBox: data.boundingBox },
        })
      }
    }

    // Check color contrast
    const contrastChecks = await this.checkContrast(elements)
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
   * Check color contrast
   */
  private async checkContrast(elements: any[]): Promise<VisibilityCheck[]> {
    const checks: VisibilityCheck[] = []

    for (const data of elements) {
      if (!data.textContent || !data.computedStyle) continue
      if (data.textContent.trim().length === 0) continue

      const contrast = calculateContrast(data.computedStyle.color || '', data.computedStyle.backgroundColor || '')

      if (!contrast.passAA) {
        checks.push({
          type: 'low-contrast',
          selector: data.selector,
          status: contrast.ratio < 3 ? 'fail' : 'warn',
          message: `Low contrast ratio: ${contrast.ratio.toFixed(2)}:1 (WCAG AA requires 4.5:1)`,
          details: {
            color: data.computedStyle.color,
            backgroundColor: data.computedStyle.backgroundColor,
            contrast: contrast.ratio,
            wcag: { passAA: contrast.passAA, passAAA: contrast.passAAA },
          },
        })
      }
    }

    return checks
  }
}
