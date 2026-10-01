import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Garante que version.json está atualizado a cada execução do Vite
try {
  execSync('node ../../scripts/generate-version.mjs', { cwd: __dirname, stdio: 'ignore' });
} catch {
  // fallback silencioso
}

let versionData = {};
try {
  versionData = JSON.parse(fs.readFileSync(resolve(__dirname, 'src/version.json'), 'utf-8'));
} catch {
  versionData = { version: '0.2.0', displayVersion: 'v0.2.0' };
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION_INFO__: JSON.stringify(versionData),
  },
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@themisflow/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  optimizeDeps: {
    include: ['xlsx'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
