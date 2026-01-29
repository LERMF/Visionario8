/**
 * PatriciaX - Webhook Handler
 * Cloudflare Pages deployment integration
 */

import { Hono } from 'hono'
import type { DiagnosticRequest, Env } from '../types'
import { createLogger } from '../utils/logger'
import { pagesWebhookSchema } from '../utils/schema'

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /webhook/deployment - Cloudflare Pages deployment hook
 */
app.post('/deployment', async (c) => {
  const logger = createLogger(c.env)

  try {
    const body = await c.req.json()

    // Validate webhook payload
    const webhook = pagesWebhookSchema.parse(body)

    logger.info('Received deployment webhook', {
      deploymentId: webhook.id,
      environment: webhook.environment,
      branch: webhook.deployment_trigger.metadata.branch,
      project: webhook.project_name,
    })

    // Only trigger diagnostics for production branch
    if (webhook.deployment_trigger.metadata.branch !== webhook.production_branch) {
      logger.info('Skipping diagnostics for non-production branch', {
        branch: webhook.deployment_trigger.metadata.branch,
      })

      return c.json({
        message: 'Diagnostics skipped (non-production branch)',
        deploymentId: webhook.id,
      })
    }

    // Define default pages to test
    const defaultPages = [
      { path: '/', name: 'homepage' },
      { path: '/comparativos', name: 'comparativos' },
      { path: '/reviews', name: 'reviews' },
      { path: '/guias', name: 'guias' },
      { path: '/map', name: 'map' },
    ]

    // Create diagnostic request
    const diagnosticRequest: DiagnosticRequest = {
      pages: defaultPages,
      metadata: {
        deploymentId: webhook.id,
        environment: webhook.environment,
        branch: webhook.deployment_trigger.metadata.branch,
        triggeredBy: 'webhook',
      },
    }

    // Queue diagnostic job
    await c.env.DIAGNOSTICS_QUEUE.send({
      sessionId: crypto.randomUUID(),
      request: diagnosticRequest,
      enqueuedAt: Date.now(),
      priority: 'normal',
    })

    logger.info('Diagnostic job queued', {
      deploymentId: webhook.id,
    })

    return c.json({
      message: 'Diagnostic job queued successfully',
      deploymentId: webhook.id,
      pagesQueued: defaultPages.length,
    })
  } catch (error) {
    logger.error('Failed to process deployment webhook', error as Error)

    if (error.name === 'ZodError') {
      return c.json(
        {
          error: 'Validation Error',
          message: 'Invalid webhook payload',
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

export default app
