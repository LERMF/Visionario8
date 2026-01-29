/**
 * PatriciaX - Browser Adapter Interface
 * Defines common interface for different browser engines (Playwright, Puppeteer)
 */

import type { Env, Logger } from '../types'

export interface ElementData {
  selector: string
  isVisible: boolean
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  } | null
  computedStyle?: {
    display: string
    visibility: string
    opacity: string
    color?: string
    backgroundColor?: string
  }
  textContent?: string
  attributes?: Record<string, string | null>
}

export interface BrowserMetrics {
  engine: string
  launchTimeMs: number
  navigationTimeMs: number
  screenshotTimeMs: number
  totalTimeMs: number
}

export interface ScreenshotOptions {
  fullPage?: boolean
  type?: 'png' | 'jpeg'
  quality?: number
  selector?: string
}

export interface NavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  timeout?: number
}

export interface BrowserAdapter {
  readonly engine: string
  
  /**
   * Launch browser and initialize context
   */
  launch(): Promise<void>

  /**
   * Navigate to a URL
   */
  navigate(url: string, options?: NavigationOptions): Promise<void>

  /**
   * Take a screenshot
   */
  takeScreenshot(options?: ScreenshotOptions): Promise<Buffer>

  /**
   * Extract data from elements matching selectors
   */
  extractElements(selectors: string[]): Promise<ElementData[]>

  /**
   * Extract data for a single element
   */
  getElement(selector: string): Promise<ElementData | null>

  /**
   * Run script in page context
   */
  evaluate<T>(script: string | ((...args: any[]) => T), ...args: any[]): Promise<T>

  /**
   * Set viewport size
   */
  setViewport(width: number, height: number): Promise<void>

  /**
   * Emulate media (e.g. color scheme)
   */
  emulateMedia(options: { colorScheme?: 'light' | 'dark' }): Promise<void>

  /**
   * Close browser and cleanup
   */
  close(): Promise<void>

  /**
   * Wait for a timeout
   */
  waitForTimeout(ms: number): Promise<void>
}
