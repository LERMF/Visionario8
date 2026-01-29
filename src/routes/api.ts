/**
 * PatriciaX - API Routes
 * HTTP endpoints for diagnostic operations
 */

import { Hono } from 'hono'
import type { Env } from '../types'
import { requireAuth } from '../services/auth'
import { StorageService } from '../services/storage'
import { StorageLimitsService } from '../services/storage-limits'
import { createLogger } from '../utils/logger'
import { diagnosticRequestSchema } from '../utils/schema'

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /run - Start new diagnostic session
 */
app.post('/run', requireAuth, async (c) => {
  const logger = createLogger(c.env)

  try {
    // Check storage quota
    const limitsService = new StorageLimitsService(c.env, logger)
    const quotaCheck = await limitsService.checkQuota()

    if (!quotaCheck.allowed) {
      logger.warn('Session rejected due to quota limits', {
        reason: quotaCheck.reason,
        usage: quotaCheck.currentUsage,
      })

      return c.json(
        {
          error: 'Quota Exceeded',
          message: quotaCheck.reason,
          usage: quotaCheck.currentUsage,
          limits: quotaCheck.limits,
        },
        429
      )
    }

    // Validate request body
    const body = await c.req.json()
    const validatedRequest = diagnosticRequestSchema.parse(body)

    logger.info('Starting diagnostic session', {
      pages: validatedRequest.pages.length,
      metadata: validatedRequest.metadata,
    })

    // Create Durable Object session
    const sessionId = crypto.randomUUID()
    const id = c.env.DIAGNOSTIC_SESSION.idFromName(sessionId)
    const stub = c.env.DIAGNOSTIC_SESSION.get(id)

    // Execute diagnostics (async)
    const executeUrl = new URL('http://fake-host/execute')
    const response = await stub.fetch(executeUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validatedRequest),
    })

    if (!response.ok) {
      throw new Error('Failed to execute diagnostic session')
    }

    const result = await response.json()

    return c.json({
      sessionId,
      status: 'completed',
      reportUrl: `https://diagnostics.uniteia.com/${sessionId}/report.json`,
      result,
    })
  } catch (error) {
    logger.error('Failed to start diagnostic session', error as Error)

    if (error.name === 'ZodError') {
      return c.json(
        {
          error: 'Validation Error',
          message: 'Invalid request payload',
          details: error.errors,
        },
        400
      )
    }

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * GET /status/:sessionId - Get session progress
 */
app.get('/status/:sessionId', requireAuth, async (c) => {
  const sessionId = c.req.param('sessionId')
  const logger = createLogger(c.env)

  try {
    const id = c.env.DIAGNOSTIC_SESSION.idFromName(sessionId)
    const stub = c.env.DIAGNOSTIC_SESSION.get(id)

    const progressUrl = new URL('http://fake-host/progress')
    const response = await stub.fetch(progressUrl.toString())

    if (!response.ok) {
      throw new Error('Failed to get session progress')
    }

    const progress = await response.json()

    return c.json(progress)
  } catch (error) {
    logger.error('Failed to get session status', error as Error, { sessionId })

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * GET /report/:sessionId - Get diagnostic report
 */
app.get('/report/:sessionId', requireAuth, async (c) => {
  const sessionId = c.req.param('sessionId')
  const logger = createLogger(c.env)
  const storageService = new StorageService(c.env, logger)

  try {
    const report = await storageService.downloadReport(sessionId)

    if (!report) {
      return c.json(
        {
          error: 'Not Found',
          message: 'Report not found',
        },
        404
      )
    }

    return c.json(report)
  } catch (error) {
    logger.error('Failed to get report', error as Error, { sessionId })

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * GET /screenshot/:sessionId/:page/:type - Get specific screenshot
 */
app.get('/screenshot/:sessionId/:page/:type', async (c) => {
  const { sessionId, page, type } = c.req.param()
  const logger = createLogger(c.env)
  const storageService = new StorageService(c.env, logger)

  try {
    const key = `${sessionId}/screenshots/${page}-${type}.png`
    const buffer = await storageService.downloadScreenshot(key)

    if (!buffer) {
      return c.json(
        {
          error: 'Not Found',
          message: 'Screenshot not found',
        },
        404
      )
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    logger.error('Failed to get screenshot', error as Error, { sessionId, page, type })

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * GET /latest - Get latest session report
 */
app.get('/latest', requireAuth, async (c) => {
  const logger = createLogger(c.env)
  const storageService = new StorageService(c.env, logger)

  try {
    const latestSessionId = await storageService.getLatestSession()

    if (!latestSessionId) {
      return c.json(
        {
          error: 'Not Found',
          message: 'No sessions found',
        },
        404
      )
    }

    const report = await storageService.downloadReport(latestSessionId)

    if (!report) {
      return c.json(
        {
          error: 'Not Found',
          message: 'Report not found',
        },
        404
      )
    }

    return c.json(report)
  } catch (error) {
    logger.error('Failed to get latest report', error as Error)

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * DELETE /session/:sessionId - Delete session data
 */
app.delete('/session/:sessionId', requireAuth, async (c) => {
  const sessionId = c.req.param('sessionId')
  const logger = createLogger(c.env)
  const storageService = new StorageService(c.env, logger)

  try {
    await storageService.deleteSession(sessionId)

    return c.json({
      message: 'Session deleted successfully',
      sessionId,
    })
  } catch (error) {
    logger.error('Failed to delete session', error as Error, { sessionId })

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * GET /health - Health check endpoint
 */
app.get('/health', async (c) => {
  return c.json({
    status: 'healthy',
    service: 'patriciax',
    version: c.env.VERSION,
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  })
})

/**
 * GET /storage/usage - Get storage usage statistics
 */
app.get('/storage/usage', requireAuth, async (c) => {
  const logger = createLogger(c.env)
  const limitsService = new StorageLimitsService(c.env, logger)

  try {
    const usage = await limitsService.getCurrentUsage()
    const limits = limitsService.getLimits()

    return c.json({
      usage,
      limits,
      warnings: usage.limitsExceeded.length > 0 ? usage.limitsExceeded : undefined,
    })
  } catch (error) {
    logger.error('Failed to get storage usage', error as Error)

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * POST /storage/cleanup - Cleanup old sessions
 */
app.post('/storage/cleanup', requireAuth, async (c) => {
  const logger = createLogger(c.env)
  const limitsService = new StorageLimitsService(c.env, logger)

  try {
    const deletedCount = await limitsService.cleanupOldSessions()

    return c.json({
      message: 'Cleanup completed',
      deletedSessions: deletedCount,
    })
  } catch (error) {
    logger.error('Failed to cleanup sessions', error as Error)

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

/**
 * GET /storage/limits - Get storage limits configuration
 */
app.get('/storage/limits', requireAuth, async (c) => {
  const logger = createLogger(c.env)
  const limitsService = new StorageLimitsService(c.env, logger)

  try {
    const limits = limitsService.getLimits()

    return c.json({ limits })
  } catch (error) {
    logger.error('Failed to get storage limits', error as Error)

    return c.json(
      {
        error: 'Internal Server Error',
        message: (error as Error).message,
      },
      500
    )
  }
})

export default app
