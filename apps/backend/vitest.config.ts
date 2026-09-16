import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// La media de los tests va a un temporal del sistema, no al repo: el adaptador `local` escribe
// archivos de verdad y dejarlos en `./var/media` ensuciaría el árbol de trabajo.
const MEDIA_TMP = path.join(os.tmpdir(), 'sofiapp-test-media');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      PORT: '4001',
      JWT_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      JWT_EXPIRES_IN: '8h',
      CSRF_SECRET: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      MONGODB_URI: 'mongodb://localhost:27017/sofiapp_test_placeholder',
      REDIS_URL: 'redis://127.0.0.1:6379',
      META_APP_SECRET: 'test-app-secret-12345678901234',
      META_VERIFY_TOKEN: 'test-verify-token',
      META_GRAPH_VERSION: 'v19.0',
      TENANT_TOKEN_ENC_KEY: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      // `DATA_ENC_KEY` se deja SIN definir a propósito: es el escenario real de un despliegue que no
      // la configura, y con el cifrado en reposo desactivado (HU-CRM-02) guardar correo, documento,
      // atributos sensibles y notas debe funcionar igual. Si alguien reintroduce una dependencia de
      // esa clave, estos tests lo cazan.
      LLM_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'test-fake-gemini-api-key-for-unit-tests',
      GEMINI_MODEL: 'gemini-2.5-flash',
      LLM_TIMEOUT_MS: '15000',
      AI_CACHE_TTL_CHAT_S: '3600',
      AI_CACHE_TTL_CLASSIFY_S: '7200',
      // Media (HU-OMNI-06): driver local y clave de firma fija, para que los tests de
      // `GET /api/media/:id` puedan firmar y verificar tokens de verdad.
      MEDIA_DRIVER: 'local',
      MEDIA_LOCAL_DIR: MEDIA_TMP,
      MEDIA_URL_SECRET: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      COOKIE_SAMESITE: 'lax',
      SUPERADMIN_EMAIL: 'admin@sofiapp.test',
      SUPERADMIN_PASSWORD: 'super-secret-123',
    },
  },
});
