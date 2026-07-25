import { defineConfig } from 'drizzle-kit';

/**
 * 只用来生成迁移文件（drizzle-kit generate），不连真实数据库：
 * 运行期的数据库路径由 app.getPath('userData') 决定。
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
