import type { Api, IpcResult } from '@shared/ipc';
import { mockApi } from '@/mock/api';

/**
 * 已由 preload 实现的域走真实 IPC，其余域暂时回落到 mock。
 * 每个里程碑把对应域接进 preload 后，这里自动切换到真实实现。
 */
export const api: Api = { ...mockApi, ...(window.api ?? {}) };

export const isElectron = Boolean(window.api);

export function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`[${result.error.code}] ${result.error.message}`);
}
