import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test_jwt_secret_32_chars_minimum_ok',
      CSRF_SECRET: 'test_csrf_secret_32_chars_minimum_ok',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sofiapp_test',
      WEB_ORIGIN: 'http://localhost:5173',
      JWT_EXPIRES_IN: '1h',
    },
  },
});
