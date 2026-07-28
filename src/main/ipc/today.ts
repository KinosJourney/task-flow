import { CHANNELS } from '@shared/ipc';
import {
  todayAbandonInput,
  todayBacklogInput,
  todayCarryOverInput,
  todayListInput,
  todayPostponeInput,
  todayReorderInput,
  todaySplitInput,
  todayTaskDateInput,
} from '@shared/schema/today';
import {
  abandonTask,
  addToToday,
  carryOver,
  getBacklog,
  listTodayQueue,
  postponeTask,
  removeFromToday,
  reorderToday,
  returnToPool,
  splitTask,
} from '../repo/todayEntries';
import { registerHandler } from './handler';

export function registerTodayHandlers(): void {
  registerHandler(CHANNELS.todayList, todayListInput, (input) => listTodayQueue(input.date));
  registerHandler(CHANNELS.todayAdd, todayTaskDateInput, (input) => {
    addToToday(input.taskId, input.date);
  });
  registerHandler(CHANNELS.todayRemove, todayTaskDateInput, (input) => {
    removeFromToday(input.taskId, input.date);
  });
  registerHandler(CHANNELS.todayBacklog, todayBacklogInput, (input) => getBacklog(input.before));
  registerHandler(CHANNELS.todayCarryOver, todayCarryOverInput, (input) => carryOver(input));
  registerHandler(CHANNELS.todayReorder, todayReorderInput, (input) => {
    reorderToday(input);
  });
  registerHandler(CHANNELS.todayPostpone, todayPostponeInput, (input) => {
    postponeTask(input);
  });
  registerHandler(CHANNELS.todayReturnToPool, todayTaskDateInput, (input) => {
    returnToPool(input);
  });
  registerHandler(CHANNELS.todayAbandon, todayAbandonInput, (input) => {
    abandonTask(input);
  });
  registerHandler(CHANNELS.todaySplit, todaySplitInput, (input) => splitTask(input));
}
