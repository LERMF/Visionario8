/**
 * PatriciaX - Structured Logger
 * JSON-formatted logging with context support
 */

import type { Env, Logger } from '../types'

export type { Logger }

export function createLogger(env: Env): Logger {
  const logLevel = env.LOG_LEVEL || 'info'
  const levels = { debug: 0, info: 1, warn: 2, error: 3 }
  const currentLevel = levels[logLevel]

  const log = (
    level: keyof typeof levels,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ) => {
    if (levels[level] < currentLevel) return

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      environment: env.ENVIRONMENT,
      version: env.VERSION,
      message,
      ...(context && { context }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    }

    console.log(JSON.stringify(logEntry))
  }

  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      log('debug', message, context),
    info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
    warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
    error: (message: string, error?: Error, context?: Record<string, unknown>) =>
      log('error', message, context, error),
  }
}
