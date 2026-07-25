import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type PartialApi } from '@shared/ipc';

/**
 * 白名单桥：只暴露契约里定义的具名方法，不透传 ipcRenderer、
 * 也不暴露任何 Node 能力（architecture.md 2.2）。
 *
 * 逐个方法按里程碑接入，这里没有的方法由渲染进程回落到 mock。
 * M0：system。M1：modules、projects、tasks（不含 getNext/pinNext）、notes。
 */
const api: PartialApi = {
  system: {
    ping: (p) => ipcRenderer.invoke(CHANNELS.systemPing, p),
    dbCheck: () => ipcRenderer.invoke(CHANNELS.systemDbCheck, undefined),
  },
  modules: {
    list: () => ipcRenderer.invoke(CHANNELS.modulesList, undefined),
  },
  projects: {
    list: (p) => ipcRenderer.invoke(CHANNELS.projectsList, p),
    get: (p) => ipcRenderer.invoke(CHANNELS.projectsGet, p),
    create: (p) => ipcRenderer.invoke(CHANNELS.projectsCreate, p),
    update: (p) => ipcRenderer.invoke(CHANNELS.projectsUpdate, p),
    archive: (p) => ipcRenderer.invoke(CHANNELS.projectsArchive, p),
    reorder: (p) => ipcRenderer.invoke(CHANNELS.projectsReorder, p),
  },
  tasks: {
    tree: (p) => ipcRenderer.invoke(CHANNELS.tasksTree, p),
    get: (p) => ipcRenderer.invoke(CHANNELS.tasksGet, p),
    create: (p) => ipcRenderer.invoke(CHANNELS.tasksCreate, p),
    update: (p) => ipcRenderer.invoke(CHANNELS.tasksUpdate, p),
    move: (p) => ipcRenderer.invoke(CHANNELS.tasksMove, p),
    complete: (p) => ipcRenderer.invoke(CHANNELS.tasksComplete, p),
    reopen: (p) => ipcRenderer.invoke(CHANNELS.tasksReopen, p),
    delete: (p) => ipcRenderer.invoke(CHANNELS.tasksDelete, p),
  },
  notes: {
    listByTask: (p) => ipcRenderer.invoke(CHANNELS.notesListByTask, p),
    create: (p) => ipcRenderer.invoke(CHANNELS.notesCreate, p),
    update: (p) => ipcRenderer.invoke(CHANNELS.notesUpdate, p),
    delete: (p) => ipcRenderer.invoke(CHANNELS.notesDelete, p),
    convertToTask: (p) => ipcRenderer.invoke(CHANNELS.notesConvertToTask, p),
    quickCapture: (p) => ipcRenderer.invoke(CHANNELS.notesQuickCapture, p),
  },
};

contextBridge.exposeInMainWorld('api', api);
