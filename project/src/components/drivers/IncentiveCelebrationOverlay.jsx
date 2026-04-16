import React, { useEffect, useMemo, useState } from 'react';
import { PartyPopper, Trophy, Star, Zap } from 'lucide-react';

const STYLE_META = {
  confetti: { icon: PartyPopper, accent: '#c9a84c', burst: ['#c9a84c', '#00e5a0', '#0ea5e9', '#fb7185'] },
  spotlight: { icon: Trophy, accent: '#facc15', burst: ['#facc15', '#fde68a', '#f59e0b'] },
  stars: { icon: Star, accent: '#c084fc', burst: ['#c084fc', '#60a5fa', '#f9a8d4'] },
  turbo: { icon: Zap, accent: '#00e5a0', burst: ['#00e5a0', '#2dd4bf', '#0ea5e9'] },
};

export default function IncentiveCelebrationOverlay({ celebration, onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setVisible(true), 30);
    const hideTimer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDone?.(), 500);
    }, 4300);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [onDone]);

  const meta = STYLE_META[celebration?.style] || STYLE_META.confetti;
  const Icon = meta.icon;
  const particles = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => ({
        id: index,
        left: 8 + ((index * 37) % 84),
        delay: `${(index % 8) * 0.12}s`,
        duration: `${2.2 + (index % 5) * 0.18}s`,
        color: meta.burst[index % meta.burst.length],
        size: 8 + (index % 4) * 4,
      })),
    [meta]
  );

  return (
    <div
      className="fixed inset-0 z-[80] pointer-events-none flex items-center justify-center overflow-hidden"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.35s ease',
        background: 'radial-gradient(circle at center, rgba(13,17,23,0.16), rgba(7,9,13,0.82))',
        backdropFilter: 'blur(6px)',
      }}
    >
      {particles.map(particle => (
        <span
          key={particle.id}
          className="absolute rounded-full"
          style={{
            '--burst-x': (particle.id % 2 === 0 ? -1 : 1) * (28 + (particle.id % 6) * 10),
            left: `${particle.left}%`,
            top: '-8%',
            width: particle.size,
            height: particle.size * 0.55,
            background: particle.color,
            boxShadow: `0 0 12px ${particle.color}`,
            animation: `incentive-burst ${particle.duration} ease-in ${particle.delay} forwards`,
            transform: `rotate(${particle.id * 24}deg)`,
          }}
        />
      ))}

      <div
        className="mx-6 max-w-sm rounded-[28px] px-6 py-7 text-center"
        style={{
          background: 'rgba(13,17,23,0.95)',
          border: `1px solid ${meta.accent}55`,
          boxShadow: `0 18px 80px rgba(0,0,0,0.55), 0 0 36px ${meta.accent}25`,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(18px)',
          transition: 'transform 0.35s ease, opacity 0.35s ease',
        }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px]"
          style={{ background: `${meta.accent}18`, border: `1px solid ${meta.accent}44` }}
        >
          <Icon className="h-8 w-8" style={{ color: meta.accent }} />
        </div>
        <p className="mb-1 text-xs font-700 uppercase tracking-[0.24em]" style={{ color: meta.accent, fontWeight: 700 }}>
          Incentive Unlocked
        </p>
        <p className="mb-2 text-2xl font-700 leading-tight" style={{ color: '#e5e7eb', fontWeight: 700 }}>
          {celebration?.title || 'Great work'}
        </p>
        <p className="text-sm leading-6" style={{ color: 'rgba(255,255,255,0.68)' }}>
          {celebration?.message || 'You just hit a bonus target. Keep stacking high-quality rides.'}
        </p>
        {celebration?.bonus ? (
          <div
            className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-700"
            style={{ background: `${meta.accent}16`, color: meta.accent, border: `1px solid ${meta.accent}30`, fontWeight: 700 }}
          >
            Bonus Earned ${celebration.bonus}
          </div>
        ) : null}
      </div>
    </div>
  );
}
