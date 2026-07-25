interface MascotProps {
  size?: number;
  mood?: 'happy' | 'cheer' | 'think';
}

/**
 * 原创助手角色「小电」——一个漫画风的灯泡机器人小家伙。
 * 纯 SVG，不引用任何现有作品素材。
 */
export function Mascot({ size = 72, mood = 'happy' }: MascotProps) {
  const eyeY = mood === 'think' ? 30 : 31;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-label="小电">
      {/* 头顶天线 */}
      <line x1="40" y1="6" x2="40" y2="16" stroke="#241f1a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="6" r="4" fill="#ffd43b" stroke="#241f1a" strokeWidth="3" />
      {/* 身体（灯泡形） */}
      <path
        d="M40 14 C22 14 14 27 14 40 C14 52 22 60 26 64 L54 64 C58 60 66 52 66 40 C66 27 58 14 40 14 Z"
        fill="#fffdf7"
        stroke="#241f1a"
        strokeWidth="3.5"
      />
      {/* 灯座 */}
      <rect x="28" y="64" width="24" height="8" rx="2" fill="#8a94a6" stroke="#241f1a" strokeWidth="3" />
      {/* 腮红 */}
      <circle cx="25" cy="44" r="4" fill="#ffd9cf" />
      <circle cx="55" cy="44" r="4" fill="#ffd9cf" />
      {/* 眼睛 */}
      <circle cx="31" cy={eyeY} r="4" fill="#241f1a" />
      <circle cx="49" cy={eyeY} r="4" fill="#241f1a" />
      <circle cx="32.5" cy={eyeY - 1.5} r="1.3" fill="#fff" />
      <circle cx="50.5" cy={eyeY - 1.5} r="1.3" fill="#fff" />
      {/* 嘴 */}
      {mood === 'cheer' ? (
        <path d="M34 40 Q40 48 46 40" stroke="#241f1a" strokeWidth="3" fill="#ff5d3b" strokeLinecap="round" />
      ) : mood === 'think' ? (
        <line x1="35" y1="42" x2="45" y2="42" stroke="#241f1a" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M35 41 Q40 45 45 41" stroke="#241f1a" strokeWidth="3" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
