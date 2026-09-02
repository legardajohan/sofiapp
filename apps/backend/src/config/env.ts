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
  // Cifrado en reposo de los datos personales del contacto (HU-CRM-02). **Ya no se usa para
  // escribir**: el cifrado está desactivado y los campos se guardan en claro (ver
  // `utils/field-crypto.util`). Sigue aquí para poder LEER lo que quedó cifrado en bases donde sí
  // llegó a escribirse; sin ella, esos valores heredados se devuelven ilegibles pero nada falla.
  // Clave SEPARADA de la de los tokens de Meta: rotar una no obliga a rotar la otra.
  DATA_ENC_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'Must be 64 hex characters (32 bytes)')
    .optional(),

  // LLM / Gemini — sin fallback: el proceso aborta si GEMINI_API_KEY falta
  LLM_PROVIDER: z.enum(['gemini']).default('gemini'),
  GEMINI_API_KEY: z.string().min(1),
  // `gemini-2.5-flash` (y `-flash-lite`) devuelven 404 "no longer available to new users" con API
  // keys creadas recientemente: siguen apareciendo en ListModels pero están cerrados a proyectos
  // nuevos. Verificado contra la API el 2026-07-26.
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  // 45 s, no 15 s: `gemini-3.6-flash` razona antes de responder y gasta tokens de *thinking* que no
  // aparecen en `promptTokens`/`completionTokens`. Un resumen de 11 mensajes medido contra la API
  // real tardó 6,9 / 22,8 / 25,9 s — con 15 s abortaba dos de cada tres veces, y el abort no es
  // reintentable (`isRetryable` solo cubre 429/5xx), así que fallaba de una.
  LLM_TIMEOUT_MS: z.coerce.number().positive().default(45000),
  AI_CACHE_TTL_CHAT_S: z.coerce.number().positive().default(3600),
  AI_CACHE_TTL_CLASSIFY_S: z.coerce.number().positive().default(7200),
  // Ventana de agrupación del auto-reply (HU-IA-02). Los mensajes de un mismo cliente que caen en
  // la misma ventana producen UNA sola respuesta, en vez de una por mensaje: escribir en tres
  // mensajes seguidos es lo normal en WhatsApp, y contestarlos por separado es ruido.
  // Es también latencia deliberada que el cliente percibe, así que súbela con cuidado: 8 s cubren
  // el tecleo de una ráfaga sin que la respuesta deje de sentirse inmediata.
  AI_REPLY_WINDOW_MS: z.coerce.number().positive().default(8000),

  // Semaforización automática por intención de compra (HU-IA-05).
  // Interruptor como enum y NO como booleano: `z.coerce.boolean()` convierte la cadena "false" en
  // `true` (toda cadena no vacía es truthy), que es justo el fallo que un kill-switch no se puede
  // permitir. No hay ningún booleano en este archivo; esto no abre el precedente.
  SEMAFORO_AUTO: z.enum(['on', 'off']).default('on'),
  // Confianza mínima para que la IA ESCRIBA el semáforo. Por debajo solo propone, y la franja de la
  // bandeja ofrece aplicarlo a mano.
  // OJO: escala propia del modelo (él mismo la reporta), SIN relación con KB_MIN_SCORE ni con
  // FAQ_MATCH_THRESHOLD, que son similitudes de coseno normalizadas. Calibrar mirando la bitácora
  // de GET /api/conversations/:id/classifications, nunca a ojo.
  SEMAFORO_MIN_CONFIANZA: z.coerce.number().min(0).max(1).default(0.7),
  // Turnos del CLIENTE que tiene que haber antes de tocar el semáforo. Con 1, un "hola" suelto
  // clasifica como frío y pintaría de azul cada conversación nueva: ruido en toda la bandeja.
  SEMAFORO_MIN_TURNOS_CLIENTE: z.coerce.number().int().positive().default(2),

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
  // Umbral de relevancia del RAG (HU-IA-01). MISMA ESCALA que FAQ_MATCH_THRESHOLD: Atlas normaliza
  // el coseno a (1 + cos) / 2, así que 0.75 ≈ coseno 0.50. A propósito más laxo que el 0.85 de FAQ:
  // allí un match dispara una respuesta literal (caro equivocarse), aquí un chunk solo entra en el
  // contexto y el system prompt ya obliga a decir "no tengo información" si no alcanza.
  // Calibrar con src/scripts/kb-smoke-retrieval.ts, nunca a ojo.
  KB_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.75),

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
