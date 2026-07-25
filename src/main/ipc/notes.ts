import { CHANNELS } from '@shared/ipc';
import { idInput } from '@shared/schema/common';
import {
  convertNoteInput,
  createNoteInput,
  listNotesInput,
  quickCaptureInput,
  updateNoteInput,
} from '@shared/schema/notes';
import { createNote, deleteNote, listNotesByTask, updateNote } from '../repo/notes';
import { convertNoteToTask } from '../repo/tasks';
import { registerHandler } from './handler';

export function registerNoteHandlers(): void {
  registerHandler(CHANNELS.notesListByTask, listNotesInput, (input) =>
    listNotesByTask(input.taskId),
  );
  registerHandler(CHANNELS.notesCreate, createNoteInput, (input) => createNote(input));
  registerHandler(CHANNELS.notesUpdate, updateNoteInput, (input) => updateNote(input));
  registerHandler(CHANNELS.notesDelete, idInput, (input) => {
    deleteNote(input.id);
  });
  registerHandler(CHANNELS.notesConvertToTask, convertNoteInput, (input) =>
    convertNoteToTask(input),
  );
  // 快速记录是游离的：先记下来，之后再决定归到哪个任务（PRD 第 10 节）
  registerHandler(CHANNELS.notesQuickCapture, quickCaptureInput, (input) =>
    createNote({ kind: input.kind ?? 'note', content: input.content }),
  );
}
