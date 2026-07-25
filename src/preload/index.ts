import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type PartialApi } from '@shared/ipc';

/**
 * 白名单桥：只暴露契约里定义的具名方法，不透传 ipcRenderer、
 * 也不暴露任何 Node 能力（architecture.md 2.2）。
 */
const api: PartialApi = {
  system: {
    ping: (p) => ipcRenderer.invoke(CHANNELS.systemPing, p),
    dbCheck: () => ipcRenderer.invoke(CHANNELS.systemDbCheck, undefined),
  },
};

contextBridge.exposeInMainWorld('api', api);
