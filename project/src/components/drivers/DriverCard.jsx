import React, { useRef, useState } from 'react';
import { Zap, X, Camera, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const STATUS_LABEL = {
  online: 'Online',
  offline: 'Offline',
  on_trip: 'On Trip',
  break: 'Break',
  unavailable: 'N/A',
};

async function uploadDriverPhoto(file, driverId) {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${driverId}-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('driver-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('driver-photos').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export default function DriverCard({ driver, selected, onClick, onTake5, onRemove, tripCount, onPhotoUpdate }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const initials = driver.full_name
    ? driver.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const gpsAge = driver.last_location_update
    ? Math.floor((Date.now() - new Date(driver.last_location_update).getTime()) / 60000)
    : null;

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadDriverPhoto(file, driver.id);
      await supabase.from('drivers').update({ photo_data: url }).eq('id', driver.id);
      if (onPhotoUpdate) onPhotoUpdate(driver.id, url);
    } catch (err) {
      alert('Photo upload failed: ' + err.message);
    }
    setUploading(false);
  }

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-3 cursor-pointer transition-all card-hover"
      style={{
        background: selected ? 'rgba(201,168,76,0.08)' : '#0d1117',
        border: `1px solid ${selected ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.06)'}`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0 group">
          {driver.photo_data ? (
            <img
              src={driver.photo_data}
              alt={driver.full_name}
              className="w-10 h-10 rounded-full object-cover"
              style={{ border: '2px solid rgba(201,168,76,0.3)' }}
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700"
              style={{
                background: 'linear-gradient(135deg, rgba(255,71,87,0.15), rgba(255,71,87,0.05))',
                border: '2px dashed rgba(255,71,87,0.4)',
                color: '#ff4757',
                fontWeight: 700,
              }}
            >
              {initials}
            </div>
          )}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
            disabled={uploading}
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.55)' }}
            title="Upload photo"
          >
            {uploading ? (
              <div className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" style={{ color: '#fff' }} />
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} onClick={e => e.stopPropagation()} />
          <div className={`status-dot ${driver.status} absolute -bottom-0.5 -right-0.5`} style={{ width: 10, height: 10, border: '2px solid #07090d' }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-600 truncate" style={{ fontWeight: 600, color: '#e5e7eb' }}>{driver.full_name}</p>
            {!driver.photo_data && (
              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757', fontSize: 9 }}>
                NO PHOTO
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: driver.status === 'online' ? '#00e5a0' : driver.status === 'on_trip' ? '#c9a84c' : 'rgba(255,255,255,0.4)' }}>
              {STATUS_LABEL[driver.status] || driver.status}
            </span>
            {gpsAge !== null && (
              <span className="text-xs flex items-center gap-0.5" style={{ color: gpsAge > 5 ? '#f59e0b' : 'rgba(255,255,255,0.3)' }}>
                <Clock className="w-2.5 h-2.5" />{gpsAge}m
              </span>
            )}
            {tripCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontSize: 10 }}>
                {tripCount} trips
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2.5">
        <button
          onClick={e => { e.stopPropagation(); onTake5(); }}
          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-600 transition-all"
          style={{
            background: 'rgba(201,168,76,0.12)',
            border: '1px solid rgba(201,168,76,0.25)',
            color: '#c9a84c',
            fontWeight: 600,
          }}
        >
          <Zap className="w-3 h-3" /> Take 5
        </button>
        <button
          onClick={e => { e.stopPropagation(); fileRef.current?.click(); }}
          className="w-8 h-7 flex items-center justify-center rounded-lg btn-ghost"
          title="Upload driver photo"
        >
          <Camera className="w-3 h-3" style={{ color: driver.photo_data ? 'rgba(255,255,255,0.4)' : '#ff4757' }} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="w-8 h-7 flex items-center justify-center rounded-lg"
          style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.15)', color: 'rgba(255,71,87,0.7)' }}
          title="Remove driver"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
