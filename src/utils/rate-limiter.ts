/**
 * PatriciaX - Browser Rate Limiter
 * Respects Cloudflare Browser Rendering API limits:
 * - 10 concurrent browsers per account
 * - 10 new browsers per minute per account
 */

export class BrowserRateLimiter {
  private readonly maxConcurrent = 10
  private readonly maxPerMinute = 10
  private readonly windowMs = 60000

  private activeBrowsers = 0
  private browserStarts: number[] = []

  canLaunch(): boolean {
    this.cleanOldStarts()
    return this.activeBrowsers < this.maxConcurrent && this.browserStarts.length < this.maxPerMinute
  }

  async waitForSlot(): Promise<void> {
    while (!this.canLaunch()) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  recordStart(): void {
    this.activeBrowsers++
    this.browserStarts.push(Date.now())
  }

  recordEnd(): void {
    this.activeBrowsers = Math.max(0, this.activeBrowsers - 1)
  }

  private cleanOldStarts(): void {
    const cutoff = Date.now() - this.windowMs
    this.browserStarts = this.browserStarts.filter((timestamp) => timestamp > cutoff)
  }

  getStatus() {
    this.cleanOldStarts()
    return {
      activeBrowsers: this.activeBrowsers,
      recentStarts: this.browserStarts.length,
      canLaunch: this.canLaunch(),
      slotsAvailable: {
        concurrent: this.maxConcurrent - this.activeBrowsers,
        perMinute: this.maxPerMinute - this.browserStarts.length,
      },
    }
  }
}
