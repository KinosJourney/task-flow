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

type ProjectDetail = ProjectWithProgress & {
  tree: TaskNode[];        // 项目下的三级任务树
  nextAction?: Task;       // nextActionTaskId 指向的任务，指针悬空时没有这个字段
  taskNotes: Note[];       // 项目内各任务下的批注
};
```

进度与时间由领域层实时计算（见 `data-model.md` 第 5 节），不从库里读可变字段。

详情页那三块要同时画出来，所以 `projects.get` 一次取齐而不是让前端再配几个频道，否则页面会分几次闪。批注字段叫 `taskNotes`：`Project.notes` 已经是项目自己的一段说明文字，两者不是一回事。`nextActionTaskId` 那一列没有外键，指向的任务被删掉时当作没指定，不报 `NOT_FOUND`。

---

## 3. tasks 任务

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `tasks.tree` | `{ projectId }` | `TaskNode[]` | 项目下的三级任务树 |
| `tasks.get` | `{ id }` | `TaskDetail` | 任务详情（含 notes、计时汇总） |
| `tasks.create` | `CreateTaskInput` | `Task` | 新建；有 `parentId` 时校验 `depth<=3`，否则 `DEPTH_EXCEEDED`。没有插入位参数，新行落在同级末尾，要插到中间由随后的 `tasks.move` 负责 |
| `tasks.update` | `{ id } & Partial<...>` | `Task` | 改标题/模块/截止/日程/所属项目 |
| `tasks.complete` | `{ id }` | `Task` | 标记完成，记 `completed` 事件；返回后前端可请求下一个 |
| `tasks.reopen` | `{ id }` | `Task` | 取消完成 |
| `tasks.move` | `{ id, parentId?, projectId?, position? }` | `Task` | 移动层级/项目/排序，校验深度。`position` 是同级中的目标位置（0 基） |
| `tasks.delete` | `{ id }` | `void` | 删除（级联子任务与 notes） |
| `tasks.getNext` | `GetNextInput` | `NextTaskResult` | **核心**：推荐下一件任务 + 结构化理由 |
| `tasks.pinNext` | `{ id: string \| null }` | `void` | 手动指定 Next Task（优先于全部自动规则）；`null` 取消指定 |

### 3.1 行内大纲编辑用到的频道

任务在清单里直接编辑（`ui-spec.md` 第 3 节），键位对应的频道：

| 键位 | 频道 | 说明 |
| --- | --- | --- |
| `Enter` | `tasks.create` + `tasks.move` | create 只会放到同级末尾，再 move 到 `{ position: 当前行序号 + 1 }`。`title` 有 `min(1)` 校验，所以新行用占位标题「新任务」 |
| `Tab` | `tasks.move` | `{ id, parentId: 上一个同级任务, position: 新父级现有子级数 }` |
| `⌫` / `Shift+Tab` | `tasks.move` | `{ id, parentId: 父级的父级, position: 原父级序号 + 1 }`；第一级的空行改调 `tasks.delete` |
| 标题失焦 | `tasks.update` | `{ id, title }` |
| `Shift+Enter` | `tasks.update` | `{ id, description }`，`null` 清空。描述是任务的字段，不是 `notes` |

`tasks.move` 的三条不变式：连同后代一起改 `depth`；按新父级重写 `project_id`（PRD 4.1 项目内任务自动继承）；深度校验看「新层级 + 子树高度」而不是只看被移动那一行。移到自己的后代下要拒绝（`CONFLICT`）。

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

对应 PRD 5.4 日终与跨天。队列按天归属，落在 `today_entries` 表（data-model 1.1、4.4），**所有频道都必须带日期**——没有"当前队列"这种无日期的概念。

| 频道 | 入参 | 返回 | 语义 |
| --- | --- | --- | --- |
| `today.list` | `{ date }` | `TodayQueueGroup[]` | 某天的队列，按项目分块、块内展开子任务，见下 |
| `today.add` | `{ taskId, date }` | `void` | 加入那天的队列，记 `added_to_today` 事件 |
| `today.remove` | `{ taskId, date }` | `void` | 只移出那一天，记 `removed_from_today` |
| `today.backlog` | `{ before }` | `TodayBacklog` | `before` 之前还没做完的遗留项，见 4.2 |
| `today.carryOver` | `{ date, taskIds? }` | `{ carriedCount }` | 一键顺延；省略 `taskIds` 表示全部遗留 |
| `today.reorder` | `{ date, orderedIds }` | `void` | 那天队列内排序 |
| `today.postpone` | `{ taskId, toDate? }` | `void` | 推迟到指定日期；记 `postponed` |
| `today.returnToPool` | `{ taskId, date }` | `void` | 放回项目任务池（移出那天）；记 `returned_to_pool` |
| `today.abandon` | `{ taskId }` | `void` | 放弃任务；记 `abandoned` |
| `today.split` | `{ taskId, childrenTitles: string[] }` | `Task[]` | 拆分为子任务；记 `split`，校验深度 |

日终不产生"过期"状态，也**不自动搬运**：跨天时什么都不发生，没做完的事留在它原本那一天，第二天的队列天然是空的。要不要捡起来由用户点 `today.carryOver` 决定。

`carryOver` 是 INSERT 而非 UPDATE：在 `date` 那天插行，原来那天的行不动，因此"当天完成的、当天有进展的都留在当日"。`UNIQUE(date, task_id)` 让它幂等；已完成的任务不进遗留清单，因此也不会被顺延。

### 4.1 `today.list` 的形状

首页取消了独立的「项目进度」区域，项目改为以分块形式进入今日队列（UI 规范 2.3），所以队列不再返回扁平数组：

```ts
/** 这行在**它所属那一天**的状态：完成状态只有一份，但「那天有没有做完」是行级的 */
type TodayEntryStatus =
  | 'pending'      // 至今未完成
  | 'done'         // 就在那天完成的
  | 'done_later';  // 那天没做完，后来某天才完成

type TodayQueueNode = TaskDetail & {
  status: TodayEntryStatus;
  carriedFrom?: string;   // 有值 = 这行是顺延来的，值是它最早入队的那天。只有根行会有
  children: TodayQueueNode[];
};

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

- **块内根项** = 那天在 `today_entries` 有行、且**祖先那天都不在队列**的任务。父子同时入队时只保留父级，子级作为它的下一层出现，避免同一件事出现两次。
- **子级** = 根项的后代中那天该露面的：没做完的一直露面，已完成的只在**它完成的那天**露面。于是顺延一个「子任务做了一半」的父任务时，昨天做完的子任务不跟到今天，今天看到的只剩没做完的分支。
- **`status` 的算法**：未完成 → `pending`；`done_at` 落在该行日期 → `done`；`done_at` 晚于该行日期 → `done_later`（那天终究没做完，回看时要如实显示，而不是伪装成当天的成果）。
- **计数口径**：`doneCount` 只数 `status === 'done'` 的节点，`done_later` 算在 `todoCount` 里——那天它确实没做完。
- **根项排序**：`status !== 'done'` 的按当天的 `sort_order`，当天达成的沉到块末尾按 `done_at`（沿用「完成不消失」的规则）。
- **子级排序**：按 `sort_order`，完成**不**沉底——子任务表达的是任务的结构，顺序一变就不好读了。
- **块排序**：按块内未达成根项的最小 `sort_order`，于是用户的手动排序仍然说了算；整块做完的沉到最后。散任务块按同一规则参与排序，没有固定位置。

### 4.2 `today.backlog` 的形状

```ts
type BacklogItem = TaskDetail & { queuedDate: string };  // 最早入队那天，用来说明拖了多久

type TodayBacklog = {
  items: BacklogItem[];   // 按 queuedDate 升序：拖得最久的排最前面
  oldestDate?: string;
};
```

进入遗留清单的条件（三条都要满足）：早于 `before` 入过队、任务至今未完成、`before` 那天**还没有**行（已经顺延过来的不算欠账）。被父任务带出来的子任务不单列——顺延父任务时它们自然跟着走。

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
| `timer.listByTask` | `{ taskId }` | `TimeEntry[]` | 某任务的全部分段，按 `started_at` 升序 |

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

对应 PRD 第 3 节与验收标准 13。两条路径。

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
