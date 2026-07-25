import { useMemo } from 'react';
import { useCreateTask, useDeleteTask, useMoveTask, useUpdateTask } from '@/features/queries';
import { useCompleteTask, useReopenTask } from '@/features/queries';
import { NEW_ROW_TITLE, type OutlineActions, type OutlineRow } from './useOutlineKeys';

interface Options {
  /** 新行落在哪个项目下；散任务传 undefined */
  projectId?: string;
  /** 新行是否直接进今日队列（首页队列里加的行显然要进） */
  inToday?: boolean;
}

/**
 * 把大纲的键盘动作接到 IPC 上。两个页面共用，保证「Enter 出来的那一行」
 * 在项目页和首页队列里落库方式一致。
 */
export function useOutlineActions({ projectId, inToday }: Options): OutlineActions {
  const create = useCreateTask();
  const update = useUpdateTask();
  const move = useMoveTask();
  const remove = useDeleteTask();
  const complete = useCompleteTask();
  const reopen = useReopenTask();

  return useMemo<OutlineActions>(
    () => ({
      rename(id, title) {
        update.mutate({ id, title });
      },
      setDescription(id, value) {
        // 空串表示清掉描述，契约里用 null 表达
        update.mutate({ id, description: value || null });
      },
      toggleDone(id, isDone) {
        if (isDone) complete.mutate(id);
        else reopen.mutate(id);
      },
      async createSibling(row, position) {
        const created = await create.mutateAsync({
          title: NEW_ROW_TITLE,
          parentId: row.parentId,
          // 有父级时项目跟父级走；否则跟着同一块的项目，最后才回落到页面级的项目
          projectId: row.parentId ? undefined : (row.projectId ?? projectId),
          inToday,
        });
        // create 只会把新行放到同级末尾，位置得再摆一次
        if (position >= 0) await move.mutateAsync({ id: created.id, position });
        return created.id;
      },
      indent(id, newParentId, position) {
        move.mutate({ id, parentId: newParentId, position });
      },
      outdent(id, newParentId, position) {
        move.mutate({ id, parentId: newParentId ?? null, position });
      },
      remove(id) {
        remove.mutate(id);
      },
    }),
    [create, update, move, remove, complete, reopen, projectId, inToday],
  );
}

/** 项目任务树（`TaskNode[]`）拍平成大纲行，深度优先保持显示顺序 */
export function flattenTaskTree<
  T extends {
    id: string;
    parentId?: string;
    projectId?: string;
    depth: number;
    title: string;
    description?: string;
    isDone: boolean;
    moduleId: OutlineRow['moduleId'];
    inToday: boolean;
    children: T[];
  },
>(nodes: T[], indent = 0, out: OutlineRow[] = []): OutlineRow[] {
  for (const node of nodes) {
    out.push({
      id: node.id,
      parentId: node.parentId,
      projectId: node.projectId,
      depth: node.depth,
      indent,
      title: node.title,
      description: node.description,
      isDone: node.isDone,
      moduleId: node.moduleId,
      inToday: node.inToday,
    });
    flattenTaskTree(node.children, indent + 1, out);
  }
  return out;
}
