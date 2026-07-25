import { Mascot } from './Mascot';
import { useAssistantMessage } from './useAssistantMessage';

interface AssistantProps {
  /** 固定首条文案（如推荐理由）；之后轮换励志短句 */
  message?: string;
  mood?: 'happy' | 'cheer' | 'think';
  size?: number;
  /** 关闭轮换，只显示 message */
  rotate?: boolean;
  intervalMs?: number;
}

export function Assistant({
  message,
  mood = 'happy',
  size = 64,
  rotate = true,
  intervalMs = 9000,
}: AssistantProps) {
  const text = useAssistantMessage(message, intervalMs, rotate);

  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0">
        <Mascot size={size} mood={mood} />
      </div>
      <div className="bubble text-sm leading-relaxed">
        <span key={text} className="animate-bubble-swap inline-block">
          {text}
        </span>
      </div>
    </div>
  );
}
