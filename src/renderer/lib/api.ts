import type { Api, IpcResult, PartialApi } from '@shared/ipc';
import { mockApi } from '@/mock/api';

/**
 * 已由 preload 实现的方法走真实 IPC，其余回落到 mock。
 * 合并到方法一级而不是域一级：`tasks` 的 CRUD 在 M1 就是真的，
 * 而 `getNext` 要等 M2，域级合并会让这两者只能同进同退。
 */
/** 合并时把每个域当成一袋方法，不必知道具体签名——签名一致性由 Api 与 PartialApi 保证 */
type Methods = Record<string, unknown>;

function mergeApi(base: Api, real: PartialApi): Api {
  const merged: Record<string, Methods> = {};
  for (const domain of Object.keys(base)) {
    merged[domain] = {
      ...(base as unknown as Record<string, Methods>)[domain],
      ...(real as unknown as Record<string, Methods | undefined>)[domain],
    };
  }
  return merged as unknown as Api;
}

export const api: Api = mergeApi(mockApi, window.api ?? {});

export const isElectron = Boolean(window.api);

export function unwrap<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;
  throw new Error(`[${result.error.code}] ${result.error.message}`);
}
