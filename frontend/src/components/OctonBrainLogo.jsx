/**
 * OCTON Neocortex brain logo
 * 15-node glowing synaptic constellation with pulse animations and signal-traveller
 */
export const OctonBrainLogo = ({ size = 36 }) => {
  const dots = [
    { x: 20, y: 12, r: 1.1, c: "#00E5FF", d: 2.0 },
    { x: 14, y: 14, r: 1.4, c: "#00E5FF", d: 2.4 },
    { x: 26, y: 14, r: 1.4, c: "#00E5FF", d: 1.8 },
    { x: 10, y: 18, r: 0.9, c: "#7CF9FF", d: 3.1 },
    { x: 30, y: 18, r: 0.9, c: "#7CF9FF", d: 2.7 },
    { x: 17, y: 18, r: 1.0, c: "#00FF88", d: 1.6 },
    { x: 23, y: 18, r: 1.0, c: "#00FF88", d: 2.2 },
    { x: 13, y: 22, r: 1.2, c: "#00E5FF", d: 1.9 },
    { x: 27, y: 22, r: 1.2, c: "#00E5FF", d: 2.3 },
    { x: 20, y: 22, r: 1.6, c: "#00FF88", d: 1.4 },
    { x: 16, y: 26, r: 0.9, c: "#7CF9FF", d: 3.0 },
    { x: 24, y: 26, r: 0.9, c: "#7CF9FF", d: 2.6 },
    { x: 20, y: 29, r: 1.0, c: "#00E5FF", d: 1.7 },
    { x: 11, y: 25, r: 0.7, c: "#00FF88", d: 3.5 },
    { x: 29, y: 25, r: 0.7, c: "#00FF88", d: 3.2 },
  ];
  const edges = [
    [0, 1], [0, 2], [1, 3], [2, 4], [1, 5], [2, 6], [5, 6],
    [5, 7], [6, 8], [7, 9], [8, 9], [9, 10], [9, 11], [10, 12], [11, 12],
    [7, 13], [8, 14], [3, 7], [4, 8],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="OCTON Neocortex">
      <defs>
        <radialGradient id="brainGlow" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.18" />
          <stop offset="60%" stopColor="#00E5FF" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
        </radialGradient>
        <filter id="brainBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
      </defs>
      <circle cx="20" cy="20" r="17" fill="url(#brainGlow)" />
      <path
        d="M20 5 C13 5 8 9 7 15 C5 17 5 22 8 24 C8 28 11 32 16 33 C18 35 22 35 24 33 C29 32 32 28 32 24 C35 22 35 17 33 15 C32 9 27 5 20 5 Z"
        stroke="#00E5FF" strokeWidth="0.9" fill="#020A0D" opacity="0.95"
      />
      <path d="M20 6 Q19.5 18 20 34" stroke="#00E5FF" strokeWidth="0.4" opacity="0.35" />
      <path d="M10 14 Q13 12 15 15" stroke="#00E5FF" strokeWidth="0.45" opacity="0.4" />
      <path d="M9 20 Q12 18 15 21" stroke="#00E5FF" strokeWidth="0.45" opacity="0.4" />
      <path d="M10 26 Q13 24 16 27" stroke="#00E5FF" strokeWidth="0.45" opacity="0.4" />
      <path d="M30 14 Q27 12 25 15" stroke="#00E5FF" strokeWidth="0.45" opacity="0.4" />
      <path d="M31 20 Q28 18 25 21" stroke="#00E5FF" strokeWidth="0.45" opacity="0.4" />
      <path d="M30 26 Q27 24 24 27" stroke="#00E5FF" strokeWidth="0.45" opacity="0.4" />
      <g stroke="#00E5FF" strokeWidth="0.35" opacity="0.45">
        {edges.map(([a, b], i) => (
          <line key={i} x1={dots[a].x} y1={dots[a].y} x2={dots[b].x} y2={dots[b].y} />
        ))}
      </g>
      <g filter="url(#brainBlur)">
        {dots.map((d, i) => (
          <circle key={`h${i}`} cx={d.x} cy={d.y} r={d.r * 1.8} fill={d.c} opacity="0.3" />
        ))}
      </g>
      {dots.map((d, i) => (
        <circle key={`n${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.c}>
          <animate attributeName="opacity" values="0.35;1;0.35" dur={`${d.d}s`} repeatCount="indefinite" begin={`${(i % 5) * 0.2}s`} />
          <animate attributeName="r" values={`${d.r * 0.8};${d.r * 1.3};${d.r * 0.8}`} dur={`${d.d}s`} repeatCount="indefinite" begin={`${(i % 5) * 0.2}s`} />
        </circle>
      ))}
      <circle r="0.8" fill="#FFFFFF" opacity="0.9">
        <animateMotion dur="4s" repeatCount="indefinite" path="M14,14 L20,18 L26,14" />
      </circle>
    </svg>
  );
};
