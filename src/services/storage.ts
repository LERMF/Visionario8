/**
 * PatriciaX - Storage Service
 * Handles R2 uploads and KV indexing
 */

import type { Env, Logger, ScreenshotInfo, SessionProgress } from '../types'

export class StorageService {
  constructor(
    private env: Env,
    private logger: Logger
  ) {}

  /**
   * Upload screenshot to R2
   */
  async uploadScreenshot(
    sessionId: string,
    pageName: string,
    type: string,
    buffer: Buffer
  ): Promise<{ key: string; url: string }> {
    const key = `${sessionId}/screenshots/${pageName}-${type}.png`

    this.logger.debug('Uploading screenshot to R2', { key, size: buffer.length })

    try {
      await this.env.DIAGNOSTICS_STORAGE.put(key, buffer, {
        httpMetadata: {
          contentType: 'image/png',
        },
        customMetadata: {
          sessionId,
          pageName,
          type,
          uploadedAt: new Date().toISOString(),
        },
      })

      // Generate public URL (assuming bucket has public access configured)
      const url = `https://diagnostics.uniteia.com/${key}`

      this.logger.debug('Screenshot uploaded successfully', { key, url })

      return { key, url }
    } catch (error) {
      this.logger.error('Failed to upload screenshot', error as Error, { key })
      throw error
    }
  }

  /**
   * Upload diagnostic report to R2
   */
  async uploadReport(sessionId: string, report: SessionProgress): Promise<string> {
    const key = `${sessionId}/report.json`

    this.logger.debug('Uploading diagnostic report', { sessionId, key })

    try {
      const reportJson = JSON.stringify(report, null, 2)

      await this.env.DIAGNOSTICS_STORAGE.put(key, reportJson, {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          sessionId,
          uploadedAt: new Date().toISOString(),
        },
      })

      const url = `https://diagnostics.uniteia.com/${key}`

      this.logger.info('Report uploaded successfully', { sessionId, url })

      return url
    } catch (error) {
      this.logger.error('Failed to upload report', error as Error, { sessionId })
      throw error
    }
  }

  /**
   * Index session in KV for quick lookup
   */
  async indexSession(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    this.logger.debug('Indexing session in KV', { sessionId })

    try {
      const key = `session:${sessionId}`
      await this.env.DIAGNOSTICS_INDEX.put(key, JSON.stringify(metadata), {
        expirationTtl: 2592000, // 30 days
      })

      // Update latest session pointer
      await this.env.DIAGNOSTICS_INDEX.put('session:latest', sessionId)

      // Index by deployment ID if present
      if (metadata.deploymentId) {
        const deploymentKey = `deployment:${metadata.deploymentId}`
        await this.env.DIAGNOSTICS_INDEX.put(deploymentKey, sessionId)
      }

      this.logger.debug('Session indexed successfully', { sessionId })
    } catch (error) {
      this.logger.error('Failed to index session', error as Error, { sessionId })
      throw error
    }
  }

  /**
   * Get session metadata from KV
   */
  async getSession(sessionId: string): Promise<Record<string, unknown> | null> {
    try {
      const key = `session:${sessionId}`
      const data = await this.env.DIAGNOSTICS_INDEX.get(key, 'json')
      return data as Record<string, unknown> | null
    } catch (error) {
      this.logger.error('Failed to get session', error as Error, { sessionId })
      return null
    }
  }

  /**
   * Get latest session ID
   */
  async getLatestSession(): Promise<string | null> {
    try {
      return await this.env.DIAGNOSTICS_INDEX.get('session:latest')
    } catch (error) {
      this.logger.error('Failed to get latest session', error as Error)
      return null
    }
  }

  /**
   * Get session by deployment ID
   */
  async getSessionByDeployment(deploymentId: string): Promise<string | null> {
    try {
      const key = `deployment:${deploymentId}`
      return await this.env.DIAGNOSTICS_INDEX.get(key)
    } catch (error) {
      this.logger.error('Failed to get session by deployment', error as Error, { deploymentId })
      return null
    }
  }

  /**
   * Download screenshot from R2
   */
  async downloadScreenshot(key: string): Promise<Buffer | null> {
    try {
      const object = await this.env.DIAGNOSTICS_STORAGE.get(key)
      if (!object) {
        this.logger.warn('Screenshot not found', { key })
        return null
      }

      const arrayBuffer = await object.arrayBuffer()
      return Buffer.from(arrayBuffer)
    } catch (error) {
      this.logger.error('Failed to download screenshot', error as Error, { key })
      return null
    }
  }

  /**
   * Download report from R2
   */
  async downloadReport(sessionId: string): Promise<SessionProgress | null> {
    try {
      const key = `${sessionId}/report.json`
      const object = await this.env.DIAGNOSTICS_STORAGE.get(key)

      if (!object) {
        this.logger.warn('Report not found', { sessionId, key })
        return null
      }

      const json = await object.json()
      return json as SessionProgress
    } catch (error) {
      this.logger.error('Failed to download report', error as Error, { sessionId })
      return null
    }
  }

  /**
   * List all screenshots for a session
   */
  async listScreenshots(sessionId: string): Promise<string[]> {
    try {
      const prefix = `${sessionId}/screenshots/`
      const listed = await this.env.DIAGNOSTICS_STORAGE.list({ prefix })

      return listed.objects.map((obj) => obj.key)
    } catch (error) {
      this.logger.error('Failed to list screenshots', error as Error, { sessionId })
      return []
    }
  }

  /**
   * Delete session data (screenshots + report)
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.logger.info('Deleting session data', { sessionId })

    try {
      // List all objects for this session
      const prefix = `${sessionId}/`
      const listed = await this.env.DIAGNOSTICS_STORAGE.list({ prefix })

      // Delete all objects
      await Promise.all(listed.objects.map((obj) => this.env.DIAGNOSTICS_STORAGE.delete(obj.key)))

      // Remove KV index
      await this.env.DIAGNOSTICS_INDEX.delete(`session:${sessionId}`)

      this.logger.info('Session deleted successfully', { sessionId })
    } catch (error) {
      this.logger.error('Failed to delete session', error as Error, { sessionId })
      throw error
    }
  }
}
