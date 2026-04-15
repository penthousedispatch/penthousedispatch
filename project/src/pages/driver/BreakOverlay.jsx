import React, { useState, useEffect, useRef } from 'react';
import { Coffee } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { logFailure } from '../../utils/errorHandler';

const BREAK_SECS = 15 * 60;

export default function BreakOverlay({ onEnd, driverId }) {
  const [remaining, setRemaining] = useState(BREAK_SECS);
  const timerRef = useRef(null);

  useEffect(() => {
    if (driverId) {
      supabase.from('drivers').update({ status: 'break' }).eq('id', driverId).then(({ error }) => {
        if (error) logFailure('BreakOverlay:setBreak', error);
      });
    }

    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function handleEnd() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (driverId) {
      const { error } = await supabase.from('drivers').update({ status: 'online' }).eq('id', driverId);
      if (error) logFailure('BreakOverlay:endBreak', error);
    }
    onEnd();
  }

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const progress = (BREAK_SECS - remaining) / BREAK_SECS;
  const circumference = 2 * Math.PI * 54;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'rgba(7,9,13,0.97)', backdropFilter: 'blur(8px)' }}>
      <div className="flex flex-col items-center gap-8 px-6 text-center">

        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <Coffee className="w-8 h-8" style={{ color: '#f59e0b' }} />
        </div>

        <div>
          <p className="text-2xl font-800 mb-1" style={{ fontWeight: 800 }}>On Break</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>You are temporarily offline. No trips will be assigned during your break.</p>
        </div>

        <div className="relative w-44 h-44">
          <svg className="w-full h-full" style={{ transform: 'rotate(-90deg)' }} viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle
              cx="60" cy="60" r="54"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <p className="text-4xl font-800" style={{ color: '#f59e0b', fontWeight: 800, fontFamily: 'JetBrains Mono,monospace' }}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>remaining</p>
          </div>
        </div>

        <div className="w-full max-w-xs rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>Break started</span>
            <span>15:00</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #d97706)', transition: 'width 1s linear' }}
            />
          </div>
          <div className="flex items-center justify-between text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <span>Status: <span style={{ color: '#f59e0b' }}>Offline</span></span>
            <span>{Math.round(progress * 100)}% used</span>
          </div>
        </div>

        <button
          onClick={handleEnd}
          className="w-full max-w-xs py-4 rounded-2xl text-base font-700"
          style={{ background: 'linear-gradient(135deg, #c9a84c, #b8983e)', color: '#07090d', fontWeight: 700 }}
        >
          End Break Early
        </button>

        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Break auto-ends in {mins}:{String(secs).padStart(2, '0')} and sets you back online
        </p>
      </div>
    </div>
  );
}
