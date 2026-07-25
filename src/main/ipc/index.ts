import { registerModuleHandlers } from './modules';
import { registerNoteHandlers } from './notes';
import { registerProjectHandlers } from './projects';
import { registerSystemHandlers } from './system';
import { registerTaskHandlers } from './tasks';

/** 主进程启动时一次性注册所有域的 handler，后续里程碑在此追加。 */
export function registerIpcHandlers(): void {
  registerSystemHandlers();
  registerModuleHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerNoteHandlers();
}
