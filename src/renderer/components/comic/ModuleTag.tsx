import { moduleOf } from '@/lib/format';
import type { ModuleId } from '@shared/types';

export function ModuleTag({ id }: { id: ModuleId }) {
  const m = moduleOf(id);
  return (
    <span className="tag" style={{ backgroundColor: m.color }}>
      {m.name}
    </span>
  );
}

export function ModuleDot({ id, size = 12 }: { id: ModuleId; size?: number }) {
  const m = moduleOf(id);
  return (
    <span
      className="inline-block rounded-full border-2 border-line"
      style={{ backgroundColor: m.color, width: size, height: size }}
    />
  );
}
