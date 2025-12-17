/**
 * Simple in-memory rate limiter for WebSocket messages
 *
 * Tracks message counts per user and enforces configurable limits.
 * Resets counters after time window expires.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp (ms)
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private maxMessages: number;
  private windowMs: number;

  /**
   * @param maxMessages Maximum messages allowed per window (default: 10)
   * @param windowMs Time window in milliseconds (default: 60000 = 1 minute)
   */
  constructor(maxMessages: number = 10, windowMs: number = 60000) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;

    // Cleanup expired entries every minute
    // .unref() allows Jest to exit without waiting for this timer
    setInterval(() => this.cleanup(), 60000).unref();
  }

  /**
   * Check if user has exceeded rate limit
   *
   * @param userId User identifier
   * @returns true if rate limit exceeded, false if allowed
   */
  isRateLimited(userId: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(userId);

    // No entry or expired - allow and create new entry
    if (!entry || now > entry.resetAt) {
      this.limits.set(userId, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return false;
    }

    // Check if under limit
    if (entry.count < this.maxMessages) {
      entry.count++;
      return false;
    }

    // Rate limit exceeded
    return true;
  }

  /**
   * Get remaining requests for a user
   */
  getRemaining(userId: string): number {
    const entry = this.limits.get(userId);
    if (!entry || Date.now() > entry.resetAt) {
      return this.maxMessages;
    }
    return Math.max(0, this.maxMessages - entry.count);
  }

  /**
   * Get reset time for a user (seconds until reset)
   */
  getResetTime(userId: string): number {
    const entry = this.limits.get(userId);
    if (!entry || Date.now() > entry.resetAt) {
      return 0;
    }
    return Math.ceil((entry.resetAt - Date.now()) / 1000);
  }

  /**
   * Reset rate limit for a specific user (for testing or admin override)
   */
  reset(userId: string): void {
    this.limits.delete(userId);
  }

  /**
   * Cleanup expired entries to prevent memory leak
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [userId, entry] of this.limits.entries()) {
      if (now > entry.resetAt) {
        this.limits.delete(userId);
      }
    }
  }
}
