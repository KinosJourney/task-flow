import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** 主要覆盖 src/main/domain/ 的纯函数领域逻辑（architecture.md 第 1 节）。 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
