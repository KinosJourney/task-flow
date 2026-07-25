/**
 * 测试里 `electron` 的替身。仓储层的模块图会经过 db/connection.ts，
 * 而它 import 了 electron；真正的 electron 包在纯 Node 下导出的是一个路径字符串，
 * 直接引用会炸。测试用的连接由 useSqlite() 注入，因此这里的方法一旦被调用就说明接错了线。
 */
export const app = {
  getPath(name: string): string {
    throw new Error(`测试不应访问 Electron 的目录：${name}`);
  },
  get isPackaged(): boolean {
    return false;
  },
  getAppPath(): string {
    throw new Error('测试不应访问 Electron 的 appPath');
  },
};
