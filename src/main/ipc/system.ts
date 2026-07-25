import type { DbCheckResult, PingResult } from '@shared/types';
import { CHANNELS } from '@shared/ipc';
import { emptyInput, pingInput } from '@shared/schema/system';
import { runDbSelfCheck } from '../db/selfCheck';
import { registerHandler } from './handler';

export function registerSystemHandlers(): void {
  registerHandler(CHANNELS.systemPing, pingInput, (input): PingResult => {
    return {
      pong: true,
      echo: input?.message ?? 'ping',
      at: Date.now(),
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
      },
    };
  });

  registerHandler(CHANNELS.systemDbCheck, emptyInput, (): DbCheckResult => runDbSelfCheck());
}
