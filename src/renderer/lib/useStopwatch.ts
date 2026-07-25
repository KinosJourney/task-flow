import { useCallback, useEffect, useRef, useState } from 'react';

/** 正计时：running 为 true 时按秒累加，暂停后保留已计时长，reset 归零。 */
export function useStopwatch(running: boolean) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    // 以起始时刻反推，避免 interval 抖动累积成偏差
    const startedAt = Date.now() - elapsedRef.current;
    const tick = () => {
      elapsedRef.current = Date.now() - startedAt;
      setElapsedMs(elapsedRef.current);
    };
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      tick();
    };
  }, [running]);

  const reset = useCallback(() => {
    elapsedRef.current = 0;
    setElapsedMs(0);
  }, []);

  return { elapsedMs, reset };
}
