import React, { useState, useRef } from 'react';
import { X, User, Phone, Mail, Camera, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { useApp } from '../../context/AppContext';
import { logFailure } from '../../utils/errorHandler';

async function uploadDriverPhoto(file, driverNum) {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `${driverNum}-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('driver-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('driver-photos').getPublicUrl(data.path);
  return urlData.publicUrl;
}

export default function AddDriverModal({ onClose }) {
  const { company, profile } = useApp();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', shift_hours: '7am-5pm', home_address: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Name required'); return; }
    if (!photoFile) { setError('Driver photo is required'); return; }

    setLoading(true);
    setError('');

    const driverNum = 'D' + Date.now().toString(36).toUpperCase();

    let photoUrl = '';
    try {
      photoUrl = await uploadDriverPhoto(photoFile, driverNum);
    } catch (uploadErr) {
      setError('Photo upload failed: ' + uploadErr.message);
      setLoading(false);
      return;
    }

    const { data: inserted, error: err } = await supabase.from('drivers').insert({
      driver_number: driverNum,
      full_name: form.full_name.trim(),
      phone: form.phone,
      email: form.email,
      shift_hours: form.shift_hours,
      home_address: form.home_address,
      photo_data: photoUrl,
      company_id: profile?.role === 'company' ? company?.id || null : null,
      status: 'offline',
      is_active: true,
    }).select().maybeSingle();

    if (err) { setError(err.message); setLoading(false); return; }

    if (inserted && sentryApi.enabled && sentryApi.features.drivers) {
      const sentryResult = await sentryApi.createDriver({
        name: inserted.full_name,
        phone: inserted.phone,
        email: inserted.email,
        external_id: inserted.id,
      });
      const sentryDriverId = sentryResult.ok ? String(sentryResult.data?.id || sentryResult.data?.driver_id || '') : '';
      if (sentryDriverId) {
        const { error: updateErr } = await supabase.from('drivers').update({ sentry_driver_id: sentryDriverId }).eq('id', inserted.id);
        if (updateErr) logFailure('AddDriverModal:updateSentryId', updateErr);
      }
      const { error: syncLogErr } = await supabase.from('sentry_sync_log').insert({
        sync_type: 'driver_create',
        direction: 'export',
        record_type: 'driver',
        external_id: sentryDriverId,
        internal_id: inserted.id,
        status: sentryResult.ok ? 'success' : 'failed',
        error_message: sentryResult.ok ? '' : (sentryResult.error || `HTTP ${sentryResult.status}`),
        payload: { full_name: inserted.full_name },
      });
      if (syncLogErr) logFailure('AddDriverModal:syncLog', syncLogErr);
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="mx-auto flex w-full max-w-sm flex-col rounded-2xl animate-slide-up" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <p className="font-700 text-sm" style={{ fontWeight: 700 }}>Add Driver</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="rounded-2xl p-4 flex flex-col items-center gap-3" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.16)' }}>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            <div className="text-center">
              <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Driver Photo</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>Upload a clear profile picture so riders know who is arriving.</p>
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-24 h-24 rounded-full overflow-hidden flex items-center justify-center transition-all"
              style={{
                background: photoPreview ? 'transparent' : 'rgba(201,168,76,0.08)',
                border: photoPreview ? '3px solid rgba(201,168,76,0.5)' : '2px dashed rgba(201,168,76,0.4)',
              }}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <Camera className="w-7 h-7" style={{ color: 'rgba(201,168,76,0.7)' }} />
                  <span className="text-[10px] font-semibold" style={{ color: 'rgba(201,168,76,0.75)' }}>UPLOAD</span>
                </div>
              )}
              {photoPreview && (
                <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Upload className="w-5 h-5" style={{ color: '#fff' }} />
                </div>
              )}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-gold px-4 py-2 text-xs">
              {photoPreview ? 'Change Driver Photo' : 'Upload Driver Photo'}
            </button>
            <p className="text-xs" style={{ color: photoPreview ? '#00e5a0' : 'rgba(255,71,87,0.8)' }}>
              {photoPreview ? 'Photo added and ready for riders' : 'A photo is required before this driver can be added'}
            </p>
          </div>

          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input type="text" placeholder="Full name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full pl-10" required />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input type="tel" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full pl-10" />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full pl-10" />
          </div>
          <input type="text" placeholder="Home address (for AI scheduling)" value={form.home_address} onChange={e => setForm({ ...form, home_address: e.target.value })} className="w-full" />
          <div className="flex gap-2 items-center">
            <label className="text-xs" style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>Shift:</label>
            <input type="text" placeholder="7am-5pm" value={form.shift_hours} onChange={e => setForm({ ...form, shift_hours: e.target.value })} className="flex-1 text-xs py-2" />
          </div>
          {error && <p className="text-xs" style={{ color: '#ff4757' }}>{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 btn-ghost py-2.5">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 btn-gold py-2.5">{loading ? 'Adding...' : 'Add Driver'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
