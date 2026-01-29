/**
 * PatriciaX - Storage Limits & Quota Management
 * Enforces storage and rate limits to prevent resource exhaustion
 */

import type {
  Env,
  StorageLimits,
  StorageUsage,
  StorageQuotaCheck,
} from '../types'
import type { Logger } from '../utils/logger'

// =============================================================================
// DEFAULT LIMITS
// =============================================================================

export const DEFAULT_LIMITS: StorageLimits = {
  // Per-session limits
  maxScreenshotsPerSession: 50,
  maxScreenshotSizeMB: 10,
  maxSessionSizeMB: 100,
  maxSessionDurationMs: 300000, // 5 minutes

  // Global limits
  maxTotalStorageMB: 1000, // 1GB
  maxSessionsStored: 100,
  maxSessionAgeHours: 168, // 7 days

  // Rate limits
  maxConcurrentSessions: 5,
  maxSessionsPerHour: 20,
  maxSessionsPerDay: 100,
}

// =============================================================================
// STORAGE LIMITS SERVICE
// =============================================================================

export class StorageLimitsService {
  constructor(
    private env: Env,
    private logger: Logger,
    private limits: StorageLimits = DEFAULT_LIMITS,
  ) {}

  /**
   * Check if a new session can be created
   */
  async checkQuota(): Promise<StorageQuotaCheck> {
    const usage = await this.getCurrentUsage()

    // Check concurrent sessions
    if (usage.currentActiveSessions >= this.limits.maxConcurrentSessions) {
      return {
        allowed: false,
        reason: `Maximum concurrent sessions limit reached (${this.limits.maxConcurrentSessions})`,
        currentUsage: usage,
        limits: this.limits,
      }
    }

    // Check hourly rate limit
    if (usage.sessionsLast24h >= this.limits.maxSessionsPerDay) {
      return {
        allowed: false,
        reason: `Daily session limit reached (${this.limits.maxSessionsPerDay})`,
        currentUsage: usage,
        limits: this.limits,
      }
    }

    // Check total storage
    if (usage.totalStorageMB >= this.limits.maxTotalStorageMB) {
      return {
        allowed: false,
        reason: `Total storage limit reached (${this.limits.maxTotalStorageMB}MB)`,
        currentUsage: usage,
        limits: this.limits,
      }
    }

    // Check total sessions
    if (usage.totalSessions >= this.limits.maxSessionsStored) {
      return {
        allowed: false,
        reason: `Maximum sessions limit reached (${this.limits.maxSessionsStored})`,
        currentUsage: usage,
        limits: this.limits,
      }
    }

    return {
      allowed: true,
      currentUsage: usage,
      limits: this.limits,
    }
  }

  /**
   * Check if a screenshot can be uploaded
   */
  checkScreenshotSize(sizeBytes: number, sessionScreenshotCount: number): boolean {
    const sizeMB = sizeBytes / (1024 * 1024)

    if (sizeMB > this.limits.maxScreenshotSizeMB) {
      this.logger.warn('Screenshot exceeds size limit', {
        sizeMB,
        limit: this.limits.maxScreenshotSizeMB,
      })
      return false
    }

    if (sessionScreenshotCount >= this.limits.maxScreenshotsPerSession) {
      this.logger.warn('Session screenshot count limit reached', {
        count: sessionScreenshotCount,
        limit: this.limits.maxScreenshotsPerSession,
      })
      return false
    }

    return true
  }

  /**
   * Check if session size is within limits
   */
  checkSessionSize(totalBytes: number): boolean {
    const totalMB = totalBytes / (1024 * 1024)
    return totalMB <= this.limits.maxSessionSizeMB
  }

  /**
   * Get current storage usage
   */
  async getCurrentUsage(): Promise<StorageUsage> {
    try {
      // Get all session keys from KV
      const sessionKeys = await this.listAllSessionKeys()

      let totalStorageBytes = 0
      let oldestSessionTimestamp = Date.now()
      let sessionsLast24h = 0
      let currentActiveSessions = 0

      const now = Date.now()
      const oneDayAgo = now - 24 * 60 * 60 * 1000

      // Iterate through sessions to calculate usage
      for (const key of sessionKeys) {
        const sessionData = await this.env.DIAGNOSTICS_INDEX.get(key, 'json')
        if (!sessionData) continue

        const session = sessionData as {
          startedAt: number
          completedAt?: number
          storageUsed?: number
          state: string
        }

        // Count active sessions
        if (session.state !== 'completed' && session.state !== 'failed') {
          currentActiveSessions++
        }

        // Track oldest session
        if (session.startedAt < oldestSessionTimestamp) {
          oldestSessionTimestamp = session.startedAt
        }

        // Count recent sessions
        if (session.startedAt > oneDayAgo) {
          sessionsLast24h++
        }

        // Sum storage usage
        if (session.storageUsed) {
          totalStorageBytes += session.storageUsed
        }
      }

      const totalStorageMB = totalStorageBytes / (1024 * 1024)
      const oldestSessionAge = (now - oldestSessionTimestamp) / (1000 * 60 * 60) // hours

      const limitsExceeded: string[] = []
      if (totalStorageMB >= this.limits.maxTotalStorageMB) {
        limitsExceeded.push('maxTotalStorageMB')
      }
      if (sessionKeys.length >= this.limits.maxSessionsStored) {
        limitsExceeded.push('maxSessionsStored')
      }
      if (currentActiveSessions >= this.limits.maxConcurrentSessions) {
        limitsExceeded.push('maxConcurrentSessions')
      }
      if (sessionsLast24h >= this.limits.maxSessionsPerDay) {
        limitsExceeded.push('maxSessionsPerDay')
      }

      return {
        totalSessions: sessionKeys.length,
        totalStorageMB,
        oldestSessionAge,
        sessionsLast24h,
        currentActiveSessions,
        limitsExceeded,
      }
    } catch (error) {
      this.logger.error('Failed to get current usage', error as Error)
      // Return safe defaults on error
      return {
        totalSessions: 0,
        totalStorageMB: 0,
        oldestSessionAge: 0,
        sessionsLast24h: 0,
        currentActiveSessions: 0,
        limitsExceeded: [],
      }
    }
  }

  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(): Promise<number> {
    try {
      const sessionKeys = await this.listAllSessionKeys()
      const now = Date.now()
      const maxAge = this.limits.maxSessionAgeHours * 60 * 60 * 1000
      let deletedCount = 0

      for (const key of sessionKeys) {
        const sessionData = await this.env.DIAGNOSTICS_INDEX.get(key, 'json')
        if (!sessionData) continue

        const session = sessionData as { startedAt: number; sessionId: string }
        const age = now - session.startedAt

        if (age > maxAge) {
          await this.deleteSession(session.sessionId)
          deletedCount++
        }
      }

      if (deletedCount > 0) {
        this.logger.info('Cleaned up old sessions', { deletedCount })
      }

      return deletedCount
    } catch (error) {
      this.logger.error('Failed to cleanup old sessions', error as Error)
      return 0
    }
  }

  /**
   * Delete a session and all its data
   */
  private async deleteSession(sessionId: string): Promise<void> {
    // Delete from KV
    await this.env.DIAGNOSTICS_INDEX.delete(`session:${sessionId}`)

    // Delete from R2 (all objects with sessionId prefix)
    const objects = await this.env.DIAGNOSTICS_STORAGE.list({
      prefix: `${sessionId}/`,
    })

    for (const obj of objects.objects) {
      await this.env.DIAGNOSTICS_STORAGE.delete(obj.key)
    }

    this.logger.debug('Deleted session', { sessionId })
  }

  /**
   * List all session keys from KV
   */
  private async listAllSessionKeys(): Promise<string[]> {
    const keys: string[] = []
    let cursor: string | undefined

    do {
      const list = await this.env.DIAGNOSTICS_INDEX.list({
        prefix: 'session:',
        cursor,
      })

      keys.push(...list.keys.map((k) => k.name))
      cursor = list.list_complete ? undefined : list.cursor
    } while (cursor)

    return keys
  }

  /**
   * Get storage limits configuration
   */
  getLimits(): StorageLimits {
    return { ...this.limits }
  }

  /**
   * Update storage limits (useful for testing)
   */
  updateLimits(newLimits: Partial<StorageLimits>): void {
    this.limits = { ...this.limits, ...newLimits }
    this.logger.info('Updated storage limits', { limits: this.limits })
  }
}
