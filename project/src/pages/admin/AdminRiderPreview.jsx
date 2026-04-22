import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, RefreshCw, Route, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fbSet } from '../../lib/firebase';
import { getPublicAppUrl, isNativeApp } from '../../lib/mobileRuntime';

const DEFAULT_PICKUP = '1200 Atlantic Ave, Brooklyn, NY';
const DEFAULT_DROPOFF = '450 Clarkson Ave, Brooklyn, NY';
const DEFAULT_COORDS = { lat: 40.6782, lng: -73.9442 };

function buildPreviewTripId(companyId) {
  return `preview-${String(companyId || 'sandbox').slice(0, 8)}`;
}

function buildPreviewRiderKey(companyId, driverId) {
  return `admin-preview-${companyId}-${driverId || 'driver'}`;
}

export default function AdminRiderPreview() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const trackingUrl = useMemo(() => {
    if (!preview?.riderKey) return '';
    return getPublicAppUrl(`/rider?trip=${encodeURIComponent(preview.riderKey)}`);
  }, [preview?.riderKey]);

  const inAppTrackingPath = useMemo(() => {
    if (!preview?.riderKey) return '';
    return `/rider?trip=${encodeURIComponent(preview.riderKey)}&source=admin`;
  }, [preview?.riderKey]);

  async function createPreview() {
    setRefreshing(true);
    setError('');

    const { data: sandboxSession } = await supabase
      .from('test_sandbox_sessions')
      .select('test_company_id')
      .eq('is_active', true)
      .order('reset_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let company = null;

    if (sandboxSession?.test_company_id) {
      const { data } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', sandboxSession.test_company_id)
        .maybeSingle();
      company = data;
    }

    if (!company) {
      const { data } = await supabase
        .from('companies')
        .select('id, company_name')
        .ilike('company_name', '%Penthouse Test Co%')
        .limit(1)
        .maybeSingle();
      company = data;
    }

    if (!company) {
      setError('No sandbox company is available yet. Activate Test Mode first.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: driver } = await supabase
      .from('drivers')
      .select('id, full_name, photo_data, current_lat, current_lng, status, company_id')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .order('status', { ascending: true })
      .order('full_name', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!driver) {
      setError('No sandbox driver is available yet. Load test drivers first.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const riderKey = buildPreviewRiderKey(company.id, driver.id);
    const tripId = buildPreviewTripId(company.id);
    const acceptedAt = Date.now();
    const payload = {
      status: 'accepted',
      tripId,
      riderKey,
      company_id: company.id,
      companyId: company.id,
      driverId: driver.id,
      driverName: driver.full_name || 'Sandbox Driver',
      driverPhoto: driver.photo_data || '',
      puAddress: DEFAULT_PICKUP,
      doAddress: DEFAULT_DROPOFF,
      puTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      acceptedAt,
      trackingUrl: getPublicAppUrl(`/rider?trip=${encodeURIComponent(riderKey)}`),
    };

    await fbSet(`rider_tracking/${riderKey}`, payload);
    await fbSet(`drivers/${driver.id}/coords`, {
      lat: driver.current_lat || DEFAULT_COORDS.lat,
      lng: driver.current_lng || DEFAULT_COORDS.lng,
    });

    setPreview({
      companyName: company.company_name,
      driverName: driver.full_name,
      riderKey,
    });
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    createPreview();
  }, []);

  async function handleCopy() {
    if (!trackingUrl) return;
    await navigator.clipboard?.writeText(trackingUrl).catch(() => {});
  }

  return (
    <div className="h-full overflow-y-auto p-6 pb-48" style={{ color: '#e5e7eb' }}>
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h1 className="text-xl font-700 mb-1" style={{ color: '#c9a84c', fontWeight: 700 }}>Rider App Preview</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
            Open a simulated rider trip tied to the Penthouse sandbox company and a live test driver.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/admin/platform"
            className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb', textDecoration: 'none' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin
          </Link>
        </div>

        <div
          className="rounded-2xl p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
          style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="space-y-1">
            <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
              {preview?.companyName || 'Sandbox company'}
            </p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {preview?.driverName
                ? `Connected to ${preview.driverName} for rider tracking preview.`
                : 'Preparing rider preview…'}
            </p>
            {preview?.riderKey && (
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Rider key: {preview.riderKey}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={createPreview}
              className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Preview
            </button>
            <button
              onClick={handleCopy}
              disabled={!trackingUrl}
              className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.18)', color: '#c9a84c' }}
            >
              <Copy className="w-4 h-4" />
              Copy Link
            </button>
            {isNativeApp() ? (
              <Link
                to={inAppTrackingPath || '#'}
                className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
                style={{
                  background: inAppTrackingPath ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.04)',
                  border: inAppTrackingPath ? '1px solid rgba(0,229,160,0.18)' : '1px solid rgba(255,255,255,0.08)',
                  color: inAppTrackingPath ? '#00e5a0' : 'rgba(255,255,255,0.35)',
                  pointerEvents: inAppTrackingPath ? 'auto' : 'none',
                  textDecoration: 'none',
                }}
              >
                <ExternalLink className="w-4 h-4" />
                Open Rider App
              </Link>
            ) : (
            <a
              href={trackingUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl text-sm flex items-center gap-2"
              style={{
                background: trackingUrl ? 'rgba(0,229,160,0.08)' : 'rgba(255,255,255,0.04)',
                border: trackingUrl ? '1px solid rgba(0,229,160,0.18)' : '1px solid rgba(255,255,255,0.08)',
                color: trackingUrl ? '#00e5a0' : 'rgba(255,255,255,0.35)',
                pointerEvents: trackingUrl ? 'auto' : 'none',
                textDecoration: 'none',
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Open Rider App
            </a>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl p-4" style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.18)', color: '#ff8f99' }}>
            {error}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <Route className="w-4 h-4" style={{ color: '#c9a84c' }} />
            <span className="text-sm font-600" style={{ fontWeight: 600 }}>
              {isNativeApp() ? 'Rider Preview Summary' : 'Embedded Rider Preview'}
            </span>
          </div>
          {loading && !error ? (
            <div className="h-[720px] flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Preparing rider preview…
            </div>
          ) : isNativeApp() ? (
            <div className="p-5 space-y-4">
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Native App Note</p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.7 }}>
                  The native app no longer embeds the rider screen inside an iframe here. That iframe behavior can cause reload loops inside a wrapped mobile app.
                  Use the <strong style={{ color: '#e5e7eb' }}>Open Rider App</strong> button above to launch the actual rider screen directly.
                </p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.16)' }}>
                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#7dd3fc' }}>Preview Trip</p>
                <div className="space-y-2 text-sm">
                  <p style={{ color: 'rgba(255,255,255,0.72)' }}><strong style={{ color: '#e5e7eb' }}>Company:</strong> {preview?.companyName || 'Sandbox company'}</p>
                  <p style={{ color: 'rgba(255,255,255,0.72)' }}><strong style={{ color: '#e5e7eb' }}>Driver:</strong> {preview?.driverName || 'Sandbox driver'}</p>
                  <p style={{ color: 'rgba(255,255,255,0.72)' }}><strong style={{ color: '#e5e7eb' }}>Pickup:</strong> {DEFAULT_PICKUP}</p>
                  <p style={{ color: 'rgba(255,255,255,0.72)' }}><strong style={{ color: '#e5e7eb' }}>Dropoff:</strong> {DEFAULT_DROPOFF}</p>
                </div>
              </div>
            </div>
          ) : trackingUrl ? (
            <iframe
              title="Rider App Preview"
              src={trackingUrl}
              className="w-full h-[780px]"
              style={{ background: '#07090d', border: 'none' }}
            />
          ) : (
            <div className="h-[720px] flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Rider preview is not ready yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
