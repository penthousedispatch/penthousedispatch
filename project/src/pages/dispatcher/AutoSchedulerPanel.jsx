import React, { useState, useEffect } from 'react';
import {
  Zap, Save, CheckCircle, AlertTriangle, TrendingUp,
  Navigation, DollarSign, Clock, RefreshCw,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { runAutoScheduler } from '../../utils/autoScheduler';
import { resolveOrgIdForAdmin } from '../../lib/resolveOrgId';
import { handleSupabaseError, toastError, toastSuccess } from '../../utils/errorHandler';

const DEFAULT_CONFIG = {
  enabled: false,
  revenue_target_per_hour: 60,
  driver_pay_per_hour: 35,
  billing_rate_per_mile: 0.13,
  max_trip_distance_miles: 25,
  proximity_weight: 7,
  traffic_weight: 8,
  mileage_weight: 5,
  price_weight: 8,
  short_trip_max_miles: 4,
  short_trip_bonus_weight: 9,
  chaining_weight: 8,
  shared_ride_bonus_weight: 6,
  buffer_mins: 15,
  traffic_buffer_pct: 20,
  shared_rides_enabled: true,
  auto_assign: false,
  shift_hours: '7am-5pm',
};

function WeightSlider({ label, hint, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-xs font-500" style={{ color: '#e5e7eb' }}>{label}</p>
          {hint && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{hint}</p>}
        </div>
        <span className="text-sm font-700 w-6 text-right" style={{ color: '#c9a84c', fontWeight: 700 }}>{value}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #c9a84c ${value * 10}%, rgba(255,255,255,0.1) ${value * 10}%)`,
            accentColor: '#c9a84c',
          }}
        />
      </div>
    </div>
  );
}

export default function AutoSchedulerPanel() {
  const { org, user, isPlatformOwner, role, drivers, trips, assignments, loadAssignments, loadTrips } = useApp();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [expandedRun, setExpandedRun] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [resolvedOrgId, setResolvedOrgId] = useState(org?.id || null);
  const [orgError, setOrgError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function resolveOrg() {
      setOrgError('');
      const nextOrgId = await resolveOrgIdForAdmin({
        orgId: org?.id || null,
        user,
        isPlatformOwner,
        role,
      });
      if (!mounted) return;
      setResolvedOrgId(nextOrgId);
      if (!nextOrgId) {
        setOrgError('Unable to resolve organization workspace. Scheduler settings cannot be persisted yet.');
      }
    }
    resolveOrg();
    return () => {
      mounted = false;
    };
  }, [org?.id, user?.id, isPlatformOwner, role]);

  useEffect(() => {
    if (resolvedOrgId) {
      loadConfig();
      loadRecentRuns();
    } else {
      setRecentRuns([]);
    }
  }, [resolvedOrgId]);

  async function loadConfig() {
    if (!resolvedOrgId) return;
    const { data, error } = await supabase
      .from('auto_scheduler_config')
      .select('*')
      .eq('org_id', resolvedOrgId)
      .maybeSingle();
    if (error) {
      handleSupabaseError(error, 'AutoSchedulerPanel:loadConfig', { silent: true });
      return;
    }
    if (data) setConfig(data);
  }

  async function loadRecentRuns() {
    if (!resolvedOrgId) {
      setRecentRuns([]);
      setLoadingRuns(false);
      return;
    }
    setLoadingRuns(true);
    const { data, error } = await supabase
      .from('auto_scheduler_runs')
      .select('*')
      .eq('org_id', resolvedOrgId)
      .order('run_at', { ascending: false })
      .limit(10);
    if (error) {
      handleSupabaseError(error, 'AutoSchedulerPanel:loadRecentRuns', { silent: true });
      setRecentRuns([]);
      setLoadingRuns(false);
      return;
    }
    setRecentRuns(data || []);
    setLoadingRuns(false);
  }

  async function handleSave() {
    if (!resolvedOrgId) return;
    setSaving(true);
    try {
      const { data: existing, error: existingError } = await supabase
        .from('auto_scheduler_config')
        .select('id')
        .eq('org_id', resolvedOrgId)
        .maybeSingle();
      if (existingError) {
        handleSupabaseError(existingError, 'AutoSchedulerPanel:handleSave:lookup', { fallback: 'Failed to check scheduler settings.' });
        return;
      }

      const payload = { ...config, org_id: resolvedOrgId, updated_at: new Date().toISOString() };

      if (existing) {
        const { error } = await supabase.from('auto_scheduler_config').update(payload).eq('org_id', resolvedOrgId);
        if (error) {
          handleSupabaseError(error, 'AutoSchedulerPanel:handleSave:update', { fallback: 'Failed to save scheduler settings.' });
          return;
        }
      } else {
        const { error } = await supabase.from('auto_scheduler_config').insert(payload);
        if (error) {
          handleSupabaseError(error, 'AutoSchedulerPanel:handleSave:insert', { fallback: 'Failed to save scheduler settings.' });
          return;
        }
      }

      setSaved(true);
      toastSuccess('Scheduler settings saved.');
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const result = await runAutoScheduler({
        drivers,
        trips,
        assignments,
        config,
        orgId: resolvedOrgId,
        dryRun: true,
      });
      setPreviewResult(result);
    } catch (error) {
      toastError(error?.message || 'Failed to generate scheduler preview.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleRun() {
    setRunning(true);
    setLastResult(null);
    try {
      const result = await runAutoScheduler({
        drivers,
        trips,
        assignments,
        config,
        orgId: resolvedOrgId,
        dryRun: false,
      });
      setLastResult(result);
      if (config.auto_assign) {
        await loadAssignments();
        await loadTrips();
      }
      await loadRecentRuns();
    } catch (error) {
      toastError(error?.message || 'Scheduler run failed.');
    } finally {
      setRunning(false);
    }
  }

  const onlineDrivers = drivers.filter(d => d.status === 'online' || d.status === 'on_trip');
  const availableTrips = trips.filter(t => t.status === 'available');
  const margin = (config.revenue_target_per_hour - config.driver_pay_per_hour).toFixed(0);
  const projectedDailyMargin = (parseFloat(margin) * parseShiftHours(config.shift_hours) * onlineDrivers.length).toFixed(0);

  function parseShiftHours(s) {
    if (!s) return 10;
    const clean = s.toLowerCase().replace(/\s/g, '');
    const parts = clean.split(/[-to]+/);
    if (parts.length < 2) return 10;
    return Math.max(1, (parseTime(parts[1]) - parseTime(parts[0])) / 60);
  }

  function parseTime(s) {
    s = s.trim().toLowerCase();
    const ampm = s.includes('pm') ? 'pm' : 'am';
    s = s.replace(/[apm]/g, '');
    const parts = s.split(':');
    let h = parseInt(parts[0]) || 0;
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return h * 60 + (parseInt(parts[1]) || 0);
  }

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-2xl">
          {orgError && (
            <div className="mb-4 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff4757' }}>
              {orgError}
            </div>
          )}
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-700 mb-0.5" style={{ fontWeight: 700 }}>Auto-Scheduler Bot</h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Automatically builds dense driver shifts using short high-efficiency trips, chaining, and shared-ride opportunities
                </p>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-600 transition-all"
                style={{
                  background: config.enabled ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${config.enabled ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.1)'}`,
                  color: config.enabled ? '#00e5a0' : 'rgba(255,255,255,0.4)',
                  fontWeight: 600,
                }}
              >
                {config.enabled
                  ? <ToggleRight className="w-4 h-4" />
                  : <ToggleLeft className="w-4 h-4" />
                }
                {config.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.12)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Online Drivers</p>
              <p className="text-2xl font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>{onlineDrivers.length}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Available Trips</p>
              <p className="text-2xl font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{availableTrips.length}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.12)' }}>
              <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Projected Daily</p>
              <p className="text-2xl font-700" style={{ color: '#0ea5e9', fontWeight: 700 }}>${projectedDailyMargin}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>margin</p>
            </div>
          </div>

          <div className="rounded-xl p-4 mb-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
              Revenue Model
            </p>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <TrendingUp className="w-3 h-3" /> Revenue Target ($/hr/driver)
                </label>
                <input
                  type="number"
                  min={20}
                  max={500}
                  value={config.revenue_target_per_hour}
                  onChange={e => setConfig(c => ({ ...c, revenue_target_per_hour: parseFloat(e.target.value) || 60 }))}
                  className="w-full"
                />
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Trip fees needed per driver per hour</p>
              </div>
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <DollarSign className="w-3 h-3" /> Driver Pay ($/hr)
                </label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={config.driver_pay_per_hour}
                  onChange={e => setConfig(c => ({ ...c, driver_pay_per_hour: parseFloat(e.target.value) || 35 }))}
                  className="w-full"
                />
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>What drivers see and earn</p>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl mb-4" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)' }}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>Margin per driver per hour:</span>
                <span className="font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${margin}/hr</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span style={{ color: 'rgba(255,255,255,0.35)' }}>Drivers see their pay only — revenue stays internal</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <Clock className="w-3 h-3" /> Default Shift
                </label>
                <input
                  type="text"
                  value={config.shift_hours}
                  onChange={e => setConfig(c => ({ ...c, shift_hours: e.target.value }))}
                  placeholder="7am-5pm"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <Navigation className="w-3 h-3" /> Max Trip Distance (mi)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={config.max_trip_distance_miles}
                  onChange={e => setConfig(c => ({ ...c, max_trip_distance_miles: parseFloat(e.target.value) || 25 }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <Clock className="w-3 h-3" /> Short Trip Threshold (mi)
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={0.5}
                  value={config.short_trip_max_miles}
                  onChange={e => setConfig(c => ({ ...c, short_trip_max_miles: parseFloat(e.target.value) || 4 }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <Navigation className="w-3 h-3" /> Traffic Buffer (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.traffic_buffer_pct}
                  onChange={e => setConfig(c => ({ ...c, traffic_buffer_pct: parseInt(e.target.value) || 20 }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <DollarSign className="w-3 h-3" /> Billing Rate Per Mile
                </label>
                <input
                  type="number"
                  min={0.01}
                  max={2}
                  step={0.01}
                  value={config.billing_rate_per_mile}
                  onChange={e => setConfig(c => ({ ...c, billing_rate_per_mile: parseFloat(e.target.value) || 0.13 }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl p-4 mb-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-4" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
              Routing Weights
            </p>
            <div className="space-y-4">
              <WeightSlider
                label="Trip Price"
                hint="Higher = prioritize trips that pay more"
                value={config.price_weight}
                onChange={v => setConfig(c => ({ ...c, price_weight: v }))}
              />
              <WeightSlider
                label="Driver Proximity"
                hint="Higher = assign trips closest to driver"
                value={config.proximity_weight}
                onChange={v => setConfig(c => ({ ...c, proximity_weight: v }))}
              />
              <WeightSlider
                label="Traffic Awareness"
                hint="Higher = avoid assignments that burn too much drive time getting to pickup"
                value={config.traffic_weight}
                onChange={v => setConfig(c => ({ ...c, traffic_weight: v }))}
              />
              <WeightSlider
                label="Mileage Efficiency"
                hint="Higher = favor high pay-per-mile trips"
                value={config.mileage_weight}
                onChange={v => setConfig(c => ({ ...c, mileage_weight: v }))}
              />
              <WeightSlider
                label="Short Trip Bias"
                hint="Higher = prioritize 2-4 mile trips that can be completed fast"
                value={config.short_trip_bonus_weight}
                onChange={v => setConfig(c => ({ ...c, short_trip_bonus_weight: v }))}
              />
              <WeightSlider
                label="Trip Chaining"
                hint="Higher = keep each driver in a dense corridor with nearby next trips"
                value={config.chaining_weight}
                onChange={v => setConfig(c => ({ ...c, chaining_weight: v }))}
              />
              <WeightSlider
                label="Shared Ride Bonus"
                hint="Higher = favor same-direction rides that can stack cleanly"
                value={config.shared_ride_bonus_weight}
                onChange={v => setConfig(c => ({ ...c, shared_ride_bonus_weight: v }))}
              />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl px-3 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div>
                <p className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Shared rides</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Allow same-direction trips to be surfaced as stackable opportunities</p>
              </div>
              <button
                onClick={() => setConfig(c => ({ ...c, shared_rides_enabled: !c.shared_rides_enabled }))}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-600 transition-all"
                style={{
                  background: config.shared_rides_enabled ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${config.shared_rides_enabled ? 'rgba(0,229,160,0.25)' : 'rgba(255,255,255,0.1)'}`,
                  color: config.shared_rides_enabled ? '#00e5a0' : 'rgba(255,255,255,0.4)',
                  fontWeight: 600,
                }}
              >
                {config.shared_rides_enabled
                  ? <ToggleRight className="w-4 h-4" />
                  : <ToggleLeft className="w-4 h-4" />
                }
                {config.shared_rides_enabled ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="rounded-xl p-4 mb-5" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
              Assignment Mode
            </p>
            <div className="flex gap-2">
              {[
                { id: false, label: 'Suggestions Only', desc: 'Preview which trips to assign without actually doing it', color: '#c9a84c' },
                { id: true, label: 'Auto-Assign', desc: 'Automatically push assignments to drivers in real-time', color: '#00e5a0' },
              ].map(opt => (
                <button
                  key={String(opt.id)}
                  onClick={() => setConfig(c => ({ ...c, auto_assign: opt.id }))}
                  className="flex-1 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: config.auto_assign === opt.id ? `${opt.color}10` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${config.auto_assign === opt.id ? `${opt.color}30` : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: config.auto_assign === opt.id ? opt.color : 'rgba(255,255,255,0.15)' }} />
                    <p className="text-xs font-600" style={{ color: config.auto_assign === opt.id ? opt.color : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{opt.label}</p>
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mb-5">
            <button
              onClick={handlePreview}
              disabled={previewing || running || !resolvedOrgId}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-600 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 600, opacity: resolvedOrgId ? 1 : 0.45 }}
            >
              <RefreshCw className={`w-4 h-4 ${previewing ? 'animate-spin' : ''}`} />
              {previewing ? 'Previewing...' : 'Preview Results'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !resolvedOrgId}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-600 transition-all"
              style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600, opacity: resolvedOrgId ? 1 : 0.45 }}
            >
              {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Saved!' : saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleRun}
              disabled={running || previewing || !resolvedOrgId}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-600 transition-all"
              style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', color: '#00e5a0', fontWeight: 600, opacity: resolvedOrgId ? 1 : 0.45 }}
            >
              <Zap className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
              {running ? 'Running...' : config.auto_assign ? 'Run & Assign' : 'Run Now'}
            </button>
          </div>

          {previewResult && (
            <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
              <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: '#c9a84c', fontWeight: 700 }}>Preview Results</p>
              <SchedulerResultSummary result={previewResult} isDryRun />
            </div>
          )}

          {lastResult && (
            <div className="rounded-xl p-4 mb-5" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}>
              <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: '#00e5a0', fontWeight: 700 }}>Last Run Results</p>
              <SchedulerResultSummary result={lastResult} isDryRun={!config.auto_assign} />
            </div>
          )}

          {recentRuns.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-700" style={{ fontWeight: 700 }}>Run History</p>
                <button onClick={loadRecentRuns} className="btn-ghost px-2 py-1 flex items-center gap-1 text-xs">
                  <RefreshCw className={`w-3 h-3 ${loadingRuns ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="space-y-2">
                {recentRuns.map(run => (
                  <div key={run.id} className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedRun(prev => prev === run.id ? null : run.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ background: run.trips_assigned > 0 ? '#00e5a0' : '#f59e0b' }} />
                        <div>
                          <p className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>
                            {run.trips_assigned} trips · ${parseFloat(run.total_revenue).toFixed(2)} · ${parseFloat(run.avg_revenue_per_hour).toFixed(0)}/hr
                          </p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            {new Date(run.run_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {expandedRun === run.id
                        ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                        : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
                      }
                    </div>
                    {expandedRun === run.id && (
                      <div className="px-4 pb-3 pt-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="grid grid-cols-3 gap-3 mt-3 mb-3">
                          <div className="text-center">
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Drivers</p>
                            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{run.drivers_processed}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Trips</p>
                            <p className="text-sm font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>{run.trips_assigned}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Revenue</p>
                            <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${parseFloat(run.total_revenue).toFixed(2)}</p>
                          </div>
                        </div>
                        {run.assignments?.length > 0 && (
                          <div className="space-y-1">
                            {run.assignments.map((a, i) => (
                              <div key={i} className="flex items-center justify-between text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{a.driver_name}</span>
                                <span style={{ color: '#c9a84c' }}>{a.trip_count} trip{a.trip_count !== 1 ? 's' : ''} · ${parseFloat(a.projected_revenue || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {run.issues?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {run.issues.map((issue, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: '#f59e0b' }}>
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                {issue}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SchedulerResultSummary({ result, isDryRun }) {
  if (!result) return null;
  const { driversProcessed, totalAssigned, totalRevenue, avgRPH, issues, results, availableCount, sharedRideOpportunities, shortTripAssigned } = result;
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="text-center rounded-xl py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Drivers</p>
          <p className="text-xl font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{driversProcessed}</p>
        </div>
        <div className="text-center rounded-xl py-3" style={{ background: 'rgba(0,229,160,0.04)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{isDryRun ? 'Suggested' : 'Assigned'}</p>
          <p className="text-xl font-700" style={{ color: '#00e5a0', fontWeight: 700 }}>{totalAssigned}</p>
        </div>
        <div className="text-center rounded-xl py-3" style={{ background: 'rgba(201,168,76,0.04)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Revenue</p>
          <p className="text-xl font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${parseFloat(totalRevenue || 0).toFixed(0)}</p>
        </div>
        <div className="text-center rounded-xl py-3" style={{ background: 'rgba(14,165,233,0.06)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Short / Shared</p>
          <p className="text-xl font-700" style={{ color: '#0ea5e9', fontWeight: 700 }}>{shortTripAssigned || 0} / {sharedRideOpportunities || 0}</p>
        </div>
      </div>
      {results?.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {results.map(({ driver, trips: driverTrips }, i) => {
            const rev = driverTrips.reduce((s, t) => s + (parseFloat(t.delivery_price) || 0), 0);
            return (
              <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00e5a0' }} />
                  <span style={{ color: '#e5e7eb' }}>{driver.full_name}</span>
                </div>
                <span style={{ color: '#c9a84c' }}>{driverTrips.length} trip{driverTrips.length !== 1 ? 's' : ''} · ${rev.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}
      {issues?.length > 0 && (
        <div className="space-y-1">
          {issues.map((issue, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: '#f59e0b' }}>
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              {issue}
            </div>
          ))}
        </div>
      )}
      {totalAssigned === 0 && (
        <p className="text-xs text-center py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          No trips could be matched. {availableCount} trips available, {driversProcessed} drivers online.
        </p>
      )}
    </div>
  );
}
