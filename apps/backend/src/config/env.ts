import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CSRF_SECRET: z.string().min(32),
  MONGODB_URI: z.string().min(1),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v19.0'),
  TENANT_TOKEN_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64 hex characters (32 bytes)')
    .optional(),

  // LLM / Gemini — sin fallback: el proceso aborta si GEMINI_API_KEY falta
  LLM_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  LLM_TIMEOUT_MS: z.coerce.number().positive().default(15000),
  AI_CACHE_TTL_CHAT_S: z.coerce.number().positive().default(3600),
  AI_CACHE_TTL_CLASSIFY_S: z.coerce.number().positive().default(7200),

  // TRM oficial USD/COP — Superintendencia Financiera vía datos.gov.co (recurso 32sa-8pi3, SODA API).
  TRM_DATASET_URL: z
    .string()
    .url()
    .default('https://www.datos.gov.co/resource/32sa-8pi3.json'),
  TRM_HTTP_TIMEOUT_MS: z.coerce.number().positive().default(8000),

  // Knowledge Base / RAG (HU-KB-01)
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-001'),
  KB_EMBED_DIM: z.coerce.number().positive().default(768),
  KB_CHUNK_SIZE: z.coerce.number().positive().default(1000),
  KB_CHUNK_OVERLAP: z.coerce.number().nonnegative().default(150),
  KB_VECTOR_INDEX: z.string().default('kb_chunks_vector'),
  KB_RETRIEVAL_K: z.coerce.number().positive().default(5),

  // FAQ semántica (HU-KB-02) — cortocircuito del LLM por coincidencia de preguntas frecuentes.
  // OJO con la escala: Atlas normaliza el coseno a (1 + cos) / 2, así que 0.85 ≈ coseno 0.70.
  // Calibrar con POST /api/kb/faqs/test, nunca a ojo.
  FAQ_VECTOR_INDEX: z.string().default('kb_faqs_vector'),
  FAQ_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),

  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  SUPERADMIN_EMAIL: z.string().email().optional(),
  SUPERADMIN_PASSWORD: z.string().min(8).optional(),
  SALT_ROUNDS: z.coerce.number().default(12),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
