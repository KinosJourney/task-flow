import { CHANNELS } from '@shared/ipc';
import { idInput } from '@shared/schema/common';
import {
  createProjectInput,
  listProjectsInput,
  reorderProjectsInput,
  updateProjectInput,
} from '@shared/schema/projects';
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  reorderProjects,
  updateProject,
} from '../repo/projects';
import { registerHandler } from './handler';

export function registerProjectHandlers(): void {
  registerHandler(CHANNELS.projectsList, listProjectsInput, (input) =>
    listProjects(input?.status ?? 'active'),
  );
  registerHandler(CHANNELS.projectsGet, idInput, (input) => getProject(input.id));
  registerHandler(CHANNELS.projectsCreate, createProjectInput, (input) => createProject(input));
  registerHandler(CHANNELS.projectsUpdate, updateProjectInput, (input) => updateProject(input));
  registerHandler(CHANNELS.projectsArchive, idInput, (input) => archiveProject(input.id));
  registerHandler(CHANNELS.projectsReorder, reorderProjectsInput, (input) => {
    reorderProjects(input.orderedIds);
  });
}
