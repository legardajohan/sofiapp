/// <reference types="vitest/config" />
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // El default de 5 s se queda corto para los tests que usan `userEvent`: simula escritura
    // realista (un evento por tecla, con sus esperas) y bajo carga paralela varios rozaban los
    // 5090 ms, así que la suite fallaba en archivos distintos en cada pasada sin que nada hubiera
    // cambiado. Subirlo no tapa un problema de rendimiento: hace que el resultado sea fiable, que
    // es lo único que le pedimos a una puerta de calidad. El backend ya lo había subido por lo mismo.
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Gateway Socket.IO (tiempo real de la bandeja) — proxy WebSocket same-origin en dev.
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
