import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type PartialApi } from '@shared/ipc';

/**
 * 白名单桥：只暴露契约里定义的具名方法，不透传 ipcRenderer、
 * 也不暴露任何 Node 能力（architecture.md 2.2）。
 *
 * 逐个方法按里程碑接入，这里没有的方法由渲染进程回落到 mock。
 * M0：system。M1：modules、projects、tasks CRUD、notes。
 * M2：today、focus、timer、tasks.getNext/pinNext、stats。
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
    getNext: (p) => ipcRenderer.invoke(CHANNELS.tasksGetNext, p),
    pinNext: (p) => ipcRenderer.invoke(CHANNELS.tasksPinNext, p),
  },
  today: {
    list: (p) => ipcRenderer.invoke(CHANNELS.todayList, p),
    add: (p) => ipcRenderer.invoke(CHANNELS.todayAdd, p),
    remove: (p) => ipcRenderer.invoke(CHANNELS.todayRemove, p),
    backlog: (p) => ipcRenderer.invoke(CHANNELS.todayBacklog, p),
    carryOver: (p) => ipcRenderer.invoke(CHANNELS.todayCarryOver, p),
    reorder: (p) => ipcRenderer.invoke(CHANNELS.todayReorder, p),
    postpone: (p) => ipcRenderer.invoke(CHANNELS.todayPostpone, p),
    returnToPool: (p) => ipcRenderer.invoke(CHANNELS.todayReturnToPool, p),
    abandon: (p) => ipcRenderer.invoke(CHANNELS.todayAbandon, p),
    split: (p) => ipcRenderer.invoke(CHANNELS.todaySplit, p),
  },
  focus: {
    getDay: (p) => ipcRenderer.invoke(CHANNELS.focusGetDay, p),
    set: (p) => ipcRenderer.invoke(CHANNELS.focusSet, p),
    linkTasks: (p) => ipcRenderer.invoke(CHANNELS.focusLinkTasks, p),
    toggleDone: (p) => ipcRenderer.invoke(CHANNELS.focusToggleDone, p),
  },
  timer: {
    active: () => ipcRenderer.invoke(CHANNELS.timerActive, undefined),
    start: (p) => ipcRenderer.invoke(CHANNELS.timerStart, p),
    stop: (p) => ipcRenderer.invoke(CHANNELS.timerStop, p),
    listByTask: (p) => ipcRenderer.invoke(CHANNELS.timerListByTask, p),
    addManual: (p) => ipcRenderer.invoke(CHANNELS.timerAddManual, p),
    update: (p) => ipcRenderer.invoke(CHANNELS.timerUpdate, p),
    delete: (p) => ipcRenderer.invoke(CHANNELS.timerDelete, p),
    classify: (p) => ipcRenderer.invoke(CHANNELS.timerClassify, p),
  },
  notes: {
    listByTask: (p) => ipcRenderer.invoke(CHANNELS.notesListByTask, p),
    create: (p) => ipcRenderer.invoke(CHANNELS.notesCreate, p),
    update: (p) => ipcRenderer.invoke(CHANNELS.notesUpdate, p),
    delete: (p) => ipcRenderer.invoke(CHANNELS.notesDelete, p),
    convertToTask: (p) => ipcRenderer.invoke(CHANNELS.notesConvertToTask, p),
    quickCapture: (p) => ipcRenderer.invoke(CHANNELS.notesQuickCapture, p),
  },
  stats: {
    homeSummary: () => ipcRenderer.invoke(CHANNELS.statsHomeSummary, undefined),
    timeline: (p) => ipcRenderer.invoke(CHANNELS.statsTimeline, p),
    moduleTime: (p) => ipcRenderer.invoke(CHANNELS.statsModuleTime, p),
  },
};

contextBridge.exposeInMainWorld('api', api);
