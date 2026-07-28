import { CHANNELS } from '@shared/ipc';
import { emptyInput } from '@shared/schema/system';
import { statsModuleTimeInput, statsTimelineInput } from '@shared/schema/stats';
import { getHomeSummary, getModuleTime, getTimeline } from '../repo/stats';
import { registerHandler } from './handler';

export function registerStatsHandlers(): void {
  registerHandler(CHANNELS.statsHomeSummary, emptyInput, () => getHomeSummary());
  registerHandler(CHANNELS.statsTimeline, statsTimelineInput, (input) => getTimeline(input.date));
  registerHandler(CHANNELS.statsModuleTime, statsModuleTimeInput, (input) =>
    getModuleTime(input.from, input.to),
  );
}
