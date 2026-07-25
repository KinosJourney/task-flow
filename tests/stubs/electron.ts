/**
 * 测试里 `electron` 的替身。仓储层的模块图会经过 db/connection.ts，
 * 而它 import 了 electron；真正的 electron 包在纯 Node 下导出的是一个路径字符串，
 * 直接引用会炸。测试用的连接由 useSqlite() 注入，因此这里的方法一旦被调用就说明接错了线。
 */
type Handler = (event: unknown, payload: unknown) => Promise<unknown>;

const handlers = new Map<string, Handler>();

/**
 * `ipcMain` 的替身：把注册下来的 handler 记在表里，测试再按频道名调用它，
 * 于是 zod 校验与 IpcResult 包装这一层也能脱离 Electron 跑（见 tests/ipc.test.ts）。
 */
export const ipcMain = {
  handle(channel: string, handler: Handler): void {
    handlers.set(channel, handler);
  },
  removeHandler(channel: string): void {
    handlers.delete(channel);
  },
};

/** 测试里模拟渲染进程的一次 invoke */
export async function invokeChannel(channel: string, payload?: unknown): Promise<unknown> {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`没有注册过这个频道：${channel}`);
  return handler({}, payload);
}

export function resetHandlers(): void {
  handlers.clear();
}

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
