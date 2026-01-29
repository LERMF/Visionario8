/**
 * PatriciaX - Diagnostic Session Durable Object
 * Manages stateful session progress using modular BrowserExecutor
 */

import type { DurableObject } from 'cloudflare:workers'
import type {
  DiagnosticRequest,
  Env,
  PageProgress,
  PageStatus,
  SessionProgress,
  SessionState,
} from '../types'
import { createLogger } from '../utils/logger'
import { BrowserExecutor } from '../services/browser-executor'
import { ScreenshotCapture } from '../services/screenshot-capture'
import { StorageService } from '../services/storage'
import { VisibilityDiagnostics } from '../services/visibility-diagnostics'

export class DiagnosticSession {
  private state: DurableObjectState
  private env: Env
  private sessionId: string
  private progress: SessionProgress | null = null
  private logger: ReturnType<typeof createLogger>

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.sessionId = state.id.toString()
    this.logger = createLogger(env)
  }

  /**
   * Initialize new diagnostic session
   */
  async initialize(request: DiagnosticRequest): Promise<void> {
    this.logger.info('Initializing diagnostic session', { sessionId: this.sessionId })

    this.progress = {
      sessionId: this.sessionId,
      state: 'initializing',
      startedAt: Date.now(),
      pages: request.pages.map((pageConfig) => ({
        path: pageConfig.path,
        name: pageConfig.name || pageConfig.path,
        status: 'pending' as PageStatus,
        screenshots: [],
      })),
      metadata: {
        deploymentId: request.metadata?.deploymentId,
        environment: request.metadata?.environment || this.env.ENVIRONMENT,
        branch: request.metadata?.branch,
        triggeredBy: 'api',
        userAgent: 'PatriciaX/1.0',
        browserVersion: 'Dynamic',
        options: request.options || {},
      },
    }

    await this.saveProgress()
  }

  /**
   * Execute diagnostic session
   */
  async execute(request: DiagnosticRequest): Promise<SessionProgress> {
    await this.initialize(request)
    await this.updateState('capturing')

    const executor = new BrowserExecutor(this.env, this.logger, 'auto')
    const screenshotService = new ScreenshotCapture(this.logger)
    const diagnosticsService = new VisibilityDiagnostics(this.logger)
    const storageService = new StorageService(this.env, this.logger)

    try {
      // Launch browser (will try Playwright, then Puppeteer)
      await executor.launch()
      
      this.progress!.metadata.browserVersion = executor.getEngine()

      // Process each page
      for (const pageConfig of request.pages) {
        const pageProgress = this.progress!.pages.find((p) => p.path === pageConfig.path)!

        try {
          pageProgress.status = 'running'
          pageProgress.startedAt = Date.now()
          await this.saveProgress()

          // Configure page
          await executor.configurePage(pageConfig)

          const baseUrl = 'https://uniteia.com'
          const url = `${baseUrl}${pageConfig.path}`

          // Navigate
          await executor.navigate(url, {
            waitUntil: pageConfig.waitUntil,
            timeout: pageConfig.timeout,
          })

          // Capture screenshots
          const screenshots = await screenshotService.captureAll(executor, pageConfig)

          // Upload screenshots to R2
          for (const [type, buffer] of screenshots.entries()) {
            const { key, url: uploadUrl } = await storageService.uploadScreenshot(
              this.sessionId,
              pageProgress.name,
              type,
              buffer
            )

            const screenshotInfo = await screenshotService.createScreenshotInfo(
              type,
              buffer,
              key,
              uploadUrl
            )

            pageProgress.screenshots.push(screenshotInfo)
          }

          // Run diagnostics
          await this.updateState('diagnosing')
          pageProgress.diagnostics = await diagnosticsService.runDiagnostics(executor, pageConfig.path)

          // Get performance metrics
          pageProgress.performance = await executor.getMetrics()

          // Mark page complete
          pageProgress.status = 'completed'
          pageProgress.completedAt = Date.now()
          await this.saveProgress()

        } catch (error) {
          pageProgress.status = 'failed'
          pageProgress.error = {
            code: 'CAPTURE_FAILED',
            message: (error as Error).message,
            stack: (error as Error).stack,
            timestamp: Date.now(),
          }
          await this.saveProgress()

          this.logger.error('Page processing failed', error as Error, {
            sessionId: this.sessionId,
            page: pageConfig.path,
          })
        }
      }

      // Upload final report
      await this.updateState('storing')
      await storageService.uploadReport(this.sessionId, this.progress!)

      // Index session
      await storageService.indexSession(this.sessionId, {
        deploymentId: request.metadata?.deploymentId,
        environment: this.env.ENVIRONMENT,
        startedAt: this.progress!.startedAt,
        completedAt: Date.now(),
      })

      // Mark as completed
      await this.updateState('completed')
      this.progress!.completedAt = Date.now()
      this.progress!.summary = this.generateSummary()
      await this.saveProgress()

      return this.progress!
    } catch (error) {
      await this.updateState('failed')
      this.progress!.error = {
        code: 'SESSION_FAILED',
        message: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: Date.now(),
      }
      await this.saveProgress()

      this.logger.error('Session execution failed', error as Error, {
        sessionId: this.sessionId,
      })

      throw error
    } finally {
      await executor.close()
    }
  }

  /**
   * Get current session progress
   */
  async getProgress(): Promise<SessionProgress | null> {
    if (!this.progress) {
      this.progress = await this.state.storage.get<SessionProgress>('progress')
    }
    return this.progress
  }

  /**
   * Update session state
   */
  private async updateState(state: SessionState): Promise<void> {
    if (this.progress) {
      this.progress.state = state
      await this.saveProgress()
    }
  }

  /**
   * Save progress to durable storage
   */
  private async saveProgress(): Promise<void> {
    if (this.progress) {
      await this.state.storage.put('progress', this.progress)
    }
  }

  /**
   * Generate summary statistics
   */
  private generateSummary() {
    const pages = this.progress!.pages

    const issuesByType: Record<string, number> = {}
    let totalIssues = 0
    let totalWarnings = 0

    for (const page of pages) {
      if (page.diagnostics) {
        for (const check of page.diagnostics.checks) {
          if (check.status === 'fail') {
            issuesByType[check.type] = (issuesByType[check.type] || 0) + 1
            totalIssues++
          } else if (check.status === 'warn') {
            totalWarnings++
          }
        }
      }
    }

    const totalScreenshots = pages.reduce((sum, p) => sum + p.screenshots.length, 0)
    const storageUsed = pages.reduce(
      (sum, p) => sum + p.screenshots.reduce((s, ss) => s + ss.size, 0),
      0
    )

    return {
      sessionId: this.sessionId,
      totalPages: pages.length,
      completedPages: pages.filter((p) => p.status === 'completed').length,
      failedPages: pages.filter((p) => p.status === 'failed').length,
      skippedPages: pages.filter((p) => p.status === 'skipped').length,
      duration: Date.now() - this.progress!.startedAt,
      totalScreenshots,
      totalIssues,
      issuesByType,
      totalWarnings,
      storageUsed,
    }
  }

  /**
   * HTTP handler for Durable Object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/progress') {
      const progress = (await this.getProgress()) || null
      return Response.json(progress || { error: 'Session not initialized' })
    }

    if (request.method === 'POST' && url.pathname === '/execute') {
      const diagnosticRequest = (await request.json()) as DiagnosticRequest
      const result = await this.execute(diagnosticRequest)
      return Response.json(result)
    }

    return new Response('Not Found', { status: 404 })
  }
}
