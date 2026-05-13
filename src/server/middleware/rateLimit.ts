import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function checkBucket(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    buckets.set(key, next);
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function rateLimit(options: {
  key: (request: Request) => string;
  limit: number;
  windowMs: number;
  message: string;
}) {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = checkBucket(options.key(request), options.limit, options.windowMs);
    response.setHeader("x-ratelimit-remaining", String(result.remaining));
    response.setHeader("x-ratelimit-reset", String(result.resetAt));
    if (!result.allowed) {
      response.status(429).json({ error: options.message });
      return;
    }
    next();
  };
}
