import { useState } from 'react';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { Button } from '@/components/comic/Button';
import { api, unwrap } from '@/lib/api';
import type { ImportPreviewItem } from '@shared/types';

const SAMPLE = `# ToGoal
- [x] 项目进度按叶子任务计算
- [ ] 时间轴区分计划与实际
  - [ ] 计划用虚线
  - [ ] 实际用实心
2026-07-25
1. 慢跑 3 公里
随手记：气泡文案要口语一点`;

const KIND_LABEL: Record<ImportPreviewItem['parsedKind'], string> = {
  task: '任务',
  note: '备注',
  date_header: '日期',
  project_header: '项目',
};

const KIND_COLOR: Record<ImportPreviewItem['parsedKind'], string> = {
  task: 'bg-accent',
  note: 'bg-[#8a94a6]',
  date_header: 'bg-[#5b8def]',
  project_header: 'bg-[#a66cff]',
};

export function ImportPage() {
  const [raw, setRaw] = useState(SAMPLE);
  const [items, setItems] = useState<ImportPreviewItem[] | null>(null);

  async function parse() {
    const res = unwrap(await api.import.parse({ rawText: raw }));
    setItems(res.items);
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">智能导入</h1>
        <p className="text-sm text-ink-soft">
          粘贴 Markdown、清单或缩进任务，解析成结构化预览后确认导入。原文会永久保留。
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel>
          <PanelHeader title="① 粘贴原文" icon="📋" />
          <div className="p-3">
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={14}
              className="w-full resize-none rounded-lg border-[2.5px] border-line bg-white p-3 font-mono text-sm outline-none focus:bg-panel-alt"
            />
            <div className="mt-2 flex justify-end">
              <Button variant="accent" icon="✨" onClick={parse}>
                解析
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="② 结构化预览"
            icon="🔍"
            action={items && <span className="text-xs text-ink-soft">{items.length} 条</span>}
          />
          <div className="flex flex-col gap-1.5 p-3">
            {!items ? (
              <p className="p-2 text-sm text-ink-soft">点击「解析」，看看会变成什么。</p>
            ) : (
              items.map((it) => (
                <div
                  key={it.lineNo}
                  className="flex items-center gap-2 rounded-lg border-[2.5px] border-line bg-white px-3 py-2"
                  style={{ marginLeft: (it.depth ? it.depth - 1 : 0) * 18 }}
                >
                  <span className={`tag ${KIND_COLOR[it.parsedKind]}`}>{KIND_LABEL[it.parsedKind]}</span>
                  {it.isDone && <span className="tag bg-pop text-ink">已完成</span>}
                  <span className="flex-1 text-sm">{it.content}</span>
                </div>
              ))
            )}
          </div>
          {items && (
            <div className="flex justify-end border-t-[3px] border-line p-3">
              <Button variant="pop" icon="✓">
                确认导入
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
