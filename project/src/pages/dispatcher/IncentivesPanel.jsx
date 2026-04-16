import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CreditCard as Edit2, Check, X, Trophy, Target, TrendingUp, Users, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { handleSupabaseError } from '../../utils/errorHandler';

const GOAL_TYPES = [
  { id: 'trips', label: 'Trips Completed', icon: '🚗', unit: 'trips' },
  { id: 'revenue', label: 'Revenue Earned', icon: '💰', unit: '$' },
  { id: 'hours', label: 'Hours Worked', icon: '⏱️', unit: 'hrs' },
];

const CELEBRATION_STYLES = [
  { id: 'confetti', label: 'Confetti Burst' },
  { id: 'spotlight', label: 'Spotlight Win' },
  { id: 'stars', label: 'Star Shower' },
  { id: 'turbo', label: 'Turbo Surge' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  goal_type: 'trips',
  goal_value: 20,
  bonus_amount: 50,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  is_active: true,
  celebration_style: 'confetti',
  celebration_message: '',
};

export default function IncentivesPanel() {
  const { org, drivers } = useApp();
  const [incentives, setIncentives] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selectedIncentive, setSelectedIncentive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (org?.id) loadAll();
  }, [org?.id, drivers.length]);

  async function ensureDefaultIncentives(orgId) {
    if (!orgId) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    const weekEnd = new Date(start.getTime() + 6 * 86400000);

    const defaults = [
      {
        name: 'Driver of the Month',
        description: 'Top driver by completed trips this month wins the featured leaderboard bonus.',
        goal_type: 'trips',
        goal_value: 100,
        bonus_amount: 500,
        start_date: monthStart.toISOString().slice(0, 10),
        end_date: monthEnd.toISOString().slice(0, 10),
        celebration_style: 'spotlight',
        celebration_message: 'You climbed to the top of the monthly trip board. Keep the crown.',
      },
      {
        name: 'Morning Rush Champion',
        description: 'Crush the morning pickup rush with a strong trip streak before noon.',
        goal_type: 'trips',
        goal_value: 18,
        bonus_amount: 120,
        start_date: start.toISOString().slice(0, 10),
        end_date: weekEnd.toISOString().slice(0, 10),
        celebration_style: 'turbo',
        celebration_message: 'You owned the morning rush and banked the bonus.',
      },
      {
        name: 'Perfect Pickup Streak',
        description: 'Complete a full week of timely pickups without a no-show.',
        goal_type: 'trips',
        goal_value: 25,
        bonus_amount: 150,
        start_date: start.toISOString().slice(0, 10),
        end_date: weekEnd.toISOString().slice(0, 10),
        celebration_style: 'stars',
        celebration_message: 'Pickup streak complete. Riders can count on you.',
      },
      {
        name: 'Five Star Service',
        description: 'Hit your service target and keep riders happy all week.',
        goal_type: 'trips',
        goal_value: 30,
        bonus_amount: 175,
        start_date: start.toISOString().slice(0, 10),
        end_date: weekEnd.toISOString().slice(0, 10),
        celebration_style: 'confetti',
        celebration_message: 'Service goal reached. Keep delivering the premium experience.',
      },
      {
        name: 'Weekend Warrior',
        description: 'Take the late-weekend demand and turn it into a leaderboard push.',
        goal_type: 'trips',
        goal_value: 20,
        bonus_amount: 160,
        start_date: start.toISOString().slice(0, 10),
        end_date: weekEnd.toISOString().slice(0, 10),
        celebration_style: 'spotlight',
        celebration_message: 'Weekend shift complete. You outworked the field.',
      },
      {
        name: 'Long Haul Bonus',
        description: 'Stack high-value long trips and beat your earnings goal.',
        goal_type: 'revenue',
        goal_value: 900,
        bonus_amount: 220,
        start_date: start.toISOString().slice(0, 10),
        end_date: weekEnd.toISOString().slice(0, 10),
        celebration_style: 'turbo',
        celebration_message: 'Revenue target cleared. Your long-haul strategy paid off.',
      },
    ];

    for (const incentiveSeed of defaults) {
      const { data: existing } = await supabase
        .from('incentives')
        .select('id')
        .eq('org_id', orgId)
        .eq('name', incentiveSeed.name)
        .maybeSingle();

      if (existing?.id) continue;

      const { data: incentive } = await supabase
        .from('incentives')
        .insert({
          org_id: orgId,
          is_active: true,
          ...incentiveSeed,
        })
        .select()
        .maybeSingle();

      if (incentive?.id && drivers.length > 0) {
        await supabase.from('driver_incentive_enrollments').upsert(
          drivers.map(driver => ({
            incentive_id: incentive.id,
            driver_id: driver.id,
            current_progress: 0,
            earned: false,
          })),
          { onConflict: 'incentive_id,driver_id' }
        );
      }
    }
  }

  async function loadAll() {
    setLoading(true);
    await ensureDefaultIncentives(org?.id);
    const [{ data: inv, error: invErr }, { data: enr, error: enrErr }] = await Promise.all([
      supabase.from('incentives').select('*').eq('org_id', org?.id).order('created_at', { ascending: false }),
      supabase.from('driver_incentive_enrollments').select('*, incentives!inner(org_id)').eq('incentives.org_id', org?.id),
    ]);
    if (invErr) handleSupabaseError(invErr, 'IncentivesPanel:loadAll:incentives', { silent: true });
    if (enrErr) handleSupabaseError(enrErr, 'IncentivesPanel:loadAll:enrollments', { silent: true });
    setIncentives(inv || []);
    setEnrollments(enr || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaveError('');
    setSaving(true);

    let orgId = org?.id;
    if (!orgId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle();
        orgId = membership?.org_id;
      }
    }

    if (!orgId) {
      setSaveError('Organization not found. Make sure you are logged in as a dispatcher.');
      setSaving(false);
      return;
    }

    const payload = {
      ...form,
      org_id: orgId,
      goal_value: parseFloat(form.goal_value) || 1,
      bonus_amount: parseFloat(form.bonus_amount) || 0,
      celebration_style: form.celebration_style || 'confetti',
      celebration_message: form.celebration_message || '',
    };

    if (editingId) {
      const { error } = await supabase.from('incentives').update(payload).eq('id', editingId);
      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: newInc, error: insertErr } = await supabase.from('incentives').insert(payload).select().maybeSingle();
      if (insertErr || !newInc) {
        setSaveError(insertErr?.message || 'Failed to create incentive.');
        setSaving(false);
        return;
      }
      if (drivers.length > 0) {
        const enrollPayload = drivers.map(d => ({
          incentive_id: newInc.id,
          driver_id: d.id,
          current_progress: 0,
          earned: false,
        }));
        const { error: enrollErr } = await supabase
          .from('driver_incentive_enrollments')
          .upsert(enrollPayload, { onConflict: 'incentive_id,driver_id' });
        if (enrollErr) {
          setSaveError(`Incentive created but enrollment failed: ${enrollErr.message}`);
          setSaving(false);
          await loadAll();
          return;
        }
      }
    }

    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setSaving(false);
    await loadAll();
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('incentives').delete().eq('id', id);
    if (error) { handleSupabaseError(error, 'IncentivesPanel:handleDelete', { fallback: 'Failed to delete incentive.' }); return; }
    await loadAll();
  }

  async function handleToggleActive(inc) {
    const { error } = await supabase.from('incentives').update({ is_active: !inc.is_active }).eq('id', inc.id);
    if (error) { handleSupabaseError(error, 'IncentivesPanel:handleToggleActive', { fallback: 'Failed to update incentive status.' }); return; }
    await loadAll();
  }

  async function updateProgress(enrollmentId, newValue) {
    const { error } = await supabase.from('driver_incentive_enrollments').update({ current_progress: parseFloat(newValue) || 0 }).eq('id', enrollmentId);
    if (error) { handleSupabaseError(error, 'IncentivesPanel:updateProgress', { fallback: 'Failed to update progress.' }); return; }
    await loadAll();
  }

  async function markEarned(enrollmentId, earned) {
    const { error } = await supabase.from('driver_incentive_enrollments').update({ earned }).eq('id', enrollmentId);
    if (error) { handleSupabaseError(error, 'IncentivesPanel:markEarned', { fallback: 'Failed to mark incentive earned.' }); return; }
    await loadAll();
  }

  function startEdit(inc) {
    setForm({
      name: inc.name,
      description: inc.description || '',
      goal_type: inc.goal_type,
      goal_value: inc.goal_value,
      bonus_amount: inc.bonus_amount,
      start_date: inc.start_date,
      end_date: inc.end_date,
      is_active: inc.is_active,
      celebration_style: inc.celebration_style || 'confetti',
      celebration_message: inc.celebration_message || '',
    });
    setEditingId(inc.id);
    setShowForm(true);
  }

  const activeIncentives = incentives.filter(i => i.is_active);
  const pastIncentives = incentives.filter(i => !i.is_active);

  const getEnrollmentsForIncentive = (incId) => {
    return enrollments.filter(e => e.incentive_id === incId).map(e => ({
      ...e,
      driver: drivers.find(d => d.id === e.driver_id),
    })).filter(e => e.driver);
  };

  const getProgress = (enrollment, goalValue) => Math.min(100, (enrollment.current_progress / goalValue) * 100);

  const goalTypeMeta = (type) => GOAL_TYPES.find(g => g.id === type) || GOAL_TYPES[0];

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-700" style={{ fontWeight: 700 }}>Driver Incentives</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Create goals and bonuses to motivate your drivers</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadAll} className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-sm">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
              className="btn-gold flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              New Incentive
            </button>
          </div>
        </div>

        {showForm && (
          <div className="rounded-xl p-5 mb-5" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.25)' }}>
            <p className="text-sm font-700 mb-4" style={{ fontWeight: 700 }}>{editingId ? 'Edit Incentive' : 'New Incentive'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Incentive Name</label>
                <input
                  type="text"
                  placeholder="e.g. Weekend Warriors"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Bonus Payout ($)</label>
                <input
                  type="number"
                  min="1"
                  value={form.bonus_amount}
                  onChange={e => setForm({ ...form, bonus_amount: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Description (optional)</label>
              <input
                type="text"
                placeholder="Brief description for drivers"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full"
              />
            </div>

            <div className="mb-3">
              <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Goal Type</label>
              <div className="flex gap-2">
                {GOAL_TYPES.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setForm({ ...form, goal_type: g.id })}
                    className="flex-1 py-2.5 rounded-xl text-xs flex flex-col items-center gap-1 transition-all"
                    style={{
                      background: form.goal_type === g.id ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${form.goal_type === g.id ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      color: form.goal_type === g.id ? '#c9a84c' : 'rgba(255,255,255,0.5)',
                    }}
                  >
                    <span className="text-base">{g.icon}</span>
                    <span style={{ fontWeight: form.goal_type === g.id ? 600 : 400 }}>{g.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Goal Target ({goalTypeMeta(form.goal_type).unit})
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.goal_value}
                  onChange={e => setForm({ ...form, goal_value: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Start Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>End Date</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Celebration Animation</label>
                <select
                  value={form.celebration_style}
                  onChange={e => setForm({ ...form, celebration_style: e.target.value })}
                  className="w-full"
                >
                  {CELEBRATION_STYLES.map(style => (
                    <option key={style.id} value={style.id}>{style.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Celebration Message</label>
                <input
                  type="text"
                  placeholder="What drivers should see when they hit this goal"
                  value={form.celebration_message}
                  onChange={e => setForm({ ...form, celebration_message: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>

            {saveError && (
              <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.25)', color: '#ff4757' }}>
                {saveError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setSaveError(''); }}
                className="btn-ghost flex items-center gap-2 px-4 py-2 text-sm"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="btn-gold flex items-center gap-2 px-5 py-2 text-sm"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create Incentive'}
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
          </div>
        )}

        {!loading && activeIncentives.length === 0 && !showForm && (
          <div className="text-center py-16">
            <Trophy className="w-12 h-12 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.15)' }} />
            <p className="font-600 mb-1" style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>No active incentives</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Create an incentive to motivate your drivers</p>
          </div>
        )}

        {!loading && activeIncentives.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Active Incentives</p>
            <div className="space-y-3">
              {activeIncentives.map(inc => (
                <IncentiveCard
                  key={inc.id}
                  incentive={inc}
                  enrollments={getEnrollmentsForIncentive(inc.id)}
                  expanded={selectedIncentive === inc.id}
                  onToggleExpand={() => setSelectedIncentive(prev => prev === inc.id ? null : inc.id)}
                  onEdit={() => startEdit(inc)}
                  onDelete={() => handleDelete(inc.id)}
                  onToggleActive={() => handleToggleActive(inc)}
                  onUpdateProgress={updateProgress}
                  onMarkEarned={markEarned}
                  getProgress={getProgress}
                  goalTypeMeta={goalTypeMeta}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && pastIncentives.length > 0 && (
          <div>
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Inactive / Past</p>
            <div className="space-y-2">
              {pastIncentives.map(inc => (
                <IncentiveCard
                  key={inc.id}
                  incentive={inc}
                  enrollments={getEnrollmentsForIncentive(inc.id)}
                  expanded={selectedIncentive === inc.id}
                  onToggleExpand={() => setSelectedIncentive(prev => prev === inc.id ? null : inc.id)}
                  onEdit={() => startEdit(inc)}
                  onDelete={() => handleDelete(inc.id)}
                  onToggleActive={() => handleToggleActive(inc)}
                  onUpdateProgress={updateProgress}
                  onMarkEarned={markEarned}
                  getProgress={getProgress}
                  goalTypeMeta={goalTypeMeta}
                  dimmed
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IncentiveCard({ incentive, enrollments, expanded, onToggleExpand, onEdit, onDelete, onToggleActive, onUpdateProgress, onMarkEarned, getProgress, goalTypeMeta, dimmed }) {
  const meta = goalTypeMeta(incentive.goal_type);
  const earnedCount = enrollments.filter(e => e.earned).length;
  const avgProgress = enrollments.length > 0
    ? enrollments.reduce((s, e) => s + getProgress(e, incentive.goal_value), 0) / enrollments.length
    : 0;

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: dimmed ? 'rgba(255,255,255,0.02)' : '#0d1117',
        border: `1px solid ${expanded ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.06)'}`,
        opacity: dimmed ? 0.6 : 1,
      }}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.15)' }}>
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{incentive.name}</p>
            {earnedCount > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(0,229,160,0.12)', color: '#00e5a0', fontWeight: 600 }}>
                {earnedCount} earned
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {meta.label} — Goal: {incentive.goal_type === 'revenue' ? '$' : ''}{incentive.goal_value}{incentive.goal_type !== 'revenue' ? ' ' + meta.unit : ''}
            &nbsp;&nbsp;·&nbsp;&nbsp;Bonus: ${incentive.bonus_amount}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Avg Progress</p>
            <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>{avgProgress.toFixed(0)}%</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost"
            title="Edit"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onToggleActive(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost text-xs"
            title={incentive.is_active ? 'Deactivate' : 'Activate'}
            style={{ color: incentive.is_active ? '#f59e0b' : '#00e5a0' }}
          >
            {incentive.is_active ? '⏸' : '▶'}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost"
            title="Delete"
            style={{ color: '#ff4757' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${avgProgress}%`,
              background: avgProgress >= 100 ? 'linear-gradient(90deg, #00e5a0, #4ade80)' : 'linear-gradient(90deg, #c9a84c, #e8c76a)',
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {incentive.start_date} – {incentive.end_date}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {enrollments.length} drivers enrolled
          </p>
        </div>
      </div>

      {expanded && enrollments.length > 0 && (
        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="px-4 py-3">
            <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Driver Progress</p>
            <div className="space-y-2.5">
              {enrollments
                .sort((a, b) => (b.current_progress || 0) - (a.current_progress || 0))
                .map(enrollment => {
                  const pct = getProgress(enrollment, incentive.goal_value);
                  return (
                    <div key={enrollment.id} className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0"
                        style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', fontWeight: 700 }}
                      >
                        {enrollment.driver?.full_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-500" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {enrollment.driver?.full_name}
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max={incentive.goal_value * 2}
                              step="1"
                              value={enrollment.current_progress || 0}
                              onChange={e => onUpdateProgress(enrollment.id, e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="w-16 text-center py-0.5 text-xs"
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e5e7eb' }}
                            />
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>/ {incentive.goal_value}</span>
                            <button
                              onClick={e => { e.stopPropagation(); onMarkEarned(enrollment.id, !enrollment.earned); }}
                              className="w-6 h-6 flex items-center justify-center rounded-full transition-all"
                              style={{
                                background: enrollment.earned ? 'rgba(0,229,160,0.15)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${enrollment.earned ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.1)'}`,
                              }}
                              title={enrollment.earned ? 'Mark not earned' : 'Mark earned'}
                            >
                              <Check className="w-3 h-3" style={{ color: enrollment.earned ? '#00e5a0' : 'rgba(255,255,255,0.3)' }} />
                            </button>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 100 ? 'linear-gradient(90deg, #00e5a0, #4ade80)' : pct >= 80 ? 'linear-gradient(90deg, #f59e0b, #c9a84c)' : 'linear-gradient(90deg, #c9a84c, #e8c76a)',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
