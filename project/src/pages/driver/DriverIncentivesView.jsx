import React from 'react';
import { X, Trophy, Target, Zap, CheckCircle2 } from 'lucide-react';

function formatCurrent(goal) {
  const current = Number(goal?.current || 0);
  const unit = String(goal?.unit || '').trim();
  if (unit === '$') return `$${current.toFixed(2)}`;
  if (unit === 'hrs') return `${current.toFixed(1)} hrs`;
  return `${current} ${unit || 'trips'}`;
}

function formatGoal(goal) {
  const target = Number(goal?.goal || 0);
  const unit = String(goal?.unit || '').trim();
  if (unit === '$') return `$${target.toFixed(2)}`;
  if (unit === 'hrs') return `${target.toFixed(1)} hrs`;
  return `${target} ${unit || 'trips'}`;
}

function progressPercent(goal) {
  const target = Number(goal?.goal || 0);
  const current = Number(goal?.current || 0);
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

export default function DriverIncentivesView({ goals = [], onClose }) {
  const rankedGoals = [...(goals || [])]
    .filter(Boolean)
    .sort((a, b) => progressPercent(b) - progressPercent(a));

  return (
    <div
      className="fixed inset-0 z-[210] flex flex-col"
      style={{ background: '#07090d', paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingTop: 'calc(var(--safe-top) + 12px)' }}
      >
        <div>
          <p className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>My Incentives</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.42)' }}>
            Your active bonus goals and progress
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.68)' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div
          className="rounded-3xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(201,168,76,0.18), rgba(0,229,160,0.08))',
            border: '1px solid rgba(201,168,76,0.22)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(201,168,76,0.16)', border: '1px solid rgba(201,168,76,0.25)' }}
            >
              <Trophy className="w-6 h-6" style={{ color: '#c9a84c' }} />
            </div>
            <div>
              <p className="text-sm font-700 mb-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                Bonus goals stay here now
              </p>
              <p className="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.56)' }}>
                This screen is separate from maps and trip navigation, so checking incentives will not kick you into routing.
              </p>
            </div>
          </div>
        </div>

        {rankedGoals.length === 0 ? (
          <div
            className="rounded-3xl p-5 text-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Target className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.28)' }} />
            <p className="text-sm font-700 mb-1" style={{ color: '#e5e7eb', fontWeight: 700 }}>
              No active incentives right now
            </p>
            <p className="text-xs leading-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              When dispatch adds a bonus program, your trip, earnings, or hours goals will show here automatically.
            </p>
          </div>
        ) : (
          rankedGoals.map((goal, index) => {
            const pct = progressPercent(goal);
            const completed = pct >= 100;
            const accent = completed ? '#00e5a0' : pct >= 80 ? '#c9a84c' : '#0ea5e9';
            return (
              <div
                key={goal.id || `${goal.name}-${index}`}
                className="rounded-3xl p-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${accent}24` }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {completed ? (
                        <CheckCircle2 className="w-4 h-4" style={{ color: accent }} />
                      ) : (
                        <Zap className="w-4 h-4" style={{ color: accent }} />
                      )}
                      <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
                        {goal.name || 'Incentive Goal'}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.46)' }}>
                      {formatCurrent(goal)} of {formatGoal(goal)}
                    </p>
                  </div>
                  <div
                    className="px-3 py-1.5 rounded-full text-xs font-700"
                    style={{ background: `${accent}18`, border: `1px solid ${accent}24`, color: accent, fontWeight: 700 }}
                  >
                    ${Number(goal?.bonus || 0).toFixed(0)} bonus
                  </div>
                </div>

                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${accent}, ${completed ? '#34d399' : '#60a5fa'})`,
                      boxShadow: `0 0 14px ${accent}44`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.48)' }}>
                    {completed
                      ? (goal.celebration_message || 'Goal reached. Dispatch should see the completed bonus state.')
                      : pct >= 80
                        ? 'You are close. Finish strong on the next rides.'
                        : 'Keep stacking trips, hours, or revenue to move this bar.'}
                  </p>
                  <p className="text-xs font-700" style={{ color: accent, fontWeight: 700 }}>
                    {Math.round(pct)}%
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
