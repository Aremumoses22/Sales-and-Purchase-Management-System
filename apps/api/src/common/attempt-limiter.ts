interface Window {
  count: number;
  startedAt: number;
}

/** In-memory fixed-window limiter for failed sign-in attempts. */
export class AttemptLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const window = this.activeWindow(key, now);
    return window !== undefined && window.count >= this.maxAttempts;
  }

  recordFailure(key: string, now = Date.now()): void {
    const window = this.activeWindow(key, now);
    if (window) {
      window.count += 1;
    } else {
      this.prune(now);
      this.windows.set(key, { count: 1, startedAt: now });
    }
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  retryAfterSeconds(key: string, now = Date.now()): number {
    const window = this.activeWindow(key, now);
    return window ? Math.ceil((window.startedAt + this.windowMs - now) / 1000) : 0;
  }

  private activeWindow(key: string, now: number): Window | undefined {
    const window = this.windows.get(key);
    if (window && now - window.startedAt >= this.windowMs) {
      this.windows.delete(key);
      return undefined;
    }
    return window;
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
  }
}
