import React, { useState, useEffect } from 'react';
import { X, Trophy, Zap, Target, ChevronRight } from 'lucide-react';

export default function IncentiveGoalToast({ goals = [], onDismiss, onOpen }) {
  const [visible, setVisible] = useState(false);
  const [animOut, setAnimOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setAnimOut(true);
    setTimeout(() => onDismiss?.(), 400);
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 9000);
    return () => clearTimeout(t);
  }, []);

  if (!goals.length) return null;

  const topGoal = goals[0];
  const pct = topGoal.goal > 0 ? Math.min(1, topGoal.current / topGoal.goal) : 0;
  const isNearComplete = pct >= 0.8;
  const accentColor = isNearComplete ? '#00e5a0' : '#c9a84c';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 120,
        left: 16,
        right: 16,
        zIndex: 60,
        opacity: visible && !animOut ? 1 : 0,
        transform: visible && !animOut ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(13,17,23,0.98)',
          border: `1px solid ${accentColor}40`,
          borderRadius: 20,
          padding: '16px 16px 14px',
          boxShadow: `0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px ${accentColor}18`,
          backdropFilter: 'blur(20px)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: `${accentColor}14`,
              border: `1px solid ${accentColor}30`,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `conic-gradient(${accentColor} ${pct * 360}deg, transparent 0deg)`,
                opacity: 0.12,
              }}
            />
            {isNearComplete ? (
              <Trophy style={{ width: 20, height: 20, color: accentColor, position: 'relative' }} />
            ) : (
              <Target style={{ width: 20, height: 20, color: accentColor, position: 'relative' }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Zap style={{ width: 12, height: 12, color: accentColor }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                {isNearComplete ? 'Almost There!' : 'Incentive Progress'}
              </span>
            </div>

            <p style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', marginBottom: 4, lineHeight: 1.3 }}>
              {isNearComplete
                ? `${Math.round((1 - pct) * topGoal.goal * 10) / 10} ${topGoal.unit} to go — push for $${topGoal.bonus}!`
                : `${topGoal.name}: ${topGoal.current} / ${topGoal.goal} ${topGoal.unit}`
              }
            </p>

            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', marginBottom: 6, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${accentColor}, ${isNearComplete ? '#c9a84c' : '#00c9a7'})`,
                  width: `${pct * 100}%`,
                  transition: 'width 0.6s ease',
                  boxShadow: `0 0 8px ${accentColor}60`,
                }}
              />
            </div>

            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Bonus: <span style={{ color: '#c9a84c', fontWeight: 700 }}>${topGoal.bonus}</span>
              {goals.length > 1 && <span style={{ marginLeft: 8 }}>+{goals.length - 1} more goal{goals.length > 2 ? 's' : ''}</span>}
            </p>
          </div>

          <button
            onClick={dismiss}
            style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {goals.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {goals.slice(1, 4).map((g, i) => {
              const p = g.goal > 0 ? Math.min(1, g.current / g.goal) : 0;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</p>
                  <div style={{ height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: '#c9a84c', width: `${p * 100}%` }} />
                  </div>
                  <p style={{ fontSize: 10, color: '#c9a84c', marginTop: 3, fontWeight: 700 }}>{Math.round(p * 100)}%</p>
                </div>
              );
            })}
          </div>
        )}

        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 14,
              border: `1px solid ${accentColor}2f`,
              background: `${accentColor}14`,
              color: accentColor,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            Open My Incentives
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
    </div>
  );
}
