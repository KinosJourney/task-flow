import { useEffect, useRef, type ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** 用作 aria-label，通常是当前对象的标题 */
  label: string;
  children: ReactNode;
}

/**
 * 漫画风右侧抽屉：从右边翻进来的一页分镜。
 * Esc 关闭、点遮罩关闭、关闭后把焦点还给触发它的元素。
 */
export function Drawer({ open, onClose, label, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-ink/35"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="animate-slide-in relative flex h-full w-full max-w-[520px] flex-col border-l-[4px] border-line bg-paper outline-none"
      >
        {children}
      </div>
    </div>
  );
}
