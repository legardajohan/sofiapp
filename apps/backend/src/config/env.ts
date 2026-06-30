import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url(),

  // Auth — sin fallback: el proceso aborta si faltan
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CSRF_SECRET: z.string().min(32),

  // Base de datos
  MONGODB_URI: z.string().min(1),

  // Redis (BullMQ broker)
  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().default(6379),

  // LLM / Gemini — sin fallback: el proceso aborta si GEMINI_API_KEY falta
  LLM_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),
  LLM_TIMEOUT_MS: z.coerce.number().positive().default(15000),
  AI_CACHE_TTL_CHAT_S: z.coerce.number().positive().default(3600),
  AI_CACHE_TTL_CLASSIFY_S: z.coerce.number().positive().default(7200),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
