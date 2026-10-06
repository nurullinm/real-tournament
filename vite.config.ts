import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const build = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(build) },
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), sounds: resolve(__dirname, 'sounds.html') } } },
  test: { include: ['tests/**/*.test.ts'] },
});
