import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  buildTree,
  depthForNewChild,
  planReparent,
  subtreeHeight,
  subtreeIds,
  type TaskLike,
} from '@main/domain/taskTree';

function task(id: string, depth: number, parentId?: string, sortOrder = 1): TaskLike {
  return { id, parentId, projectId: 'p1', depth, sortOrder, createdAt: 0 };
}

/**
 * p1 项目：
 *   a (1)         b (1)
 *   ├ a1 (2)
 *   │ └ a1x (3)
 *   └ a2 (2)
 */
const tasks: TaskLike[] = [
  task('a', 1, undefined, 1),
  task('a1', 2, 'a', 1),
  task('a1x', 3, 'a1', 1),
  task('a2', 2, 'a', 2),
  task('b', 1, undefined, 2),
];

describe('组装任务树', () => {
  it('按 sortOrder 排同级，并递归挂上子级', () => {
    const tree = buildTree(tasks);
    expect(tree.map((t) => t.id)).toEqual(['a', 'b']);
    expect(tree[0].children.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(tree[0].children[0].children.map((t) => t.id)).toEqual(['a1x']);
  });

  it('父级不在集合里的行按根处理，不会凭空消失', () => {
    const orphan = [task('x', 2, 'missing')];
    expect(buildTree(orphan).map((t) => t.id)).toEqual(['x']);
  });
});

describe('祖先与子树', () => {
  it('面包屑是根到父的顺序', () => {
    expect(ancestorsOf(tasks, 'a1x').map((t) => t.id)).toEqual(['a', 'a1']);
  });

  it('顶层任务没有祖先', () => {
    expect(ancestorsOf(tasks, 'a')).toEqual([]);
  });

  it('子树包含自身与全部后代', () => {
    expect(subtreeIds(tasks, 'a').sort()).toEqual(['a', 'a1', 'a1x', 'a2']);
  });

  it('子树高度：叶子为 0', () => {
    expect(subtreeHeight(tasks, 'a')).toBe(2);
    expect(subtreeHeight(tasks, 'a1')).toBe(1);
    expect(subtreeHeight(tasks, 'a2')).toBe(0);
  });
});

describe('新建时的层级上限（PRD 4.3）', () => {
  it('跟在父级下一层', () => {
    expect(depthForNewChild(undefined)).toBe(1);
    expect(depthForNewChild(task('a', 1))).toBe(2);
    expect(depthForNewChild(task('a1', 2))).toBe(3);
  });

  it('第三级下面不能再加，报 DEPTH_EXCEEDED', () => {
    expect(() => depthForNewChild(task('a1x', 3))).toThrowError(/三级/);
  });
});

describe('移动任务时的层级校验', () => {
  it('缩进一级：整棵子树的层级一起加一', () => {
    const plan = planReparent(tasks, 'a2', 'a1');
    expect(plan).toEqual([{ id: 'a2', depth: 3, projectId: 'p1' }]);
  });

  it('提到顶层：层级回到 1，后代跟着上移', () => {
    const plan = planReparent(tasks, 'a1', undefined, 'p1');
    expect(plan).toEqual([
      { id: 'a1', depth: 1, projectId: 'p1' },
      { id: 'a1x', depth: 2, projectId: 'p1' },
    ]);
  });

  it('整棵子树越界时拒绝，而不是只看被移动的那一行', () => {
    // a1 自己挂到第二级只是第三级，但它带着 a1x 就会出现第四级
    expect(() => planReparent(tasks, 'a1', 'a2')).toThrowError(/三级/);
  });

  it('不能把任务移到自己的子任务下面', () => {
    expect(() => planReparent(tasks, 'a', 'a1x')).toThrowError(/子任务/);
  });

  it('换项目时整棵子树跟着走', () => {
    const plan = planReparent(tasks, 'a', undefined, 'p2');
    expect(plan.every((u) => u.projectId === 'p2')).toBe(true);
    expect(plan.map((u) => u.id).sort()).toEqual(['a', 'a1', 'a1x', 'a2']);
  });

  it('移动到父级下时项目跟随父级，不看传入的项目', () => {
    const crossProject = [...tasks, { ...task('c', 1), projectId: 'p2', id: 'c' }];
    expect(planReparent(crossProject, 'c', 'a2')).toEqual([
      { id: 'c', depth: 3, projectId: 'p1' },
    ]);
  });
});
