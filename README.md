# TaskFlow

桌面端个人任务执行应用。产品目标不是"管理更多任务"，而是持续回答一个问题：**我现在最应该做什么？**

- 产品需求：[`prd.md`](./prd.md)
- 架构与技术选型：[`docs/architecture.md`](./docs/architecture.md)
- 数据模型：[`docs/data-model.md`](./docs/data-model.md)
- IPC 契约：[`docs/ipc-contract.md`](./docs/ipc-contract.md)
- UI 与视觉规范：[`docs/ui-spec.md`](./docs/ui-spec.md)
- 里程碑：[`docs/roadmap.md`](./docs/roadmap.md)

技术栈：Electron + electron-vite + React 19 + TypeScript + Tailwind + TanStack Query + SQLite（better-sqlite3）+ Drizzle ORM。

## 当前进度

M0（工程骨架与原生模块 spike）已完成：开发与打包两条路径都能打开 SQLite 并完成一次读写。

M1（项目、三级任务、批注与进度）已完成：`/projects` 与 `/projects/:id` 走真实 IPC，任务在大纲里行内编辑（`Enter` 加行、`Tab`/`⌫` 调层级、`Shift+Enter` 写描述），项目进度按叶子任务实时计算。首页队列、计时、习惯、周复盘等区域的数据仍来自 `src/renderer/mock/`，按里程碑逐个换成真实频道。

## 目录结构

```
src/
├── shared/      两端共享：IpcResult、频道常量、领域类型、zod schema
├── main/        主进程：db（单例/schema/迁移）、ipc（handler）、domain（纯函数，M1 起）
├── preload/     contextBridge 白名单桥
└── renderer/    React 界面（pages / components / features / lib）
drizzle/         迁移文件，append-only，勿改历史
tests/           Vitest
```

## 常用命令

```bash
npm install          # 安装依赖（postinstall 会按 Electron ABI 重建 better-sqlite3）
npm run dev          # 开发：主进程/preload/渲染进程三套热更新
npm run typecheck    # tsconfig.node.json + tsconfig.app.json 两套类型检查
npm test             # Vitest
npm run db:generate  # 改完 src/main/db/schema.ts 后生成迁移
npm run dist         # 打 dmg 安装包到 release/
```

## 数据库

- 文件位置：`app.getPath('userData')/taskflow.db`
  - 开发：`~/Library/Application Support/TaskFlow Dev/taskflow.db`
  - 安装后：`~/Library/Application Support/TaskFlow/taskflow.db`
- 启动时按 `drizzle/` 执行迁移，然后跑一次读写自检，日志形如：
  `[db] selfcheck ok packaged=false journal=wal fk=true writes=3 path=...`
- 界面上的「设置 → 运行环境自检」展示同一条链路（渲染进程 → preload → 主进程 → SQLite）的结果。

验收 M0 的两条路径：

```bash
npm run selfcheck       # 开发环境：构建后直接跑主进程自检，退出码 0 即通过
npm run dist:dir        # 打出 .app（不做 dmg，快）
npm run selfcheck:dist  # 打包环境：跑 .app 内的自检，验证 asar 解包后的原生模块
```

## 本机环境注意事项

1. **Cursor/VSCode 集成终端会带上 `ELECTRON_RUN_AS_NODE=1`**，Electron 会因此以纯 Node 启动，报
   `Cannot read properties of undefined (reading 'app')`。所有拉起 Electron 的脚本都经
   `scripts/run-electron.mjs` 清掉该变量，直接手敲 `npx electron ...` 时需自行
   `env -u ELECTRON_RUN_AS_NODE`。
2. **GitHub Releases 在本机网络不可达**，Electron 与 electron-builder 的二进制走
   `.npmrc` 里配置的 npmmirror 镜像。
3. 切换 Electron 版本后需要 `npm run rebuild`（按 Electron ABI 重建 better-sqlite3）。
