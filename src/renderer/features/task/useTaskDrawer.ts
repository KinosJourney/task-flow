import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const PARAM = 'task';

/**
 * 任务详情抽屉的开合状态放在查询参数里（`?task=<id>`），而不是组件 state。
 * 这样抽屉不占独立路由却仍能前进/后退、刷新恢复、复制链接（ui-spec 第 3 节）。
 */
export function useTaskDrawer() {
  const [params, setParams] = useSearchParams();

  const open = useCallback(
    (taskId: string) => {
      const next = new URLSearchParams(params);
      next.set(PARAM, taskId);
      setParams(next);
    },
    [params, setParams],
  );

  const close = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete(PARAM);
    setParams(next);
  }, [params, setParams]);

  return { taskId: params.get(PARAM), open, close };
}
