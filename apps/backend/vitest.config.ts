import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Ruta absoluta a .mongodb-binaries/ en la raíz del monorepo
const mongodbBinaries = path.resolve(__dirname, '../../.mongodb-binaries');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    hookTimeout: 120_000, // 2 min — cubre extracción del zip de MongoDB ya descargado
    env: {
      NODE_ENV: 'test',
      PORT: '4001',
      WEB_ORIGIN: 'http://localhost:5173',
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long!!',
      JWT_EXPIRES_IN: '8h',
      CSRF_SECRET: 'test-csrf-secret-at-least-32-characters-long!',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/sofiapp_test',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      // mongodb-memory-server: usar el zip ya descargado en .mongodb-binaries/
      MONGOMS_DOWNLOAD_DIR: mongodbBinaries,
      MONGOMS_MD5_CHECK: 'false', // el zip fue descargado con curl, no necesitamos re-verificar
      MONGOMS_PREFER_GLOBAL_PATH: 'false', // forzar uso del downloadDir, no ~/.cache
    },
  },
});
