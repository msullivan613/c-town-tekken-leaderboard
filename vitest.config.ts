import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';

const SITE = process.env.SITE ?? 'c-town';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@site-config': resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'sites',
        SITE,
        'config.json',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
