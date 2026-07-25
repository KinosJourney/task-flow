import type { ErrorCode } from '@shared/ipc';

/** 领域/仓储层抛出它来指定错误码，handler 统一翻译成 IpcResult。 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
