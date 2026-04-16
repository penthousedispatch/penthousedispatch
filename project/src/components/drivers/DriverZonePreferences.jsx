import React, { useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { SERVICE_ZONES, normalizePreferredZones } from '../../lib/serviceZones';

export default function DriverZonePreferences({
  initialZones = [],
  onClose,
  onSave,
  saving = false,
  savedMessage = '',
}) {
  const [selected, setSelected] = useState(() => normalizePreferredZones(initialZones));

  const summary = useMemo(() => {
    if (selected.length === 0) {
      return 'No preferences set. The scheduler will treat all service zones equally.';
    }
    return `You prefer ${selected.length} zone${selected.length === 1 ? '' : 's'}: ${selected.map(zone => SERVICE_ZONES.find(item => item.key === zone)?.label || zone).join(', ')}.`;
  }, [selected]);

  function toggleZone(zoneKey) {
    setSelected(prev => (
      prev.includes(zoneKey)
        ? prev.filter(item => item !== zoneKey)
        : [...prev, zoneKey]
    ));
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Preferred Work Zones</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Tell dispatch where you prefer to work so route suggestions fit your coverage area better.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <X className="w-4 h-4" style={{ color: '#e5e7eb' }} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)' }}>
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <p className="text-xs font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Routing preference</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.68)' }}>{summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {SERVICE_ZONES.map(zone => {
              const active = selected.includes(zone.key);
              return (
                <button
                  key={zone.key}
                  type="button"
                  onClick={() => toggleZone(zone.key)}
                  className="rounded-2xl px-4 py-3 text-left transition-all"
                  style={{
                    background: active ? `${zone.color}18` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? `${zone.color}55` : 'rgba(255,255,255,0.08)'}`,
                    color: active ? zone.color : '#e5e7eb',
                  }}
                >
                  <p className="text-sm font-700" style={{ fontWeight: 700 }}>{zone.label}</p>
                  <p className="text-xs mt-1" style={{ color: active ? zone.color : 'rgba(255,255,255,0.42)' }}>
                    {active ? 'Preferred' : 'Tap to prefer this zone'}
                  </p>
                </button>
              );
            })}
          </div>

          {savedMessage && (
            <p className="text-xs" style={{ color: '#00e5a0' }}>{savedMessage}</p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)', color: '#e5e7eb' }}>
            Cancel
          </button>
          <button type="button" onClick={() => onSave(normalizePreferredZones(selected))} disabled={saving} className="flex-1 py-3 rounded-2xl btn-gold">
            {saving ? 'Saving...' : 'Save Zones'}
          </button>
        </div>
      </div>
    </div>
  );
}
