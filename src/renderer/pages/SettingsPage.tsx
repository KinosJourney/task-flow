import { useState } from 'react';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { Button } from '@/components/comic/Button';
import { ModuleTag } from '@/components/comic/ModuleTag';
import { useEnvCheck, useModules } from '@/features/queries';
import { api, unwrap } from '@/lib/api';

export function SettingsPage() {
  const { data: modules } = useModules();
  const envCheck = useEnvCheck();
  const [msg, setMsg] = useState('');

  async function exportJson() {
    const res = unwrap(await api.backup.exportJson());
    setMsg(`已导出到 ${res.filePath}`);
    setTimeout(() => setMsg(''), 2500);
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">设置</h1>
      </header>

      <Panel>
        <PanelHeader title="数据备份与恢复" icon="💾" />
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-ink-soft">
            第一版数据保存在本机。建议定期导出，避免浏览器数据丢失。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" icon="📤" onClick={exportJson}>
              导出为 JSON
            </Button>
            <Button icon="📥">从 JSON 恢复</Button>
            <Button icon="🗄️">复制数据库文件</Button>
          </div>
          {msg && <p className="text-sm font-bold text-accent">{msg}</p>}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="生活模块" icon="🎨" />
        <div className="flex flex-wrap gap-2 p-4">
          {modules?.map((m) => (
            <ModuleTag key={m.id} id={m.id} />
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="运行环境自检" icon="🧪" />
        <div className="flex flex-col gap-2 p-4 text-sm">
          {envCheck.isPending && <p className="text-ink-soft">正在检查…</p>}
          {envCheck.data && (
            <>
              <p>
                IPC 桥：<span className="font-bold text-accent">通</span>（回声「
                {envCheck.data.ping.echo}」，Electron {envCheck.data.ping.versions.electron}）
              </p>
              {envCheck.data.db.ok ? (
                <>
                  <p>
                    SQLite：<span className="font-bold text-accent">读写正常</span>（
                    journal={envCheck.data.db.data.journalMode}，外键
                    {envCheck.data.db.data.foreignKeys ? '开' : '关'}，第{' '}
                    {envCheck.data.db.data.writeCount} 次自检）
                  </p>
                  <p className="break-all text-ink-soft">
                    数据库文件：{envCheck.data.db.data.dbPath}
                  </p>
                </>
              ) : (
                <p className="font-bold text-red-600">
                  SQLite：{envCheck.data.db.error.message}
                </p>
              )}
            </>
          )}
          {envCheck.isError && (
            <p className="text-ink-soft">
              未连接到本机后端（当前在浏览器中预览，数据来自 mock）。
            </p>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="关于" icon="ℹ️" />
        <div className="p-4 text-sm text-ink-soft">
          TaskFlow · 桌面端个人任务执行应用 · M0 骨架：数据库已接通，业务数据仍来自 mock。
        </div>
      </Panel>
    </div>
  );
}
