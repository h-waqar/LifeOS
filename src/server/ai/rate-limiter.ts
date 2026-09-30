if (typeof window !== "undefined" && !process.env.VITEST) {
  throw new Error("This module can only be imported in server context.");
}

// Sliding window rate limiter: 20 requests per minute per user
const rateLimitMap = new Map<string, number[]>();
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const MAX_REQUESTS_PER_WINDOW = 20;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitMap.get(userId) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

export function resetRateLimitForTesting(): void {
  rateLimitMap.clear();
}
