import { Redis } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { createAIService, type AIService } from './ai.service.js';

/**
 * Singleton perezoso de `AIService`. Comparte una única conexión Redis (para la caché de IA)
 * en lugar de crear un cliente por request. Sigue el patrón de `realtime.publisher.ts`.
 * El wiring de proveedor/caché vive en `createAIService`.
 */

let redis: Redis | null = null;
let aiService: AIService | null = null;

export function getAIService(): AIService {
  if (!aiService) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    redis.on('error', (err) => logger.error('Redis AIService error', { error: String(err) }));
    aiService = createAIService(redis);
  }
  return aiService;
}
