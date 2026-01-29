/**
 * PatriciaX - TypeScript Type Definitions
 * Enhanced JSON Schema for Visual Diagnostics
 */

import type { DurableObjectNamespace, KVNamespace, Queue, R2Bucket } from '@cloudflare/workers-types'

// =============================================================================
// ENVIRONMENT BINDINGS
// =============================================================================

export interface Env {
  // Browser Rendering API
  BROWSER: Fetcher

  // Storage
  DIAGNOSTICS_STORAGE: R2Bucket
  DIAGNOSTICS_INDEX: KVNamespace

  // Queue
  DIAGNOSTICS_QUEUE: Queue

  // Durable Object
  DIAGNOSTIC_SESSION: DurableObjectNamespace

  // Secrets
  API_KEY: string
  DATADOG_API_KEY?: string
  SENTRY_DSN?: string

  // Environment variables
  ENVIRONMENT: 'development' | 'staging' | 'production'
  VERSION: string
  DEFAULT_TIMEOUT: string
  MAX_CONCURRENT_PAGES: string
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error'
}

// =============================================================================
// SESSION STATE MACHINE
// =============================================================================

export type SessionState =
  | 'initializing' // Browser launching, setup
  | 'capturing' // Taking screenshots
  | 'diagnosing' // Running visibility checks
  | 'storing' // Uploading to R2/KV
  | 'completed' // Success
  | 'failed' // Error state

export type PageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

// =============================================================================
// DIAGNOSTIC REQUEST & RESPONSE
// =============================================================================

export interface DiagnosticRequest {
  pages: PageConfig[]
  options?: DiagnosticOptions
  metadata?: {
    deploymentId?: string
    environment?: string
    branch?: string
    triggeredBy?: string
    callbackUrl?: string
  }
}

export interface PageConfig {
  path: string
  name?: string
  viewport?: {
    width: number
    height: number
  }
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'
  timeout?: number
  captureOptions?: CaptureOptions
}

export interface CaptureOptions {
  fullPage?: boolean
  components?: string[] // CSS selectors to capture separately
  mobile?: boolean
  darkMode?: boolean
}

export interface DiagnosticOptions {
  parallelPages?: number // Max concurrent pages (default: 5)
  timeout?: number // Global timeout ms (default: 60000)
  retries?: number // Max retry attempts (default: 2)
  checks?: {
    visibility?: boolean
    contrast?: boolean
    brokenImages?: boolean
    lazyLoad?: boolean
    fonts?: boolean
    accessibility?: boolean
    performance?: boolean
  }
}

export interface DiagnosticResponse {
  sessionId: string
  status: SessionState
  message: string
  reportUrl?: string
  estimatedCompletion?: number // Unix timestamp
}

// =============================================================================
// SESSION PROGRESS
// =============================================================================

export interface SessionProgress {
  sessionId: string
  state: SessionState
  startedAt: number
  completedAt?: number
  pages: PageProgress[]
  metadata: SessionMetadata
  summary?: DiagnosticSummary
  error?: ErrorInfo
}

export interface PageProgress {
  path: string
  name: string
  status: PageStatus
  startedAt?: number
  completedAt?: number
  screenshots: ScreenshotInfo[]
  diagnostics?: VisibilityReport
  performance?: PerformanceMetrics
  error?: ErrorInfo
}

export interface ScreenshotInfo {
  type: 'full' | 'header' | 'content' | 'footer' | 'component'
  selector?: string
  url: string // R2 public URL
  key: string // R2 object key
  size: number // Bytes
  dimensions: {
    width: number
    height: number
  }
  capturedAt: number
  hash?: string // SHA-256 for regression detection
}

export interface SessionMetadata {
  deploymentId?: string
  environment: string
  branch?: string
  triggeredBy: 'api' | 'queue' | 'webhook' | 'cron'
  userAgent: string
  browserVersion: string
  options: DiagnosticOptions
}

export interface ErrorInfo {
  code: string
  message: string
  stack?: string
  context?: Record<string, unknown>
  timestamp: number
}

// =============================================================================
// VISIBILITY DIAGNOSTICS
// =============================================================================

export interface VisibilityReport {
  page: string
  timestamp: number
  checks: VisibilityCheck[]
  summary: {
    totalChecks: number
    passed: number
    warnings: number
    failures: number
  }
}

export interface VisibilityCheck {
  type: CheckType
  selector: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: Record<string, unknown>
}

export type CheckType =
  | 'element-visible'
  | 'element-hidden'
  | 'zero-dimensions'
  | 'low-contrast'
  | 'broken-image'
  | 'lazy-load-failed'
  | 'font-not-loaded'
  | 'aria-missing'
  | 'color-contrast'
  | 'layout-shift'

// =============================================================================
// PERFORMANCE METRICS
// =============================================================================

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number // Largest Contentful Paint (ms)
  fid?: number // First Input Delay (ms)
  cls?: number // Cumulative Layout Shift (score)
  fcp?: number // First Contentful Paint (ms)
  ttfb?: number // Time to First Byte (ms)
  tti?: number // Time to Interactive (ms)

  // Playwright metrics
  domContentLoaded?: number
  load?: number
  networkIdle?: number

  // Resource counts
  resources?: {
    total: number
    images: number
    scripts: number
    stylesheets: number
    fonts: number
  }

  // Size metrics
  transferSize?: number // Total bytes transferred
  encodedBodySize?: number // Compressed size
  decodedBodySize?: number // Uncompressed size
}

// =============================================================================
// DIAGNOSTIC SUMMARY
// =============================================================================

export interface DiagnosticSummary {
  sessionId: string
  totalPages: number
  completedPages: number
  failedPages: number
  skippedPages: number
  duration: number // ms
  totalScreenshots: number
  totalIssues: number
  issuesByType: Record<CheckType, number>
  totalWarnings: number
  storageUsed: number // bytes
}

// =============================================================================
// QUEUE MESSAGES
// =============================================================================

export interface DiagnosticQueueMessage {
  sessionId: string
  request: DiagnosticRequest
  enqueuedAt: number
  priority?: 'low' | 'normal' | 'high'
}

// =============================================================================
// STORAGE KEYS
// =============================================================================

export interface StorageKeys {
  // R2 keys
  screenshot: (sessionId: string, page: string, type: string) => string
  report: (sessionId: string) => string
  metadata: (sessionId: string) => string

  // KV keys
  sessionIndex: (sessionId: string) => string
  latestSession: () => string
  deploymentSessions: (deploymentId: string) => string
}

// =============================================================================
// LOGGER INTERFACE
// =============================================================================

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void
  info: (message: string, context?: Record<string, unknown>) => void
  warn: (message: string, context?: Record<string, unknown>) => void
  error: (message: string, error?: Error, context?: Record<string, unknown>) => void
}

// =============================================================================
// AUTHENTICATION
// =============================================================================

export interface AuthContext {
  authenticated: boolean
  apiKey?: string
  source: 'header' | 'query' | 'none'
}

// =============================================================================
// STORAGE LIMITS & QUOTAS
// =============================================================================

export interface StorageLimits {
  // Per-session limits
  maxScreenshotsPerSession: number // Default: 50
  maxScreenshotSizeMB: number // Default: 10MB per screenshot
  maxSessionSizeMB: number // Default: 100MB total per session
  maxSessionDurationMs: number // Default: 300000 (5 minutes)

  // Global limits
  maxTotalStorageMB: number // Default: 1000MB (1GB)
  maxSessionsStored: number // Default: 100 sessions
  maxSessionAgeHours: number // Default: 168 hours (7 days)

  // Rate limits
  maxConcurrentSessions: number // Default: 5
  maxSessionsPerHour: number // Default: 20
  maxSessionsPerDay: number // Default: 100
}

export interface StorageUsage {
  totalSessions: number
  totalStorageMB: number
  oldestSessionAge: number // hours
  sessionsLast24h: number
  currentActiveSessions: number
  limitsExceeded: string[] // Array of limit names exceeded
}

export interface StorageQuotaCheck {
  allowed: boolean
  reason?: string
  currentUsage: StorageUsage
  limits: StorageLimits
}

// =============================================================================
// WEBHOOK PAYLOADS
// =============================================================================

export interface CloudflarePagesWebhook {
  id: string
  environment: string
  deployment_trigger: {
    type: string
    metadata: {
      branch: string
      commit_hash: string
      commit_message: string
    }
  }
  url: string
  created_on: string
  production_branch: string
  project_name: string
}
