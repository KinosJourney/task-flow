import { CHANNELS } from '@shared/ipc';
import { idInput } from '@shared/schema/common';
import {
  createTaskInput,
  getNextInput,
  moveTaskInput,
  pinNextInput,
  taskTreeInput,
  updateTaskInput,
} from '@shared/schema/tasks';
import { getNextTask, pinNextTask } from '../repo/nextTask';
import {
  createTask,
  deleteTask,
  getTask,
  listTaskTree,
  moveTask,
  setTaskDone,
  updateTask,
} from '../repo/tasks';
import { registerHandler } from './handler';

export function registerTaskHandlers(): void {
  registerHandler(CHANNELS.tasksTree, taskTreeInput, (input) => listTaskTree(input.projectId));
  registerHandler(CHANNELS.tasksGet, idInput, (input) => getTask(input.id));
  registerHandler(CHANNELS.tasksCreate, createTaskInput, (input) => createTask(input));
  registerHandler(CHANNELS.tasksUpdate, updateTaskInput, (input) => updateTask(input));
  registerHandler(CHANNELS.tasksMove, moveTaskInput, (input) => moveTask(input));
  registerHandler(CHANNELS.tasksComplete, idInput, (input) => setTaskDone(input.id, true));
  registerHandler(CHANNELS.tasksReopen, idInput, (input) => setTaskDone(input.id, false));
  registerHandler(CHANNELS.tasksDelete, idInput, (input) => {
    deleteTask(input.id);
  });
  registerHandler(CHANNELS.tasksGetNext, getNextInput, (input) => getNextTask(input));
  registerHandler(CHANNELS.tasksPinNext, pinNextInput, (input) => {
    pinNextTask(input.id);
  });
}
