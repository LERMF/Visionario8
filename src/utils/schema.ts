/**
 * PatriciaX - Zod Schema Validation
 * Runtime validation for API requests
 */

import { z } from 'zod'

// =============================================================================
// PAGE CONFIG SCHEMA
// =============================================================================

export const viewportSchema = z.object({
  width: z.number().int().min(320).max(3840).default(1920),
  height: z.number().int().min(240).max(2160).default(1080),
})

export const captureOptionsSchema = z.object({
  fullPage: z.boolean().default(true),
  components: z.array(z.string()).optional(),
  mobile: z.boolean().default(false),
  darkMode: z.boolean().default(false),
})

export const pageConfigSchema = z.object({
  path: z.string().regex(/^\//, 'Path must start with /'),
  name: z.string().optional(),
  viewport: viewportSchema.optional(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('networkidle'),
  timeout: z.number().int().min(5000).max(120000).default(60000),
  captureOptions: captureOptionsSchema.optional(),
})

// =============================================================================
// DIAGNOSTIC OPTIONS SCHEMA
// =============================================================================

export const diagnosticOptionsSchema = z.object({
  parallelPages: z.number().int().min(1).max(10).default(5),
  timeout: z.number().int().min(10000).max(300000).default(60000),
  retries: z.number().int().min(0).max(5).default(2),
  checks: z
    .object({
      visibility: z.boolean().default(true),
      contrast: z.boolean().default(true),
      brokenImages: z.boolean().default(true),
      lazyLoad: z.boolean().default(false),
      fonts: z.boolean().default(false),
      accessibility: z.boolean().default(false),
      performance: z.boolean().default(false),
    })
    .optional(),
})

// =============================================================================
// DIAGNOSTIC REQUEST SCHEMA
// =============================================================================

export const diagnosticRequestSchema = z.object({
  pages: z.array(pageConfigSchema).min(1).max(20),
  options: diagnosticOptionsSchema.optional(),
  metadata: z
    .object({
      deploymentId: z.string().optional(),
      environment: z.string().optional(),
      branch: z.string().optional(),
      triggeredBy: z.string().optional(),
      callbackUrl: z.string().url().optional(),
    })
    .optional(),
})

// =============================================================================
// CLOUDFLARE PAGES WEBHOOK SCHEMA
// =============================================================================

export const pagesWebhookSchema = z.object({
  id: z.string(),
  environment: z.string(),
  deployment_trigger: z.object({
    type: z.string(),
    metadata: z.object({
      branch: z.string(),
      commit_hash: z.string(),
      commit_message: z.string(),
    }),
  }),
  url: z.string().url(),
  created_on: z.string(),
  production_branch: z.string(),
  project_name: z.string(),
})

// =============================================================================
// TYPE EXPORTS (Inferred from Zod schemas)
// =============================================================================

export type ViewportSchema = z.infer<typeof viewportSchema>
export type CaptureOptionsSchema = z.infer<typeof captureOptionsSchema>
export type PageConfigSchema = z.infer<typeof pageConfigSchema>
export type DiagnosticOptionsSchema = z.infer<typeof diagnosticOptionsSchema>
export type DiagnosticRequestSchema = z.infer<typeof diagnosticRequestSchema>
export type PagesWebhookSchema = z.infer<typeof pagesWebhookSchema>
