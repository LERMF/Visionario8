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
// SSRF DEFENSE / PUBLIC URL SCHEMA
// =============================================================================

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === 'metadata.google.internal' || !host.includes('.')) {
    return true
  }

  // Check IPv4 ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
  const match = host.match(ipv4Regex)
  if (match) {
    const [, b0, b1, b2, b3] = match.map(Number)
    if (b0 > 255 || b1 > 255 || b2 > 255 || b3 > 255) return true
    if (b0 === 0) return true                               // 0.0.0.0/8
    if (b0 === 10) return true                              // 10.0.0.0/8 (RFC 1918)
    if (b0 === 127) return true                             // 127.0.0.0/8 (Loopback)
    if (b0 === 169 && b1 === 254) return true               // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true    // 172.16.0.0/12 (RFC 1918)
    if (b0 === 192 && b1 === 168) return true              // 192.168.0.0/16 (RFC 1918)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true   // 100.64.0.0/10 (Shared address space)
    if (b0 === 192 && b1 === 0 && b2 === 2) return true     // 192.0.2.0/24 (TEST-NET-1)
    if (b0 === 198 && b1 === 51 && b2 === 100) return true // 198.51.100.0/24 (TEST-NET-2)
    if (b0 === 203 && b1 === 0 && b2 === 113) return true  // 203.0.113.0/24 (TEST-NET-3)
    if (b0 >= 224) return true                              // 224.0.0.0/4 (Multicast / Reserved)
    return false
  }

  // Check IPv6 loopback / unique local / link-local
  if (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    return true
  }

  return false
}

export const publicUrlSchema = z.string().url().refine((val) => {
  try {
    const parsed = new URL(val)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    return !isPrivateOrReservedHost(parsed.hostname)
  } catch {
    return false
  }
}, {
  message: 'URL must be a valid public HTTP/HTTPS URL (private networks, loopback, and metadata services are blocked)',
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
      callbackUrl: publicUrlSchema.optional(),
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
  url: publicUrlSchema,
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
export type PublicUrlSchema = z.infer<typeof publicUrlSchema>
