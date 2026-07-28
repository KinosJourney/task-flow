import { CHANNELS } from '@shared/ipc';
import {
  focusGetDayInput,
  focusLinkTasksInput,
  focusSetInput,
  focusToggleDoneInput,
} from '@shared/schema/focus';
import { linkFocusTasks, listFocusByDate, setFocus, toggleFocusDone } from '../repo/dailyFocus';
import { registerHandler } from './handler';

export function registerFocusHandlers(): void {
  registerHandler(CHANNELS.focusGetDay, focusGetDayInput, (input) => listFocusByDate(input.date));
  registerHandler(CHANNELS.focusSet, focusSetInput, (input) => setFocus(input));
  registerHandler(CHANNELS.focusLinkTasks, focusLinkTasksInput, (input) => {
    linkFocusTasks(input);
  });
  registerHandler(CHANNELS.focusToggleDone, focusToggleDoneInput, (input) => toggleFocusDone(input));
}
