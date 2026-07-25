import { describe, expect, it } from 'vitest';
import { computeProgress, progressByProject, type ProgressTask } from '@main/domain/progress';

/** 一棵两级的树：父任务 a 下面挂 a1、a2，另有一个顶层叶子 b */
const tree: ProgressTask[] = [
  { id: 'a', projectId: 'p1', isDone: false },
  { id: 'a1', parentId: 'a', projectId: 'p1', isDone: true },
  { id: 'a2', parentId: 'a', projectId: 'p1', isDone: false },
  { id: 'b', projectId: 'p1', isDone: true },
];

describe('叶子进度（PRD 第 8 节 / 验收标准 6）', () => {
  it('只数叶子任务，父级不参与', () => {
    // 叶子是 a1、a2、b，其中 a1、b 已完成；父任务 a 不计入
    expect(computeProgress(tree)).toEqual({ doneLeaves: 2, totalLeaves: 3, ratio: 2 / 3 });
  });

  it('父任务标记完成也不会让它算进分母', () => {
    const withDoneParent = tree.map((t) => (t.id === 'a' ? { ...t, isDone: true } : t));
    expect(computeProgress(withDoneParent)).toEqual({
      doneLeaves: 2,
      totalLeaves: 3,
      ratio: 2 / 3,
    });
  });

  it('没有任务时是 0 而不是 100%', () => {
    expect(computeProgress([])).toEqual({ doneLeaves: 0, totalLeaves: 0, ratio: 0 });
  });

  it('全部叶子完成时是 1', () => {
    const allDone = tree.map((t) => ({ ...t, isDone: true }));
    expect(computeProgress(allDone).ratio).toBe(1);
  });

  it('三级结构里只有最底层算叶子', () => {
    const deep: ProgressTask[] = [
      { id: 'a', isDone: false },
      { id: 'a1', parentId: 'a', isDone: false },
      { id: 'a1x', parentId: 'a1', isDone: true },
      { id: 'a1y', parentId: 'a1', isDone: false },
    ];
    expect(computeProgress(deep)).toEqual({ doneLeaves: 1, totalLeaves: 2, ratio: 0.5 });
  });
});

describe('按项目分桶', () => {
  const multi: ProgressTask[] = [
    ...tree,
    { id: 'c', projectId: 'p2', isDone: true },
    { id: 'loose', isDone: false },
  ];

  it('各项目分别计算', () => {
    const byProject = progressByProject(multi);
    expect(byProject.get('p1')).toEqual({ doneLeaves: 2, totalLeaves: 3, ratio: 2 / 3 });
    expect(byProject.get('p2')).toEqual({ doneLeaves: 1, totalLeaves: 1, ratio: 1 });
  });

  it('不属于任何项目的散任务不进任何一桶', () => {
    const byProject = progressByProject(multi);
    expect([...byProject.keys()].sort()).toEqual(['p1', 'p2']);
  });

  it('一个任务都没有的项目查不到，由调用方回落到空进度', () => {
    expect(progressByProject(multi).get('p3')).toBeUndefined();
  });
});
