/**
 * PatriciaX - Authentication Service
 * API key validation middleware
 */

import type { Context, Next } from 'hono'
import type { AuthContext, Env } from '../types'

/**
 * Authenticate request via API key
 */
export async function authenticate(c: Context<{ Bindings: Env }>): Promise<AuthContext> {
  // Check X-API-Key header (preferred)
  const headerKey = c.req.header('X-API-Key')
  if (headerKey && headerKey === c.env.API_KEY) {
    return {
      authenticated: true,
      apiKey: headerKey,
      source: 'header',
    }
  }

  // Check Authorization Bearer token
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token === c.env.API_KEY) {
      return {
        authenticated: true,
        apiKey: token,
        source: 'header',
      }
    }
  }

  // Check query parameter (less secure, for webhooks only)
  const queryKey = c.req.query('api_key')
  if (queryKey && queryKey === c.env.API_KEY) {
    return {
      authenticated: true,
      apiKey: queryKey,
      source: 'query',
    }
  }

  return {
    authenticated: false,
    source: 'none',
  }
}

/**
 * Middleware: Require authentication
 */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const auth = await authenticate(c)

  if (!auth.authenticated) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Valid API key required. Provide via X-API-Key header or Authorization: Bearer token',
      },
      401
    )
  }

  // Store auth context for downstream handlers
  c.set('auth', auth)

  await next()
}
