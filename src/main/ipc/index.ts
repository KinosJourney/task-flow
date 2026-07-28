import { registerFocusHandlers } from './focus';
import { registerModuleHandlers } from './modules';
import { registerNoteHandlers } from './notes';
import { registerProjectHandlers } from './projects';
import { registerStatsHandlers } from './stats';
import { registerSystemHandlers } from './system';
import { registerTaskHandlers } from './tasks';
import { registerTimerHandlers } from './timer';
import { registerTodayHandlers } from './today';

/** 主进程启动时一次性注册所有域的 handler，后续里程碑在此追加。 */
export function registerIpcHandlers(): void {
  registerSystemHandlers();
  registerModuleHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerTodayHandlers();
  registerFocusHandlers();
  registerTimerHandlers();
  registerStatsHandlers();
  registerNoteHandlers();
}
