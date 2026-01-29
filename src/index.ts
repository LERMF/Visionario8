/**
 * PatriciaX - Main Worker Entry Point
 * Cloudflare Worker for Playwright-powered visual diagnostics
 *
 * @version 1.0.0
 * @author UniTeiaAI Team
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, DiagnosticQueueMessage } from './types'
import { createLogger } from './utils/logger'

// Export Durable Object
export { DiagnosticSession } from './durable-objects/DiagnosticSession'

// Import routes
import apiRoutes from './routes/api'
import webhookRoutes from './routes/webhook'

// =============================================================================
// MAIN APPLICATION
// =============================================================================

const app = new Hono<{ Bindings: Env }>()

// =============================================================================
// MIDDLEWARE
// =============================================================================

// CORS middleware
app.use('*', cors({
  origin: ['https://uniteia.com', 'https://www.uniteia.com'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  maxAge: 86400,
}))

// Request logging
app.use('*', async (c, next) => {
  const logger = createLogger(c.env)
  const start = Date.now()

  logger.info('Incoming request', {
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header('User-Agent'),
  })

  await next()

  const duration = Date.now() - start

  logger.info('Request completed', {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration,
  })
})

// =============================================================================
// ROUTES
// =============================================================================

// API routes
app.route('/api', apiRoutes)

// Webhook routes
app.route('/webhook', webhookRoutes)

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'PatriciaX',
    description: 'Visual diagnostics worker powered by Playwright on Cloudflare Workers',
    version: c.env.VERSION,
    environment: c.env.ENVIRONMENT,
    endpoints: {
      api: {
        run: 'POST /api/run',
        status: 'GET /api/status/:sessionId',
        report: 'GET /api/report/:sessionId',
        screenshot: 'GET /api/screenshot/:sessionId/:page/:type',
        latest: 'GET /api/latest',
        delete: 'DELETE /api/session/:sessionId',
        health: 'GET /api/health',
      },
      webhooks: {
        deployment: 'POST /webhook/deployment',
      },
    },
    docs: 'https://github.com/uniteia/patriciax',
  })
})

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      path: c.req.path,
    },
    404
  )
})

// Error handler
app.onError((error, c) => {
  const logger = createLogger(c.env)
  logger.error('Unhandled error', error)

  return c.json(
    {
      error: 'Internal Server Error',
      message: error.message,
      ...(c.env.ENVIRONMENT === 'development' && { stack: error.stack }),
    },
    500
  )
})

// =============================================================================
// QUEUE CONSUMER
// =============================================================================

async function handleQueue(
  batch: MessageBatch<DiagnosticQueueMessage>,
  env: Env
): Promise<void> {
  const logger = createLogger(env)

  logger.info('Processing queue batch', {
    size: batch.messages.length,
  })

  for (const message of batch.messages) {
    try {
      const payload = message.body

      logger.info('Processing diagnostic job from queue', {
        sessionId: payload.sessionId,
        pages: payload.request.pages.length,
      })

      // Create Durable Object session
      const id = env.DIAGNOSTIC_SESSION.idFromName(payload.sessionId)
      const stub = env.DIAGNOSTIC_SESSION.get(id)

      // Execute diagnostics
      const executeUrl = new URL('http://fake-host/execute')
      const response = await stub.fetch(executeUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.request),
      })

      if (!response.ok) {
        throw new Error('Failed to execute diagnostic session')
      }

      const result = await response.json()

      logger.info('Diagnostic job completed', {
        sessionId: payload.sessionId,
        summary: result.summary,
      })

      // Acknowledge message
      message.ack()
    } catch (error) {
      logger.error('Failed to process queue message', error as Error, {
        messageId: message.id,
      })

      // Retry message
      message.retry()
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  fetch: app.fetch,
  queue: handleQueue,
}
