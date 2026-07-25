import { useEffect, useMemo, useState } from 'react';

/** 轮换的励志短句：可爱、只鼓励不催促（ui-spec 第 5 节：气泡被动展示，不打断） */
const ENCOURAGEMENTS = [
  '一次只做一件事，你已经比昨天靠前一点点了。',
  '慢慢来比较快，小电在旁边陪着你。',
  '先做五分钟，剩下的交给惯性。',
  '不是没动力，只是需要一个很小的开始。',
  '今天的你，正在帮明天的你省事。',
  '做完一件划掉一件，这种爽感谁懂啊！',
  '状态不好也没关系，做一点点就算赢。',
  '专注的样子超帅的，真的。',
  '目标很大，但手上这一步很小，走吧。',
  '休息也是任务的一部分，记得喝水。',
  '进度条动一格，就值得开心一下。',
  '不用完美，先让它存在。',
  '小电给你充满电啦，冲！',
  '你能坚持到这里，不是靠运气。',
  '把它再拆小一点，就不吓人了。',
];

function shuffle(list: readonly string[]): string[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 气泡文案轮换：先显示 lead（如推荐理由），之后每 intervalMs 换一条励志短句。
 * lead 变化时重新从它开始，保证换任务后的新理由一定被看到。
 */
export function useAssistantMessage(lead?: string | null, intervalMs = 9000, enabled = true): string {
  const queue = useMemo(() => shuffle(ENCOURAGEMENTS), []);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
    if (!enabled) return;
    const id = setInterval(() => setStep((s) => s + 1), intervalMs);
    return () => clearInterval(id);
  }, [lead, intervalMs, enabled]);

  if (lead && step === 0) return lead;
  const index = lead ? step - 1 : step;
  return queue[index % queue.length];
}
