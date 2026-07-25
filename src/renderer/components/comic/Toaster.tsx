import { dismissToast, useToasts } from '@/lib/toast';

/**
 * 失败提示停在右下角：不挡住页面中央的 Next Task 与大纲，也不用点确定
 * （ui-spec 第 7 节：不打断当前任务执行流）。
 */
export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-72 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          title="点一下关掉"
          className={`animate-pop pointer-events-auto flex items-start gap-2 rounded-xl border-[3px] border-line px-3 py-2 text-left text-sm font-bold shadow-[4px_4px_0_0_var(--color-line)] ${
            toast.tone === 'error' ? 'bg-accent text-white' : 'bg-pop text-ink'
          }`}
        >
          <span aria-hidden>{toast.tone === 'error' ? '💥' : '💡'}</span>
          <span className="flex-1">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}
