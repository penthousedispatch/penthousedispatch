import React from 'react';
import { Navigation, Loader, CheckCircle, AlertTriangle, ClipboardList } from 'lucide-react';

function getSyncMeta(syncStatus) {
  if (!syncStatus) return null;
  if (syncStatus.status === 'failed') {
    return {
      label: 'Sync Failed',
      color: '#ff4757',
      background: 'rgba(255,71,87,0.1)',
      border: 'rgba(255,71,87,0.22)',
      icon: <AlertTriangle className="w-2.5 h-2.5" />,
    };
  }

  return {
    label: 'Sync OK',
    color: '#00e5a0',
    background: 'rgba(0,229,160,0.1)',
    border: 'rgba(0,229,160,0.22)',
    icon: <CheckCircle className="w-2.5 h-2.5" />,
  };
}

export default function TripCard({
  trip,
  selected,
  onClick,
  onAssign,
  assigning,
  assigned,
  isTestTrip = false,
  testingNote = '',
  syncStatus = null,
}) {
  const price = parseFloat(trip.delivery_price) || 0;
  const miles = parseFloat(trip.mileage) || 0;
  const ratePerMile = miles > 0 ? (price / miles).toFixed(2) : '—';
  const syncMeta = getSyncMeta(syncStatus);
  const assignCode = String(
    trip.assignment_type_code ||
      trip.raw_payload?.assignment_type_code ||
      trip.raw_payload?.assignment_type ||
      ''
  ).trim();
  const isCancelled = String(trip.status || '').toLowerCase() === 'cancelled';

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-3 cursor-pointer transition-all"
      style={{
        background: selected ? 'rgba(201,168,76,0.07)' : '#0d1117',
        border: `1px solid ${selected ? 'rgba(201,168,76,0.3)' : assigned ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
            {(trip.sentry_trip_id || '').slice(-8)}
          </span>
          {isTestTrip && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', fontSize: 10 }}
            >
              <ClipboardList className="w-2.5 h-2.5" /> Test Mode
            </span>
          )}
          {assigned && (
            <span className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(0,229,160,0.1)', color: '#00e5a0', fontSize: 10 }}>
              <CheckCircle className="w-2.5 h-2.5" /> Assigned
            </span>
          )}
          {isCancelled && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,71,87,0.12)', color: '#ff8a95', fontSize: 10 }}>
              Cancelled
            </span>
          )}
          {assignCode && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-mono" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontSize: 10 }} title="Sentry assignment_type_code">
              {assignCode}
            </span>
          )}
          {syncMeta && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1"
              style={{
                background: syncMeta.background,
                color: syncMeta.color,
                border: `1px solid ${syncMeta.border}`,
                fontSize: 10,
              }}
            >
              {syncMeta.icon}
              {syncMeta.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${price.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'rgba(0,229,160,0.15)' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00e5a0' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs leading-tight truncate" style={{ color: '#e5e7eb' }}>{trip.pu_address || 'Unknown pickup'}</p>
            {trip.pu_time && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{trip.pu_time}</p>}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{ background: 'rgba(255,71,87,0.15)' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff4757' }} />
          </div>
          <p className="text-xs leading-tight truncate flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{trip.do_address || 'Unknown dropoff'}</p>
        </div>
      </div>

      {testingNote && (
        <div
          className="mt-2 rounded-lg px-2.5 py-2"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 700 }}>
            Testing Note
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.72)' }}>
            {testingNote}
          </p>
        </div>
      )}

      {syncStatus?.syncType && (
        <p className="mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
          Last sync: {syncStatus.syncType.replaceAll('_', ' ')}
        </p>
      )}

      <div className="flex items-center justify-between mt-2.5 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {miles > 0 && <span className="flex items-center gap-0.5"><Navigation className="w-3 h-3" />{miles.toFixed(1)}mi</span>}
          {miles > 0 && <span>${ratePerMile}/mi</span>}
          {trip.passengers && trip.passengers !== '1' && <span>👥 {trip.passengers}</span>}
        </div>

        {onAssign && !assigned && (
          <button
            onClick={e => { e.stopPropagation(); onAssign(); }}
            disabled={assigning}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-600 transition-all"
            style={{
              background: 'rgba(0,229,160,0.12)',
              border: '1px solid rgba(0,229,160,0.25)',
              color: '#00e5a0',
              fontWeight: 600,
            }}
          >
            {assigning ? <Loader className="w-3 h-3 animate-spin" /> : '✓ Assign'}
          </button>
        )}
      </div>
    </div>
  );
}
