import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, useSqlite } from '@main/db/connection';
import { seedModules } from '@main/db/seedModules';
import { listModules } from '@main/repo/modules';
import { createProject, listProjects, updateProject } from '@main/repo/projects';
import { createNote, listNotesByTask } from '@main/repo/notes';
import {
  convertNoteToTask,
  createTask,
  deleteTask,
  getTask,
  listTaskTree,
  moveTask,
  setTaskDone,
  updateTask,
} from '@main/repo/tasks';

/**
 * 仓储层跑在真实的 SQLite 上：迁移、外键、CHECK 约束与事务都是真的，
 * 只是数据库在内存里。纯函数的部分另见 progress/taskTree 两组测试。
 */
beforeEach(() => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  useSqlite(sqlite);
  migrate(getDb(), { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  seedModules();
});

function project(name = 'ToGoal') {
  return createProject({ name, defaultModuleId: 'work' });
}

describe('模块', () => {
  it('八个模块按顺序预置好', () => {
    const modules = listModules();
    expect(modules).toHaveLength(8);
    expect(modules.map((m) => m.id)).toEqual([
      'work',
      'hobby',
      'growth',
      'sport',
      'diet',
      'expense',
      'social',
      'other',
    ]);
  });

  it('重复启动不会写重，只把显示属性对齐', () => {
    seedModules();
    seedModules();
    expect(listModules()).toHaveLength(8);
  });
});

describe('项目', () => {
  it('新建后出现在活跃列表里，进度是 0', () => {
    const created = project();
    const [listed] = listProjects();
    expect(listed.id).toBe(created.id);
    expect(listed.progress).toEqual({ doneLeaves: 0, totalLeaves: 0, ratio: 0 });
  });

  it('归档后不再出现在活跃列表', () => {
    const created = project();
    updateProject({ id: created.id, status: 'archived' });
    expect(listProjects()).toHaveLength(0);
    expect(listProjects('archived').map((p) => p.id)).toEqual([created.id]);
  });

  it('空名字被拒绝', () => {
    expect(() => createProject({ name: '   ', defaultModuleId: 'work' })).toThrowError(/不能为空/);
  });
});

describe('任务的三级结构', () => {
  it('模块默认继承项目，未指定时不用自己填', () => {
    const p = createProject({ name: 'FurDiary', defaultModuleId: 'hobby' });
    expect(createTask({ title: '设计封面', projectId: p.id }).moduleId).toBe('hobby');
  });

  it('子任务继承父任务的模块与项目', () => {
    const p = project();
    const parent = createTask({ title: '父', projectId: p.id, moduleId: 'growth' });
    const child = createTask({ title: '子', parentId: parent.id });
    expect(child.moduleId).toBe('growth');
    expect(child.projectId).toBe(p.id);
    expect(child.depth).toBe(2);
  });

  it('第四级被拒绝，报 DEPTH_EXCEEDED', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', parentId: a.id });
    const c = createTask({ title: 'c', parentId: b.id });
    expect(c.depth).toBe(3);
    expect(() => createTask({ title: 'd', parentId: c.id })).toThrowError(/三级/);
  });

  it('任务树按同级顺序返回，新建的排在后面', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    createTask({ title: 'b', projectId: p.id });
    createTask({ title: 'a1', parentId: a.id });

    const tree = listTaskTree(p.id);
    expect(tree.map((t) => t.title)).toEqual(['a', 'b']);
    expect(tree[0].children.map((t) => t.title)).toEqual(['a1']);
  });

  it('详情带上批注、直接子级与面包屑', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', parentId: a.id });
    const c = createTask({ title: 'c', parentId: b.id });
    createNote({ taskId: c.id, kind: 'idea', content: '想到一个点子' });

    const detail = getTask(c.id);
    expect(detail.projectName).toBe('ToGoal');
    expect(detail.ancestors.map((x) => x.title)).toEqual(['a', 'b']);
    expect(detail.notes.map((n) => n.content)).toEqual(['想到一个点子']);
    expect(detail.children).toEqual([]);
  });
});

describe('项目进度按叶子任务算（验收标准 6）', () => {
  it('父任务不计入，完成叶子后进度上升', () => {
    const p = project();
    const parent = createTask({ title: '父', projectId: p.id });
    const child1 = createTask({ title: '子1', parentId: parent.id });
    createTask({ title: '子2', parentId: parent.id });

    expect(listProjects()[0].progress).toEqual({ doneLeaves: 0, totalLeaves: 2, ratio: 0 });
    setTaskDone(child1.id, true);
    expect(listProjects()[0].progress).toEqual({ doneLeaves: 1, totalLeaves: 2, ratio: 0.5 });
  });

  it('取消完成会把进度退回去', () => {
    const p = project();
    const t = createTask({ title: '一件事', projectId: p.id });
    setTaskDone(t.id, true);
    expect(listProjects()[0].progress.ratio).toBe(1);
    setTaskDone(t.id, false);
    expect(listProjects()[0].progress.ratio).toBe(0);
  });

  it('给叶子加子任务后，它自己不再算叶子', () => {
    const p = project();
    const t = createTask({ title: '一件事', projectId: p.id });
    setTaskDone(t.id, true);
    expect(listProjects()[0].progress).toEqual({ doneLeaves: 1, totalLeaves: 1, ratio: 1 });

    createTask({ title: '拆出来的一步', parentId: t.id });
    expect(listProjects()[0].progress).toEqual({ doneLeaves: 0, totalLeaves: 1, ratio: 0 });
  });
});

describe('移动任务', () => {
  it('缩进到前一个同级下面，层级加一', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', projectId: p.id });

    const moved = moveTask({ id: b.id, parentId: a.id });
    expect(moved.depth).toBe(2);
    expect(moved.parentId).toBe(a.id);
    expect(listTaskTree(p.id).map((t) => t.title)).toEqual(['a']);
  });

  it('提升到顶层，后代跟着上移一层', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', parentId: a.id });
    createTask({ title: 'c', parentId: b.id });

    moveTask({ id: b.id, parentId: null });
    const tree = listTaskTree(p.id);
    expect(tree.map((t) => t.title)).toEqual(['a', 'b']);
    expect(tree[1].depth).toBe(1);
    expect(tree[1].children[0].depth).toBe(2);
  });

  it('会让子树超过三级的缩进被拒绝，且什么都没改', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', projectId: p.id });
    const b1 = createTask({ title: 'b1', parentId: b.id });
    createTask({ title: 'b1x', parentId: b1.id });

    expect(() => moveTask({ id: b.id, parentId: a.id })).toThrowError(/三级/);
    expect(getTask(b.id).depth).toBe(1);
  });

  it('换项目时整棵子树跟着走，并被提到顶层', () => {
    const p1 = project('ToGoal');
    const p2 = createProject({ name: 'FurDiary', defaultModuleId: 'hobby' });
    const a = createTask({ title: 'a', projectId: p1.id });
    const b = createTask({ title: 'b', parentId: a.id });

    updateTask({ id: b.id, projectId: p2.id });
    expect(listTaskTree(p2.id).map((t) => t.title)).toEqual(['b']);
    expect(getTask(b.id).depth).toBe(1);
    expect(listTaskTree(p1.id).map((t) => t.title)).toEqual(['a']);
  });

  it('指定位置时同级重新编号，不留空档', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', projectId: p.id });
    const c = createTask({ title: 'c', projectId: p.id });

    moveTask({ id: c.id, position: 0 });
    expect(listTaskTree(p.id).map((t) => t.title)).toEqual(['c', 'a', 'b']);
    expect(listTaskTree(p.id).map((t) => t.sortOrder)).toEqual([1, 2, 3]);
    expect([a.id, b.id]).toHaveLength(2);
  });
});

describe('删除任务', () => {
  it('连同子任务与批注一起删掉', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    const b = createTask({ title: 'b', parentId: a.id });
    createNote({ taskId: b.id, kind: 'note', content: '一条备注' });

    deleteTask(a.id);
    expect(listTaskTree(p.id)).toEqual([]);
    expect(listNotesByTask(b.id)).toEqual([]);
    expect(() => getTask(b.id)).toThrowError(/不存在/);
  });

  it('清掉项目里指向它的下一步指针，不留悬空引用', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id });
    updateProject({ id: p.id, nextActionTaskId: a.id });
    expect(listProjects()[0].nextActionTaskId).toBe(a.id);

    deleteTask(a.id);
    expect(listProjects()[0].nextActionTaskId).toBeUndefined();
  });
});

describe('批注与想法转任务', () => {
  it('想法转成任务后落在同一个项目里，并回填指针', () => {
    const p = project();
    const a = createTask({ title: 'a', projectId: p.id, moduleId: 'growth' });
    const note = createNote({ taskId: a.id, kind: 'idea', content: '给卡片加个拟声词' });

    const created = convertNoteToTask({ id: note.id });
    expect(created.title).toBe('给卡片加个拟声词');
    expect(created.projectId).toBe(p.id);
    expect(created.moduleId).toBe('growth');
    expect(listNotesByTask(a.id)[0].convertedTaskId).toBe(created.id);
  });

  it('同一条想法不会被转两次', () => {
    const note = createNote({ kind: 'question', content: '换一个要不要限次数？' });
    convertNoteToTask({ id: note.id });
    expect(() => convertNoteToTask({ id: note.id })).toThrowError(/已经转成任务/);
  });

  it('游离的快速记录不挂任何任务', () => {
    const note = createNote({ kind: 'note', content: '随手记一句' });
    expect(note.taskId).toBeUndefined();
  });
});
