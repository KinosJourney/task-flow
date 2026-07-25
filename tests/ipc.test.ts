import path from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHANNELS } from '@shared/ipc';
import type { IpcResult } from '@shared/ipc';
import type { Note, Project, ProjectDetail, Task } from '@shared/types';
import { getDb, useSqlite } from '@main/db/connection';
import { seedModules } from '@main/db/seedModules';
import { registerProjectHandlers } from '@main/ipc/projects';
import { registerTaskHandlers } from '@main/ipc/tasks';
import { registerNoteHandlers } from '@main/ipc/notes';
import { invokeChannel, resetHandlers } from './stubs/electron';

/**
 * handler 层的测试：证明入参过了 zod、失败被翻成对应的 ErrorCode、成功被包成 IpcResult。
 * 仓储层的行为另见 repo.test.ts，这里只关心「渲染进程发一个 payload 过来」会得到什么。
 */
beforeEach(() => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  useSqlite(sqlite);
  migrate(getDb(), { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  seedModules();

  resetHandlers();
  registerProjectHandlers();
  registerTaskHandlers();
  registerNoteHandlers();
});

async function call<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return (await invokeChannel(channel, payload)) as IpcResult<T>;
}

/** 大部分用例只关心成功那一支，失败时直接把错误码抛出来看 */
async function data<T>(channel: string, payload?: unknown): Promise<T> {
  const result = await call<T>(channel, payload);
  if (!result.ok) throw new Error(`${channel} 失败：[${result.error.code}] ${result.error.message}`);
  return result.data;
}

async function aProject(name = 'ToGoal'): Promise<Project> {
  return data<Project>(CHANNELS.projectsCreate, { name, defaultModuleId: 'work' });
}

describe('入参校验', () => {
  it('缺必填字段报 VALIDATION，而不是抛异常', async () => {
    const result = await call(CHANNELS.projectsCreate, { name: 'ToGoal' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('多传没约定的字段也报 VALIDATION：schema 是 strict 的', async () => {
    const result = await call(CHANNELS.projectsCreate, {
      name: 'ToGoal',
      defaultModuleId: 'work',
      nope: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('不存在的模块 id 过不了枚举校验', async () => {
    const result = await call(CHANNELS.projectsCreate, { name: 'ToGoal', defaultModuleId: '工作' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});

describe('projects.get', () => {
  it('把任务树、下一步与项目内批注一次带回渲染进程', async () => {
    const project = await aProject();
    const parent = await data<Task>(CHANNELS.tasksCreate, {
      title: '实现主卡片',
      projectId: project.id,
    });
    const child = await data<Task>(CHANNELS.tasksCreate, {
      title: '分镜布局',
      parentId: parent.id,
    });
    await data<Note>(CHANNELS.notesCreate, {
      taskId: child.id,
      kind: 'idea',
      content: '来个拟声词',
    });
    await data<Project>(CHANNELS.projectsUpdate, { id: project.id, nextActionTaskId: child.id });

    const detail = await data<ProjectDetail>(CHANNELS.projectsGet, { id: project.id });
    expect(detail.tree[0].children.map((t) => t.title)).toEqual(['分镜布局']);
    expect(detail.nextAction?.id).toBe(child.id);
    expect(detail.taskNotes.map((n) => n.content)).toEqual(['来个拟声词']);
  });

  it('查不存在的项目报 NOT_FOUND', async () => {
    const result = await call(CHANNELS.projectsGet, { id: 'p_nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});

describe('大纲的写操作', () => {
  it('Enter 那两步：create 落到同级末尾，move 摆到当前行下面', async () => {
    const project = await aProject();
    const first = await data<Task>(CHANNELS.tasksCreate, { title: 'a', projectId: project.id });
    await data<Task>(CHANNELS.tasksCreate, { title: 'b', projectId: project.id });
    const created = await data<Task>(CHANNELS.tasksCreate, {
      title: '新任务',
      projectId: project.id,
    });
    await data<Task>(CHANNELS.tasksMove, { id: created.id, position: 1 });

    const detail = await data<ProjectDetail>(CHANNELS.projectsGet, { id: project.id });
    expect(detail.tree.map((t) => t.title)).toEqual(['a', '新任务', 'b']);
    expect(first.sortOrder).toBe(1);
  });

  it('缩进超过三级返回 DEPTH_EXCEEDED，前端据此换成键位提示', async () => {
    const project = await aProject();
    const a = await data<Task>(CHANNELS.tasksCreate, { title: 'a', projectId: project.id });
    const b = await data<Task>(CHANNELS.tasksCreate, { title: 'b', projectId: project.id });
    const b1 = await data<Task>(CHANNELS.tasksCreate, { title: 'b1', parentId: b.id });
    await data<Task>(CHANNELS.tasksCreate, { title: 'b1x', parentId: b1.id });

    const result = await call(CHANNELS.tasksMove, { id: b.id, parentId: a.id });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DEPTH_EXCEEDED');
  });

  it('Shift+Enter 的描述写进 tasks.description，传 null 清空', async () => {
    const project = await aProject();
    const task = await data<Task>(CHANNELS.tasksCreate, { title: 'a', projectId: project.id });

    expect((await data<Task>(CHANNELS.tasksUpdate, { id: task.id, description: '记一句' })).description).toBe(
      '记一句',
    );
    expect(
      (await data<Task>(CHANNELS.tasksUpdate, { id: task.id, description: null })).description,
    ).toBeUndefined();
  });
});

describe('批注', () => {
  it('想法转成任务后回填指针，同一条不会转两次', async () => {
    const project = await aProject();
    const task = await data<Task>(CHANNELS.tasksCreate, { title: 'a', projectId: project.id });
    const note = await data<Note>(CHANNELS.notesCreate, {
      taskId: task.id,
      kind: 'idea',
      content: '给卡片加个拟声词',
    });

    const created = await data<Task>(CHANNELS.notesConvertToTask, { id: note.id });
    expect(created.projectId).toBe(project.id);
    const [stored] = await data<Note[]>(CHANNELS.notesListByTask, { taskId: task.id });
    expect(stored.convertedTaskId).toBe(created.id);

    const again = await call(CHANNELS.notesConvertToTask, { id: note.id });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('CONFLICT');
  });

  it('内容为空被拒绝', async () => {
    const result = await call(CHANNELS.notesQuickCapture, { content: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });
});
