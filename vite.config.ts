import { execSync } from 'node:child_process';
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
  test: { include: ['tests/**/*.test.ts'] },
});
