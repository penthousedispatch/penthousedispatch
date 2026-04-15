import React, { useState } from 'react';
import { X, Zap, CheckCircle, Loader } from 'lucide-react';

export default function Take5Modal({ driver, trips, onClose, onAssign }) {
  const [confirmed, setConfirmed] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [assigning, setAssigning] = useState(false);
  const [done, setDone] = useState([]);

  const top5 = trips.slice(0, 5);

  async function handleConfirm() {
    setConfirmed(true);
    for (let i = 0; i < top5.length; i++) {
      setCurrentIdx(i);
      setAssigning(true);
      await onAssign(top5[i]);
      setDone(prev => [...prev, top5[i].id]);
      setAssigning(false);
      if (i < top5.length - 1) await new Promise(r => setTimeout(r, 3000));
    }
    setTimeout(onClose, 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden animate-slide-up" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.3)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.15)' }}>
              <Zap className="w-4 h-4" style={{ color: '#c9a84c' }} />
            </div>
            <div>
              <p className="font-700 text-sm" style={{ fontWeight: 700, color: '#e5e7eb' }}>Take 5 — AI Selection</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Best 5 trips for {driver.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {top5.map((trip, i) => {
            const isDone = done.includes(trip.id);
            const isCurrent = confirmed && i === currentIdx && !isDone;
            return (
              <div
                key={trip.id}
                className="flex items-center gap-3 p-3 rounded-xl transition-all"
                style={{
                  background: isDone ? 'rgba(0,229,160,0.08)' : isCurrent ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isDone ? 'rgba(0,229,160,0.2)' : isCurrent ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0"
                  style={{
                    background: isDone ? 'rgba(0,229,160,0.15)' : 'rgba(201,168,76,0.15)',
                    color: isDone ? '#00e5a0' : '#c9a84c',
                    fontWeight: 700,
                  }}
                >
                  {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : (isCurrent && assigning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : i + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb' }}>{trip.pu_address}</p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{trip.do_address}</p>
                </div>
                <span className="text-sm font-700 flex-shrink-0" style={{ color: '#c9a84c', fontWeight: 700 }}>
                  ${parseFloat(trip.delivery_price || 0).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {!confirmed && (
          <div className="px-4 pb-4">
            <button
              onClick={handleConfirm}
              className="btn-gold w-full py-3 flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Assign All 5 Trips to {driver.full_name}
            </button>
          </div>
        )}

        {confirmed && done.length === top5.length && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl" style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)' }}>
              <CheckCircle className="w-5 h-5" style={{ color: '#00e5a0' }} />
              <span className="font-600 text-sm" style={{ color: '#00e5a0', fontWeight: 600 }}>All 5 trips assigned!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
