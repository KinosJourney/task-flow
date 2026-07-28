import { CHANNELS } from '@shared/ipc';
import { emptyInput } from '@shared/schema/system';
import { idInput } from '@shared/schema/common';
import {
  timerAddManualInput,
  timerClassifyInput,
  timerListByTaskInput,
  timerStartInput,
  timerStopInput,
  timerUpdateInput,
} from '@shared/schema/timer';
import {
  addManualEntry,
  classifyEntry,
  deleteEntry,
  findActiveEntry,
  listEntriesByTask,
  startTimer,
  stopTimer,
  updateEntry,
} from '../repo/timeEntries';
import { registerHandler } from './handler';

export function registerTimerHandlers(): void {
  registerHandler(CHANNELS.timerActive, emptyInput, () => findActiveEntry());
  registerHandler(CHANNELS.timerStart, timerStartInput, (input) => startTimer(input));
  registerHandler(CHANNELS.timerStop, timerStopInput, (input) => stopTimer(input.now));
  registerHandler(CHANNELS.timerListByTask, timerListByTaskInput, (input) =>
    listEntriesByTask(input.taskId),
  );
  registerHandler(CHANNELS.timerAddManual, timerAddManualInput, (input) => addManualEntry(input));
  registerHandler(CHANNELS.timerUpdate, timerUpdateInput, (input) => updateEntry(input));
  registerHandler(CHANNELS.timerDelete, idInput, (input) => {
    deleteEntry(input.id);
  });
  registerHandler(CHANNELS.timerClassify, timerClassifyInput, (input) => classifyEntry(input));
}
