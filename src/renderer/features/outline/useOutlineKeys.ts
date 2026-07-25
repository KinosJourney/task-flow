import { useCallback, useEffect, useRef, useState } from 'react';
import {
  childrenOf,
  indexAmongSiblings,
  planIndent,
  planOutdent,
  type OutlineRow,
} from './tree';

export type { OutlineRow } from './tree';

/**
 * 新行的占位标题。后端 `createTaskInput` 要求 `title` 至少一个字符，
 * 所以新行不能是空串；它会以全选状态出现，第一个按键就把它替换掉。
 */
export const NEW_ROW_TITLE = '新任务';

export const KEY_HINT = 'Enter 新增一行 · Tab 缩进 · ⌫ 退一级 · Shift+Enter 写描述';

/** 大纲只管键盘与结构，落库由调用方注入 */
export interface OutlineActions {
  rename(id: string, title: string): void;
  setDescription(id: string, value: string): void;
  toggleDone(id: string, isDone: boolean): void;
  /** 在同级的 position 处插入新行，返回新任务 id 以便光标跟过去 */
  createSibling(row: OutlineRow, position: number): Promise<string>;
  indent(id: string, newParentId: string, position: number): void;
  outdent(id: string, newParentId: string | undefined, position: number): void;
  remove(id: string): void;
}

function atLineStart(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  return el.selectionStart === 0 && el.selectionEnd === 0;
}

/** 只是占位、用户一个字都没敲的行，行首退格可以直接删掉 */
function isBlank(title: string): boolean {
  const t = title.trim();
  return !t || t === NEW_ROW_TITLE;
}

interface PendingFocus {
  key: string;
  selectAll?: boolean;
}

/**
 * 大纲式行内编辑的键盘行为（`ui-spec.md` 第 3 节）。
 * 项目页与首页队列的视觉不同，但键位、层级规则、保存时机都来自这里。
 *
 * 输入框一律非受控、提交时直接读 DOM 值：大纲可能几十行，
 * 每敲一个字都重渲染整棵树会卡。
 */
export function useOutlineKeys({
  rows,
  actions,
}: {
  rows: OutlineRow[];
  actions: OutlineActions;
}) {
  const fields = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
  const [openDescriptions, setOpenDescriptions] = useState<ReadonlySet<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);

  const register = useCallback(
    (key: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (el) fields.current.set(key, el);
      else fields.current.delete(key);
    },
    [],
  );

  const focusField = useCallback((target: PendingFocus) => {
    const el = fields.current.get(target.key);
    if (!el) return false;
    el.focus();
    if (target.selectAll) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
    return true;
  }, []);

  // 新行要先渲染出来才能聚焦，所以等 rows 更新后再试一次
  useEffect(() => {
    if (!pendingFocus) return;
    if (focusField(pendingFocus)) setPendingFocus(null);
  }, [pendingFocus, rows, focusField]);

  const hintFor = useCallback((message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 2000);
  }, []);

  const closeDescription = useCallback((id: string) => {
    setOpenDescriptions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const commitTitle = useCallback(
    (row: OutlineRow) => {
      const el = fields.current.get(`t:${row.id}`);
      if (!el) return;
      const next = el.value.trim();
      // 清空标题不算重命名：宁可留着原文，也不要一个手滑把行变成空白
      if (!next || next === row.title) {
        el.value = row.title;
        return;
      }
      actions.rename(row.id, next);
    },
    [actions],
  );

  const commitDescription = useCallback(
    (row: OutlineRow) => {
      const el = fields.current.get(`d:${row.id}`);
      if (!el) return;
      const next = el.value.trim();
      if (!next) closeDescription(row.id);
      if (next !== (row.description ?? '')) actions.setDescription(row.id, next);
    },
    [actions, closeDescription],
  );

  const addSibling = useCallback(
    async (row: OutlineRow) => {
      const newId = await actions.createSibling(row, indexAmongSiblings(rows, row) + 1);
      setPendingFocus({ key: `t:${newId}`, selectAll: true });
    },
    [actions, rows],
  );

  const startFirstRow = useCallback(async () => {
    const seed: OutlineRow = {
      id: '',
      depth: 0,
      indent: 0,
      title: '',
      isDone: false,
      moduleId: 'other',
    };
    const newId = await actions.createSibling(seed, 0);
    setPendingFocus({ key: `t:${newId}`, selectAll: true });
  }, [actions]);

  function tryIndent(row: OutlineRow) {
    const plan = planIndent(rows, row);
    if (!plan.ok) {
      hintFor(
        plan.reason === 'no_sibling'
          ? '上面没有同级的任务可以挂进去。'
          : '最多三级，再往下的内容适合写成描述。',
      );
      return;
    }
    actions.indent(row.id, plan.parentId, plan.position);
  }

  function tryOutdent(row: OutlineRow) {
    const plan = planOutdent(rows, row);
    if (!plan.ok) {
      if (plan.reason === 'parent_missing') hintFor('这行的父任务不在当前列表里，去项目里调层级。');
      return false;
    }
    actions.outdent(row.id, plan.parentId, plan.position);
    return true;
  }

  function titleProps(row: OutlineRow) {
    return {
      ref: register(`t:${row.id}`),
      defaultValue: row.title,
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitTitle(row);
          if (e.shiftKey) {
            setOpenDescriptions((prev) => new Set(prev).add(row.id));
            setPendingFocus({ key: `d:${row.id}` });
          } else {
            void addSibling(row);
          }
          return;
        }

        if (e.key === 'Tab') {
          e.preventDefault();
          commitTitle(row);
          if (e.shiftKey) tryOutdent(row);
          else tryIndent(row);
          return;
        }

        if (e.key === 'Backspace' && atLineStart(e.currentTarget)) {
          if (row.parentId) {
            e.preventDefault();
            commitTitle(row);
            tryOutdent(row);
            return;
          }
          // 第一级：只删还没写东西、也没有子任务的空行，免得误删
          if (isBlank(e.currentTarget.value) && childrenOf(rows, row.id).length === 0) {
            e.preventDefault();
            const prev = rows[rows.findIndex((r) => r.id === row.id) - 1];
            actions.remove(row.id);
            if (prev) setPendingFocus({ key: `t:${prev.id}` });
          }
          return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const index = rows.findIndex((r) => r.id === row.id);
          const target = rows[index + (e.key === 'ArrowUp' ? -1 : 1)];
          if (!target) return;
          e.preventDefault();
          commitTitle(row);
          setPendingFocus({ key: `t:${target.id}` });
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.value = row.title;
          e.currentTarget.blur();
        }
      },
      onBlur: () => commitTitle(row),
    };
  }

  function descriptionProps(row: OutlineRow) {
    return {
      ref: register(`d:${row.id}`),
      defaultValue: row.description ?? '',
      onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // 描述里 Shift+Enter 才是换行，单独 Enter 表示写完、光标回到任务行
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commitDescription(row);
          setPendingFocus({ key: `t:${row.id}` });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.value = row.description ?? '';
          e.currentTarget.blur();
        }
      },
      onBlur: () => commitDescription(row),
    };
  }

  function hasDescription(row: OutlineRow) {
    return Boolean(row.description) || openDescriptions.has(row.id);
  }

  return { flash, titleProps, descriptionProps, hasDescription, startFirstRow };
}
