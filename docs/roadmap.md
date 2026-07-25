# TaskFlow 实施路线图

按里程碑推进，每个里程碑映射到 PRD 第 14 节的验收标准编号（下称 AC-n）。原则：先清工程风险，再跑通核心闭环，最后铺展外围功能与视觉。

## PRD 第 14 节验收标准速查

| 编号 | 内容 |
| --- | --- |
| AC-1 | 未完成任务跨天后无需重新录入，一键顺延即可继续；不顺延则留在原来那天 |
| AC-2 | 每一天的队列都能回看，当天完成的与当天有进展的都留在当天 |
| AC-3 | 每日可重新填写并归档今日三件事 |
| AC-4 | 首页始终能推荐一项 Next Task |
| AC-5 | 完成连续工作任务后可推荐其他模块任务 |
| AC-6 | 任务支持跨天、多段计时和手动补录 |
| AC-7 | 项目进度能根据叶子任务自动计算 |
| AC-8 | 习惯能记录重复规则和连续打卡 |
| AC-9 | 周复盘能按模块自动汇总任务与时间 |
| AC-10 | 任意日期都能补写和查看历史周复盘 |
| AC-11 | 多行文本能解析为最多三级的任务结构 |
| AC-12 | 原始导入文本不会丢失 |
| AC-13 | 本机数据能导出并恢复 |

---

## 里程碑总览

```mermaid
flowchart LR
  M0[M0 骨架+spike] --> M1[M1 项目/任务/进度]
  M1 --> M2[M2 三件事+队列+推荐+计时]
  M2 --> M3[M3 时间轴+日程]
  M3 --> M4[M4 习惯]
  M4 --> M5[M5 周复盘]
  M5 --> M6[M6 智能导入]
  M6 --> M7[M7 漫画视觉]
  M7 --> M8[M8 导出恢复]
```

---

## M0 骨架与 spike

**目标**：清除全流程唯一的工程风险——`better-sqlite3` 在开发与打包两种环境下都能加载。

- electron-vite 初始化：main / preload / renderer 三套配置。
- 安全基线：`contextIsolation` + `sandbox` 开、`nodeIntegration` 关，preload 白名单桥骨架。
- `better-sqlite3` 单例连接 + WAL + pragma；Drizzle schema 与首个迁移；启动时 `migrate()`。
- 原生模块处理：Vite external、`electron-rebuild` 脚本、electron-builder `asarUnpack`（见 `architecture.md` 第 5 节）。
- `src/shared/ipc.ts`：`IpcResult`、错误码、`window.api` 类型骨架 + 一个打通两端的 ping 接口。
- TanStack Query provider、路由骨架、Tailwind 接入。

**验收（M0 自身）**：`npm run dev` 与打包后的安装包，两条路径都能打开数据库并完成一次读写。此关不过不进 M1。

**状态：已完成**。两条路径均通过（`npm run selfcheck` / `npm run selfcheck:dist`，输出
`[db] selfcheck ok ... journal=wal fk=true`）。M0 只建 `app_meta` 一张表，业务表从 M1 起按里程碑追加迁移。

**映射 AC**：无（基础设施），但为所有 AC 提供地基。

---

## M1 项目与三级任务、进度计算

**目标**：项目与任务的 CRUD 与自动进度。

- 表：`modules`（预置 8 行）、`projects`、`tasks`、`task_events`、`notes`。
- IPC：`projects.*`、`tasks.*`（不含 `getNext`）、`notes.*`（任务批注与想法转任务）。
- 三级深度约束（`depth CHECK` + 插入校验，`DEPTH_EXCEEDED`）。
- 领域层：`progress.ts` 叶子进度计算（纯函数 + Vitest）。
- UI：`/projects`、`/projects/:id`（任务树、笔记、下一步）。
- UI：**行内大纲编辑**（`ui-spec.md` 第 3 节）——`Enter` 加行、`Tab`/`⌫` 调层级、`Shift+Enter` 写描述。任务没有详情页也没有抽屉，写任务的手感是这个产品最高频的交互，越早立起来越好。
- IPC 重点：`tasks.move`（连同后代改 `depth`、按新父级继承 `project_id`、按「新层级 + 子树高度」校验三级上限）；描述落在 `tasks.description`。

**映射 AC**：AC-7（进度按叶子自动计算）。为 AC-1 / AC-2 铺设 `task_events`。

---

## M2 今日三件事 + 今日队列 + Next Task 推荐 + 计时（核心闭环）

**目标**：跑通 PRD 的核心执行闭环——这是产品的心脏。

- 表：`today_entries`、`daily_focus` + `daily_focus_tasks`、`time_entries`。
- IPC：`focus.*`、`today.*`、`timer.*`、`tasks.getNext`、`stats.homeSummary`。
- 领域层：
  - `recommend.ts` 六级优先级推荐 + 结构化理由（纯函数，注入 `now` 便于测试）。
  - `time.ts` 区间处理与跨午夜切分、任务/项目/模块时间汇总。
- UI：首页 Next Task 主卡片 + 今日三件事 + 今日队列（按项目分块、展开子任务，见 `ui-spec.md` 2.3）+ 计时控件；日终操作（推迟/放回/放弃/拆分/完成）。
- UI：今日队列复用同一个大纲组件，就地加行改层级；Next Task 卡片的 `查看上下文` 接到 `?focus=<id>`（`ui-spec.md` 3.5）。
- UI：日期切换与回看（`ui-spec.md` 2.6）+ 遗留提示条与一键顺延（`ui-spec.md` 2.4）。

**映射 AC**：
- AC-1（`today.backlog` + `today.carryOver`：一键顺延，无需重抄；不点就不搬）
- AC-2（队列落在 `today_entries`，按天归属可精确回看）
- AC-3（三件事按 `date` 填写与归档，次日空白）
- AC-4（`getNext` 始终给出一项或合理空态）
- AC-5（`module_balance` 规则：连续同模块后推荐其他模块）
- AC-6（区间计时：跨天、多段、手动补录）

---

## M3 时间轴与日程

**目标**：可视化计划 vs 实际。

- 表：`schedule_events`。
- IPC：`schedule.*`、`stats.timeline`、`stats.moduleTime`、`stats.projectTime`。
- UI：`/timeline`，计划（描边/虚线）与实际（实心，手动补录用网点）区分渲染；正在计时的动态提示；首页今日时间轴卡片。
- UI：时间轴块单击用 `?focus=` 定位到对应任务那一行；日程时间（`scheduledAt`）与计时段改错在时间轴上直接拖拽/编辑，不另开表单。

**映射 AC**：强化 AC-6 的可视化与校对（修改错误记录）。

---

## M4 习惯系统

**目标**：习惯打卡与连续统计。

- 表：`habits` + `habit_logs`。
- IPC：`habits.*`。
- 领域层：`habit.ts` 当前/最长连续计算（daily / weekdays / weekly_count；done/missed/leave/makeup）。
- UI：`/habits` + 首页习惯打卡卡片。

**映射 AC**：AC-8（重复规则与连续打卡）。为 AC-9 提供习惯汇总数据源。

---

## M5 周复盘

**目标**：按自然周自动汇总 + 手填 + 冻结快照 + 历史补写。

- 表：`weekly_reviews`、`weekly_goals`。
- IPC：`review.*`。
- 领域层：`review.ts` 按 `week_start` 聚合（各模块任务/时间、项目进度变化、三件事、习惯、想法/问题/笔记、未完成仍在队列的任务）。
- 确认时把 summary 序列化进 `snapshot_json` 冻结。
- UI：`/review`，切换历史周、补写、修改历史、选下周重点。

**映射 AC**：
- AC-9（按模块自动汇总任务与时间）
- AC-10（任意日期补写与查看历史周）

---

## M6 多行粘贴智能导入

**目标**：粘贴 -> 解析 -> 预览 -> 修正 -> 确认，原文永久保留。

- 表：`imports` + `import_items`。
- IPC：`import.*`。
- 领域层：`importParser.ts` 纯函数解析（Markdown checkbox、编号/无序列表、缩进子任务、日期标题、项目标题、已完成状态、普通笔记；第 4 层及更深归为 note）。重点用 Vitest 覆盖各种粘贴样式。
- UI：`/import` 结构化预览与逐条修正；首页底部入口。

**映射 AC**：
- AC-11（解析为最多三级任务结构）
- AC-12（`imports.raw_text` 永久保留原文）

---

## M7 漫画视觉风格与动画

**目标**：把功能骨架包装成《电器街的漫画店》风格的原创视觉。

- Tailwind 设计 token 落地（配色、网点、分镜卡片、描边）。
- 全局原创助手角色 + 气泡（推荐理由、完成反馈、空状态引导），被动不打断。
- 完成任务的漫画式反馈动画；进行中计时的速度线。
- notes 的手写批注/角色气泡呈现。
- 无障碍降级：`prefers-reduced-motion`、颜色非唯一区分。

**映射 AC**：无新增功能 AC，提升 AC-4/AC-5 推荐的可解释性与整体体验。

---

## M8 导出与恢复

**目标**：本机数据可备份可恢复（放最后但不可省）。

- IPC：`backup.exportJson`、`backup.importJson`、`backup.copyDbFile`。
- 两条路径：
  1. 全量 JSON 导出（人可读、带 `formatVersion`、可跨版本迁移）。
  2. 直接复制 `.db` 文件做快速全量备份。
- `app_meta` 存格式版本；恢复时按版本迁移。
- UI：`/settings` 导出/恢复入口。

**映射 AC**：AC-13（本机数据导出并恢复）。

---

## 验收标准覆盖回溯

| AC | 里程碑 |
| --- | --- |
| AC-1 | M2 |
| AC-2 | M2 |
| AC-3 | M2 |
| AC-4 | M2（M7 强化解释） |
| AC-5 | M2（M7 强化解释） |
| AC-6 | M2（M3 可视化/校对） |
| AC-7 | M1 |
| AC-8 | M4 |
| AC-9 | M5 |
| AC-10 | M5 |
| AC-11 | M6 |
| AC-12 | M6 |
| AC-13 | M8 |

全部 13 条验收标准均有明确落点。核心闭环在 M2 即可演示，是最早的可用版本；M3–M8 为增量铺展。
