import { useSyncExternalStore } from 'react';
import type { ErrorCode } from '@shared/ipc';

export interface Toast {
  id: number;
  message: string;
  /** 出错的 toast 用警示语气，成功/提示用中性语气 */
  tone: 'error' | 'info';
}

/**
 * 错误码到人话的映射（ui-spec 第 7 节）。写操作失败不该只在控制台留一行 `[DEPTH_EXCEEDED]`，
 * 也不该弹一个要点确定的对话框打断手里的事——所以是一条几秒后自己走的漫画风提示条。
 */
const MESSAGES: Record<ErrorCode, string> = {
  VALIDATION: '这个填法不行，检查一下再试',
  NOT_FOUND: '要改的东西已经不在了，刷新一下看看',
  CONFLICT: '这一步和现在的状态冲突了',
  DEPTH_EXCEEDED: '最多三级，再往下的内容适合写成描述',
  IMPORT_PARSE: '这段文本没能解析出结构，改改格式再导入',
  BACKUP_IO: '文件读写失败，换个位置再试',
  INTERNAL: '出了点意外，这一步没保存成功',
};

const DISMISS_AFTER_MS = 4000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function pushToast(message: string, tone: Toast['tone'] = 'info'): void {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  emit();
  setTimeout(() => dismissToast(id), DISMISS_AFTER_MS);
}

/**
 * `unwrap` 把 `IpcResult` 的失败抛成 `[CODE] message` 形式的 Error，这里再解回错误码，
 * 好过让每个 mutation 自己 try/catch 一遍。认不出来的错误按 INTERNAL 兜底。
 */
export function reportIpcError(error: unknown): void {
  const raw = error instanceof Error ? error.message : String(error);
  const code = /^\[(\w+)]/.exec(raw)?.[1] as ErrorCode | undefined;
  pushToast(code && code in MESSAGES ? MESSAGES[code] : MESSAGES.INTERNAL, 'error');
}

/** 当前这批提示。UI 走 useToasts，这个导出是给测试读的 */
export function toastsSnapshot(): Toast[] {
  return toasts;
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toastsSnapshot,
  );
}
