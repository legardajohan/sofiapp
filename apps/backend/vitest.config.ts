import { defineConfig } from 'vitest/config';

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
      LLM_PROVIDER: 'gemini',
      GEMINI_MODEL: 'gemini-1.5-flash',
      LLM_TIMEOUT_MS: '15000',
      COOKIE_SAMESITE: 'lax',
    },
  },
});
