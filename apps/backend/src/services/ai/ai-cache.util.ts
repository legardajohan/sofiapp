import { createHash } from 'crypto';
import type { Redis } from 'ioredis';

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildCacheKey(
  tenantId: string,
  method: string,
  input: string,
  version: string,
): string {
  const hash = createHash('sha256')
    .update(normalize(JSON.stringify(input)) + version)
    .digest('hex');
  return `ai:${tenantId}:${method}:${hash}`;
}

export async function getCached<T>(redis: Redis, key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCached<T>(
  redis: Redis,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}
