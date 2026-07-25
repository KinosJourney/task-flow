import { registerSystemHandlers } from './system';

/** 主进程启动时一次性注册所有域的 handler，后续里程碑在此追加。 */
export function registerIpcHandlers(): void {
  registerSystemHandlers();
}
