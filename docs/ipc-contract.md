# TaskFlow IPC 契约

本文档是桌面应用的"API 文档"等价物。前后端通过 Electron IPC 通信（不走 HTTP），契约由 `src/shared/` 下的 TypeScript 类型 + zod schema 强制约束，签名对不上编译期即报错。

约定：

- 每个接口对应一个 IPC 频道，命名 `域.动作`（如 `tasks.getNext`）。
- Preload 把每个频道包装成 `window.api.<域>.<动作>(payload)`，内部是 `ipcRenderer.invoke`。
- 主进程 handler：zod 校验入参 -> 调用领域/仓储 -> 返回 `IpcResult<T>`。
- 所有时间戳为 Unix 毫秒（`number`），日期为 `YYYY-MM-DD`（`string`），id 为 `string`。

---

## 1. 统一返回包装与错误码

```ts
// src/shared/ipc.ts
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export type ErrorCode =
  | 'VALIDATION'      // zod 入参校验失败
  | 'NOT_FOUND'       // 目标记录不存在
  | 'CONFLICT'        // 违反业务约束（如已有进行中的计时段）
  | 'DEPTH_EXCEEDED'  // 任务超过三级
  | 'IMPORT_PARSE'    // 导入解析失败
  | 'BACKUP_IO'       // 导出/恢复的文件读写失败
  | 'INTERNAL';       // 兜底
```

渲染进程侧统一在 TanStack Query 的 wrapper 里判断 `ok`，`false` 时抛出带 `code` 的错误交给 UI 展示，业务代码不用到处 try/catch。

约定：所有 `getX/listX` 查询类接口在目标为空时返回空数组或 `null`（`ok: true`），不用 `NOT_FOUND`；`NOT_FOUND` 仅用于按 id 操作一个本应存在的记录时。

---

## 2. projects 项目

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `projects.list` | `{ status?: 'active'\|'archived' }` | `ProjectWithProgress[]` | 列表，带实时进度与累计时间 |
| `projects.get` | `{ id }` | `ProjectDetail` | 项目详情（含任务树、笔记、下一步） |
| `projects.create` | `CreateProjectInput` | `Project` | 新建，需指定默认模块 |
| `projects.update` | `{ id } & Partial<CreateProjectInput>` | `Project` | 改名/目标/默认模块/下一步/笔记 |
| `projects.archive` | `{ id }` | `Project` | 归档（status=archived） |
| `projects.reorder` | `{ orderedIds: string[] }` | `void` | 拖拽排序 |

```ts
type ProjectWithProgress = Project & {
  progress: { doneLeaves: number; totalLeaves: number; ratio: number };
  totalTimeMs: number;
};
```

进度与时间由领域层实时计算（见 `data-model.md` 第 5 节），不从库里读可变字段。

---

## 3. tasks 任务

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `tasks.tree` | `{ projectId }` | `TaskNode[]` | 项目下的三级任务树 |
| `tasks.get` | `{ id }` | `TaskFull` | 任务详情抽屉的数据源，见 3.2 |
| `tasks.create` | `CreateTaskInput` | `Task` | 新建；有 `parentId` 时校验 `depth<=3`，否则 `DEPTH_EXCEEDED` |
| `tasks.update` | `{ id } & Partial<...>` | `Task` | 改标题/模块/截止/日程/所属项目 |
| `tasks.complete` | `{ id }` | `Task` | 标记完成，记 `completed` 事件；返回后前端可请求下一个 |
| `tasks.reopen` | `{ id }` | `Task` | 取消完成 |
| `tasks.move` | `{ id, parentId?, projectId?, sortOrder? }` | `Task` | 移动层级/项目/排序，校验深度 |
| `tasks.delete` | `{ id }` | `void` | 删除（级联子任务与 notes） |
| `tasks.getNext` | `GetNextInput` | `NextTaskResult` | **核心**：推荐下一件任务 + 结构化理由 |
| `tasks.pinNext` | `{ id: string \| null }` | `void` | 手动指定 Next Task（优先于全部自动规则）；`null` 取消指定 |

### 3.1 tasks.get（任务详情抽屉的数据源）

任务详情抽屉（`ui-spec.md` 第 3 节）是任务的唯一编辑界面，一次请求拉齐它需要的全部内容，避免打开抽屉时并发四五个查询。

```ts
type TaskFull = TaskDetail & {
  children: Task[];               // 只取直接子级：抽屉只展示一层，更深的层级由被点开的子任务自己展示
  ancestors: { id: string; title: string }[];  // 根到父的面包屑
};
```

`TaskDetail` 已含 `projectName`、`totalTimeMs`、`notes`、`linkedFocusSlot`。计时分段另走 `timer.listByTask`（见第 6 节），因为它是唯一可能很长的列表。

### 3.2 tasks.getNext（推荐引擎接口）

对应 PRD 6.1/6.2。返回推荐任务与**结构化的推荐理由**，理由直接喂给首页助手角色气泡，使六级优先级对用户可解释。

```ts
type GetNextInput = {
  now: number;                 // 当前时间，便于测试注入
  excludeTaskId?: string;      // "换一个" 时排除当前推荐
};

type NextTaskResult = {
  task: TaskDetail | null;     // 无可执行任务时为 null
  reason: {
    rule:
      | 'manual_pin'           // 0 用户手动指定（tasks.pinNext），优先于以下全部规则
      | 'active_timer'         // 1 正在计时
      | 'focus_linked'         // 2 与今日三件事关联
      | 'in_progress'          // 3 已开始未完成
      | 'project_next_action'  // 4 重点项目下一步
      | 'today_queue_top'      // 5 今日队列靠前
      | 'module_balance';      // 6 模块平衡
    message: string;           // 给角色气泡的自然语言
    context?: {                // 模块平衡时附带的解释数据
      recentSameModuleCount?: number;
      continuousFocusMs?: number;
      suggestedModuleId?: string;
      upcomingScheduleAt?: number;
    };
  } | null;
};
```

手动指定（`tasks.pinNext`）优先于 `excludeTaskId`，因此前端的 `换一个` 必须先 `pinNext({ id: null })` 取消指定再排除当前任务；被指定的任务完成后指定自动失效。

推荐逻辑是 `src/main/domain/recommend.ts` 的纯函数：输入当前状态快照（计时、三件事关联、今日队列、项目下一步、最近完成序列、时间、日程），输出 task + reason，可脱离数据库单测。

---

## 4. today 今日队列

对应 PRD 5.4 日终处理与今日队列。队列是 `tasks.in_today` 字段，非快照表。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `today.list` | `{}` | `TodayQueueGroup[]` | 今日队列，按项目分块、块内展开子任务，见下 |
| `today.add` | `{ taskId }` | `void` | 加入队列，记 `added_to_today` 事件 |
| `today.remove` | `{ taskId }` | `void` | 移出队列，记 `removed_from_today` |
| `today.reorder` | `{ orderedIds }` | `void` | 队列内排序 |
| `today.postpone` | `{ taskId, toDate? }` | `void` | 推迟到明天或指定日期；记 `postponed` |
| `today.returnToPool` | `{ taskId }` | `void` | 放回项目任务池（移出今日）；记 `returned_to_pool` |
| `today.abandon` | `{ taskId }` | `void` | 放弃任务；记 `abandoned` |
| `today.split` | `{ taskId, childrenTitles: string[] }` | `Task[]` | 拆分为子任务；记 `split`，校验深度 |

日终不产生"过期"状态：未处理的任务默认继续留在队列，无需任何操作。

### 4.1 `today.list` 的形状

首页取消了独立的「项目进度」区域，项目改为以分块形式进入今日队列（UI 规范 2.3），所以队列不再返回扁平数组：

```ts
type TodayQueueNode = TaskDetail & { children: TodayQueueNode[] };

type TodayQueueGroup = {
  projectId?: string;      // 空 = 散任务块
  projectName?: string;
  moduleId?: string;       // 项目默认模块，供块标题的色点
  items: TodayQueueNode[];
  todoCount: number;       // 计入块内展示出来的每个节点，含被父任务带出的子任务
  doneCount: number;
};
```

分组与排序规则，全部在领域层算好，前端只负责画：

- **块内根项** = `in_today = 1` 且**祖先都不在队列**的任务。父子同时入队时只保留父级，子级作为它的下一层出现，避免同一件事出现两次。
- **子级** = 根项的全部后代，`in_today` 为 0 的也要返回。首页要能直接看到「这件事拆开是什么」，所以 `inToday === false` 的节点表示它是被带出来的上下文，不是独立队列项。
- **根项排序**：未完成的按 `today_sort_order`，已完成的沉到块末尾按 `done_at`（沿用「完成不消失」的规则）。
- **子级排序**：按 `sort_order`，完成**不**沉底——子任务表达的是任务的结构，顺序一变就不好读了。
- **块排序**：按块内未完成根项的最小 `today_sort_order`，于是用户的手动排序仍然说了算；整块做完的沉到最后。散任务块按同一规则参与排序，没有固定位置。

---

## 5. focus 今日三件事

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `focus.getDay` | `{ date }` | `DailyFocus[]` | 某天的三件事（slot 1/2/3），不存在返回空槽 |
| `focus.set` | `{ date, slot, content?, projectId? }` | `DailyFocus` | 填写/更新某一槽（upsert by date+slot） |
| `focus.linkTasks` | `{ focusId, taskIds: string[] }` | `void` | 关联一个或多个任务（覆盖式） |
| `focus.toggleDone` | `{ focusId, isDone }` | `DailyFocus` | 标记完成 |

第二天 `date` 变化即空白，旧记录按日期归档可回看，不自动复制。

---

## 6. timer 计时

对应 PRD 第 7 节。基于 `time_entries` 区间模型。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `timer.start` | `{ taskId?, now }` | `TimeEntry` | 开新段；若已有进行中段先自动结束它（保证唯一）；`taskId` 可空 |
| `timer.stop` | `{ now }` | `TimeEntry \| null` | 结束当前进行中段 |
| `timer.pause` | `{ now }` | `TimeEntry \| null` | 语义等同 stop（结束当前段） |
| `timer.resume` | `{ taskId?, now }` | `TimeEntry` | 语义等同 start（开新段） |
| `timer.active` | `{}` | `TimeEntry \| null` | 当前进行中的段（`ended_at IS NULL`） |
| `timer.addManual` | `{ taskId?, startedAt, endedAt, moduleId?, note? }` | `TimeEntry` | 手动补录（source=manual） |
| `timer.update` | `{ id, startedAt?, endedAt?, taskId?, moduleId?, note? }` | `TimeEntry` | 修改错误记录 |
| `timer.delete` | `{ id }` | `void` | 删除记录 |
| `timer.classify` | `{ id, taskId, moduleId? }` | `TimeEntry` | 给无任务段事后归类 |
| `timer.listByTask` | `{ taskId }` | `TimeEntry[]` | 某任务的全部分段，按 `started_at` 升序；任务详情抽屉的计时记录分区 |

开始计时若已有进行中段，先结束旧段再开新段；若违反其他业务约束返回 `CONFLICT`。

---

## 7. schedule 日程

时间轴上的"计划"，与 timer 的"实际"分开渲染。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `schedule.listRange` | `{ from, to }` | `ScheduleEvent[]` | 时间范围内的日程 |
| `schedule.create` | `{ title, startAt, endAt, taskId?, moduleId? }` | `ScheduleEvent` | 新建计划时段 |
| `schedule.update` | `{ id } & Partial<...>` | `ScheduleEvent` | 修改 |
| `schedule.delete` | `{ id }` | `void` | 删除 |

`stats.timeline`（见第 12 节）合并返回同一天的计划与实际，供时间轴一次性渲染。

---

## 8. habits 习惯

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `habits.list` | `{}` | `HabitWithStreak[]` | 习惯列表，带当前/最长连续 |
| `habits.create` | `CreateHabitInput` | `Habit` | 支持 daily/weekdays/weekly_count |
| `habits.update` | `{ id } & Partial<...>` | `Habit` | 修改规则/暂停 |
| `habits.delete` | `{ id }` | `void` | 删除（级联打卡） |
| `habits.log` | `{ habitId, date, status }` | `HabitLog` | 打卡：done/missed/leave/makeup（upsert by habit+date） |
| `habits.history` | `{ habitId, from, to }` | `HabitLog[]` | 历史记录 |

```ts
type HabitWithStreak = Habit & {
  currentStreak: number;
  longestStreak: number;
  todayStatus?: 'done' | 'missed' | 'leave' | 'makeup';
};
```

连续统计由 `src/main/domain/habit.ts` 从 `habit_logs` 计算。

---

## 9. notes 笔记 / 想法 / 问题 / 链接

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `notes.listByTask` | `{ taskId }` | `Note[]` | 某任务下的批注 |
| `notes.create` | `{ taskId?, kind, content, url? }` | `Note` | 新建（note/idea/question/link） |
| `notes.update` | `{ id, content?, url? }` | `Note` | 修改 |
| `notes.delete` | `{ id }` | `void` | 删除 |
| `notes.convertToTask` | `{ id, projectId?, moduleId? }` | `Task` | 想法/问题转为正式任务，回填 `converted_task_id` |
| `notes.quickCapture` | `{ content, kind? }` | `Note` | 首页快速记录（游离，task_id 空） |

---

## 10. import 多行粘贴智能导入

对应 PRD 第 11 节。流程：解析 -> 预览 -> 修正 -> 确认，原文永久保留。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `import.parse` | `{ rawText }` | `ImportPreview` | 解析原文为结构化预览，**不落库** |
| `import.commit` | `{ rawText, items: ImportItemInput[], projectId? }` | `ImportResult` | 用户修正后确认；落 `imports`+`import_items`，生成任务，保留原文 |
| `import.list` | `{}` | `ImportRecord[]` | 历史导入记录 |
| `import.get` | `{ id }` | `ImportRecord` | 查看某次导入的原文与条目 |

```ts
type ImportPreview = {
  items: {
    lineNo: number;
    parsedKind: 'task' | 'note' | 'date_header' | 'project_header';
    depth?: number;      // >3 的层级建议归为 note
    content: string;
    isDone?: boolean;
  }[];
};
```

解析器 `src/main/domain/importParser.ts` 是纯函数，识别 Markdown checkbox、编号/无序列表、缩进子任务、日期标题、项目标题、已完成状态、普通笔记；解析失败返回 `IMPORT_PARSE`。第 4 层及更深默认归为 note（不进进度）。

---

## 11. review 周复盘

对应 PRD 第 12 节。`week_start`（周一）为归属键。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `review.getWeek` | `{ weekStart }` | `WeeklyReview` | 该周复盘；未确认返回实时汇总，已确认返回快照 |
| `review.summary` | `{ weekStart }` | `WeeklySummary` | 实时自动汇总（各模块任务/时间、项目进度变化、三件事、习惯、想法等） |
| `review.saveDraft` | `{ weekStart, fields }` | `WeeklyReview` | 保存手填字段（不冻结） |
| `review.confirm` | `{ weekStart }` | `WeeklyReview` | 确认：把当前 summary 冻结进 `snapshot_json`，写 `confirmed_at` |
| `review.setNextGoals` | `{ weekStart, goals: WeeklyGoalInput[] }` | `WeeklyGoal[]` | 从未完成任务/现有项目选下周重点（不复制原文） |
| `review.listWeeks` | `{}` | `{ weekStart, confirmed }[]` | 可切换的历史周列表 |

`WeeklySummary` 由 `src/main/domain/review.ts` 按 `week_start` 聚合多表得到，确认前实时展示，确认时序列化冻结。

---

## 12. stats 汇总

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `stats.timeline` | `{ date }` | `TimelineData` | 某天时间轴：计划(schedule) + 实际(time_entries)，跨午夜已切分 |
| `stats.moduleTime` | `{ from, to }` | `{ moduleId, totalMs }[]` | 按模块的时间汇总 |
| `stats.projectTime` | `{ projectId, from?, to? }` | `{ totalMs }` | 项目时间汇总 |
| `stats.homeSummary` | `{}` | `HomeSummary` | 首页次级区域聚合（习惯今日状态、各模块今日时间等）一次拉齐；首页已不展示项目进度，`projects` 字段供 `/projects` 与周复盘复用 |

```ts
type TimelineData = {
  planned: ScheduleEvent[];
  actual: { id: string; taskId: string | null; moduleId: string | null;
            startedAt: number; endedAt: number | null; source: 'timer' | 'manual' }[];
};
```

---

## 13. backup 导出与恢复

对应 PRD 第 3 节与验收标准 12。两条路径。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `backup.exportJson` | `{}` | `{ filePath }` | 全量导出为版本化 JSON（人可读、可跨版本迁移），弹保存对话框 |
| `backup.importJson` | `{ filePath }` | `{ imported: Record<string, number> }` | 从 JSON 恢复；按 `app_meta` 版本迁移 |
| `backup.copyDbFile` | `{}` | `{ filePath }` | 直接复制 `.db` 文件做快速全量备份 |

导出 JSON 顶层带 `formatVersion`（存于 `app_meta`），恢复时按版本做迁移，避免升级后旧备份无法读取。文件读写失败返回 `BACKUP_IO`。

---

## 14. window.api 类型（preload 暴露形状）

```ts
// src/shared/ipc.ts —— 两端共享，编译期约束一致性
export interface Api {
  projects: {
    list(p: { status?: 'active' | 'archived' }): Promise<IpcResult<ProjectWithProgress[]>>;
    get(p: { id: string }): Promise<IpcResult<ProjectDetail>>;
    // ...其余按上表
  };
  tasks: {
    getNext(p: GetNextInput): Promise<IpcResult<NextTaskResult>>;
    // ...
  };
  today: { /* ... */ };
  focus: { /* ... */ };
  timer: { /* ... */ };
  schedule: { /* ... */ };
  habits: { /* ... */ };
  notes: { /* ... */ };
  import: { /* ... */ };
  review: { /* ... */ };
  stats: { /* ... */ };
  backup: { /* ... */ };
}

declare global {
  interface Window { api: Api }
}
```

`Api` 与主进程 handler 注册表由同一份 `src/shared/schema/` 推导，任一端漏实现或签名不符，`tsc` 立即报错——这是本项目替代 HTTP API 文档的核心保证。
