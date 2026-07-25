import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * 主要覆盖 src/main/domain/ 的纯函数领域逻辑（architecture.md 第 1 节）。
 * `@` 指向渲染进程：第一版的队列规则还住在 mock 里，这些规则将来要原样搬进领域层，
 * 所以先在这里锁住行为。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@': resolve(__dirname, 'src/renderer'),
      // 仓储层的测试要加载 db/connection.ts，它 import 了 electron；换成替身，
      // 数据库连接由 useSqlite() 注入（见 tests/stubs/electron.ts）
      electron: resolve(__dirname, 'tests/stubs/electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
