import { useState } from 'react';
import { Panel, PanelHeader } from '@/components/comic/Panel';
import { Button } from '@/components/comic/Button';
import { useQuickCapture } from '@/features/queries';

export function QuickCapture() {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const capture = useQuickCapture();

  function submit() {
    if (!text.trim()) return;
    capture.mutate(text.trim(), {
      onSuccess: () => {
        setText('');
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      },
    });
  }

  return (
    <Panel>
      <PanelHeader title="快速记录" icon="💭" />
      <div className="flex flex-col gap-2 p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="随手记个想法、问题或链接…"
          rows={2}
          className="w-full resize-none rounded-lg border-[2.5px] border-line bg-white px-3 py-2 text-sm outline-none focus:bg-panel-alt"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-soft">{saved ? '已记下！' : '⌘/Ctrl + Enter'}</span>
          <Button size="sm" variant="accent" onClick={submit}>
            记下
          </Button>
        </div>
      </div>
    </Panel>
  );
}
