import { describe, expect, it } from 'vitest';
import { unwrap } from '@/lib/api';
import { dismissToast, reportIpcError, toastsSnapshot } from '@/lib/toast';

/**
 * toast 的文案是从 `unwrap` 抛出的 `[CODE] message` 里解回来的，两边的格式约定必须一致
 * （ui-spec 第 7 节：错误按 IpcResult.error.code 映射为提示，不打断当前操作）。
 */
function drain(): string[] {
  const messages = toastsSnapshot().map((t) => t.message);
  for (const toast of toastsSnapshot()) dismissToast(toast.id);
  return messages;
}

function reportFailure(code: string, message: string): string[] {
  try {
    unwrap({ ok: false, error: { code: code as never, message } });
  } catch (error) {
    reportIpcError(error);
  }
  return drain();
}

describe('IPC 失败提示', () => {
  it('三级上限给的是「写成描述」这句引导，而不是错误码', () => {
    expect(reportFailure('DEPTH_EXCEEDED', '最多三级')).toEqual([
      '最多三级，再往下的内容适合写成描述',
    ]);
  });

  it('每个错误码都有自己的说法', () => {
    expect(reportFailure('NOT_FOUND', '任务不存在')).toEqual(['要改的东西已经不在了，刷新一下看看']);
    expect(reportFailure('VALIDATION', '标题不能为空')).toEqual(['这个填法不行，检查一下再试']);
  });

  it('认不出来的错误按兜底文案提示，不静默', () => {
    expect(reportFailure('WAT', '天知道')).toEqual(['出了点意外，这一步没保存成功']);
    reportIpcError(new Error('没有方括号前缀的普通错误'));
    expect(drain()).toEqual(['出了点意外，这一步没保存成功']);
  });
});
