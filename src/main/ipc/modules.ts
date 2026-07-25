import { CHANNELS } from '@shared/ipc';
import { emptyInput } from '@shared/schema/system';
import { listModules } from '../repo/modules';
import { registerHandler } from './handler';

export function registerModuleHandlers(): void {
  registerHandler(CHANNELS.modulesList, emptyInput, () => listModules());
}
