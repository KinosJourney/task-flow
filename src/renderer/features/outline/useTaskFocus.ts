import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Task } from '@shared/types';

const PARAM = 'focus';

/**
 * 「定位到某个任务」的唯一机制：把目标任务 id 放进 `?focus=<id>`，
 * 大纲列表读到它就滚动过去并把光标放进那一行的标题框。
 * 任务没有独立的详情页，所谓「上下文」就是它在项目大纲里的位置。
 */
export function useTaskFocus() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const reveal = useCallback(
    (task: Pick<Task, 'id' | 'projectId'>) => {
      if (task.projectId) {
        navigate(`/projects/${task.projectId}?${PARAM}=${task.id}`);
        return;
      }
      // 没有项目的散任务只存在于今日队列，就地聚焦
      const next = new URLSearchParams(params);
      next.set(PARAM, task.id);
      setParams(next, { replace: true });
    },
    [navigate, params, setParams],
  );

  /** 聚焦一次就够了，用完清掉，避免刷新或返回时又跳一次 */
  const consume = useCallback(() => {
    if (!params.has(PARAM)) return;
    const next = new URLSearchParams(params);
    next.delete(PARAM);
    setParams(next, { replace: true });
  }, [params, setParams]);

  return { focusTaskId: params.get(PARAM), reveal, consume };
}
