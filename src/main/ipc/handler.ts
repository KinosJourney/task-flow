import { ipcMain } from 'electron';
import type { z } from 'zod';
import type { Channel, ErrorCode, IpcResult } from '@shared/ipc';
import { AppError } from '../errors';

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

/**
 * 注册一个频道：zod 校验入参 -> 执行 -> 统一包装成 IpcResult。
 * handler 层不写业务逻辑（architecture.md 2.3）。
 */
export function registerHandler<Schema extends z.ZodTypeAny, Data>(
  channel: Channel,
  schema: Schema,
  run: (input: z.infer<Schema>) => Data | Promise<Data>,
): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<IpcResult<Data>> => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      return fail('VALIDATION', `${channel} 入参不合法: ${parsed.error.message}`);
    }
    try {
      return ok(await run(parsed.data));
    } catch (error) {
      if (error instanceof AppError) return fail(error.code, error.message);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[ipc] ${channel} 失败:`, error);
      return fail('INTERNAL', message);
    }
  });
}
