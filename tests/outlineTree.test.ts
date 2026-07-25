import { describe, expect, it } from 'vitest';
import {
  heightOf,
  planIndent,
  planOutdent,
  type OutlineRow,
} from '../src/renderer/features/outline/tree';

function row(
  id: string,
  depth: number,
  parentId?: string,
  extra: Partial<OutlineRow> = {},
): OutlineRow {
  return {
    id,
    parentId,
    depth,
    indent: depth - 1,
    title: id,
    isDone: false,
    moduleId: 'other',
    ...extra,
  };
}

/** a / b（b 有子 b1，b1 有子 b1a） */
const rows: OutlineRow[] = [
  row('a', 1),
  row('b', 1),
  row('b1', 2, 'b'),
  row('b1a', 3, 'b1'),
  row('c', 1),
];

describe('planIndent', () => {
  it('挂到上一个同级任务下，排在它现有子级之后', () => {
    const plan = planIndent(rows, row('c', 1));
    expect(plan).toEqual({ ok: true, parentId: 'b', position: 1 });
  });

  it('上面没有同级任务时不动', () => {
    expect(planIndent(rows, row('a', 1))).toEqual({ ok: false, reason: 'no_sibling' });
  });

  it('判定看的是「新层级 + 子树高度」，不是只看被移动那一行', () => {
    // b 自己在第一级，缩进后是第二级；但它带着 b1 / b1a，最深会到第四级
    expect(planIndent(rows, row('b', 1))).toEqual({ ok: false, reason: 'too_deep' });
  });

  it('第三级的行不能再缩进', () => {
    const flat = [row('x', 3, 'p'), row('y', 3, 'p')];
    expect(planIndent(flat, flat[1])).toEqual({ ok: false, reason: 'too_deep' });
  });

  it('跨块不能互相缩进：队列按项目分块，Tab 不该把任务挪进另一个项目', () => {
    const flat = [
      row('p1t1', 1, undefined, { groupKey: 'p1' }),
      row('p2t1', 1, undefined, { groupKey: 'p2' }),
    ];
    expect(planIndent(flat, flat[1])).toEqual({ ok: false, reason: 'no_sibling' });
  });
});

describe('planOutdent', () => {
  it('升到父级的同级，紧跟在原父级后面', () => {
    expect(planOutdent(rows, row('b1', 2, 'b'))).toEqual({
      ok: true,
      parentId: undefined,
      position: 2,
    });
  });

  it('已经在第一级就不动', () => {
    expect(planOutdent(rows, row('a', 1))).toEqual({ ok: false, reason: 'already_root' });
  });

  it('父任务不在这份列表里时算不出落点', () => {
    expect(planOutdent([row('lonely', 2, 'absent')], row('lonely', 2, 'absent'))).toEqual({
      ok: false,
      reason: 'parent_missing',
    });
  });
});

describe('heightOf', () => {
  it('叶子是 1，带两层后代是 3', () => {
    expect(heightOf(rows, 'a')).toBe(1);
    expect(heightOf(rows, 'b')).toBe(3);
  });
});
