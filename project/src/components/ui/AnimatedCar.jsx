import React from 'react';

export default function AnimatedCar({ size = 48, color = '#c9a84c', className = '', style = {} }) {
  const id = React.useId().replace(/:/g, '');

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <style>{`
        @keyframes carBounce-${id} {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes wheelSpin-${id} {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes roadScroll-${id} {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes exhaust-${id} {
          0% { opacity: 0.7; transform: translateX(0) scale(1); }
          100% { opacity: 0; transform: translateX(-12px) scale(1.8); }
        }
        .car-body-${id} {
          animation: carBounce-${id} 0.9s ease-in-out infinite;
        }
        .wheel-${id} {
          animation: wheelSpin-${id} 0.6s linear infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        .road-${id} {
          animation: roadScroll-${id} 0.7s linear infinite;
        }
        .exhaust-${id} {
          animation: exhaust-${id} 0.8s ease-out infinite;
        }
      `}</style>

      <svg
        viewBox="0 0 80 56"
        width={size * 1.6}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={`roadClip-${id}`}>
            <rect x="0" y="44" width="80" height="12" />
          </clipPath>
        </defs>

        <g clipPath={`url(#roadClip-${id})`}>
          <g className={`road-${id}`} style={{ willChange: 'transform' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={i}
                x={i * 20}
                y="49"
                width="10"
                height="2"
                rx="1"
                fill={`${color}40`}
              />
            ))}
            {Array.from({ length: 8 }).map((_, i) => (
              <rect
                key={`r2-${i}`}
                x={i * 20 + 160}
                y="49"
                width="10"
                height="2"
                rx="1"
                fill={`${color}40`}
              />
            ))}
          </g>
        </g>

        <rect x="0" y="44" width="80" height="1" fill={`${color}20`} />

        <g className={`car-body-${id}`} style={{ willChange: 'transform' }}>
          <g className={`exhaust-${id}`} style={{ willChange: 'transform, opacity' }}>
            <circle cx="14" cy="37" r="2" fill={`${color}50`} />
            <circle cx="10" cy="36" r="1.5" fill={`${color}30`} />
          </g>

          <rect x="16" y="33" width="44" height="11" rx="3" fill={color} opacity="0.95" />

          <path d="M24 33 L28 22 L52 22 L56 33 Z" fill={color} opacity="0.9" />

          <rect x="29" y="24" width="10" height="7" rx="1.5" fill="#0d1117" opacity="0.6" />
          <rect x="41" y="24" width="10" height="7" rx="1.5" fill="#0d1117" opacity="0.6" />

          <rect x="56" y="33" width="5" height="4" rx="1" fill={color} opacity="0.8" />
          <rect x="57" y="34" width="3" height="2" rx="0.5" fill="#ff6b35" opacity="0.9" />

          <rect x="17" y="34" width="6" height="3" rx="1" fill="#38bdf8" opacity="0.8" />

          <text
            x="40"
            y="40"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="Arial, sans-serif"
            fontWeight="900"
            fontSize="7"
            fill="#0d1117"
            opacity="0.9"
          >
            P
          </text>

          <g className={`wheel-${id}`}>
            <circle cx="27" cy="44" r="5" fill="#1a2332" stroke={color} strokeWidth="2" />
            <circle cx="27" cy="44" r="2" fill={color} opacity="0.5" />
            <line x1="27" y1="39" x2="27" y2="49" stroke={color} strokeWidth="1" opacity="0.4" />
            <line x1="22" y1="44" x2="32" y2="44" stroke={color} strokeWidth="1" opacity="0.4" />
          </g>

          <g className={`wheel-${id}`}>
            <circle cx="53" cy="44" r="5" fill="#1a2332" stroke={color} strokeWidth="2" />
            <circle cx="53" cy="44" r="2" fill={color} opacity="0.5" />
            <line x1="53" y1="39" x2="53" y2="49" stroke={color} strokeWidth="1" opacity="0.4" />
            <line x1="48" y1="44" x2="58" y2="44" stroke={color} strokeWidth="1" opacity="0.4" />
          </g>
        </g>
      </svg>
    </div>
  );
}
