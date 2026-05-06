import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Trash2, CheckCircle, Clock, Navigation, AlertCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { handleSupabaseError, toastSuccess } from '../../utils/errorHandler';
import AnimatedCar from '../../components/ui/AnimatedCar';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#4b5563', bg: 'rgba(75,85,99,0.15)' },
  accepted: { label: 'Accepted', color: '#00e5a0', bg: 'rgba(0,229,160,0.1)' },
  en_route: { label: 'En Route', color: '#c9a84c', bg: 'rgba(201,168,76,0.1)' },
  in_progress: { label: 'In Progress', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' },
  completed: { label: 'Completed', color: '#0ea5e9', bg: 'rgba(14,165,233,0.08)' },
  rejected: { label: 'Rejected', color: '#ff4757', bg: 'rgba(255,71,87,0.1)' },
};

export default function DispatchBoard() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadAssignments();
    const channel = supabase.channel('dispatch_board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_assignments' }, () => loadAssignments())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function loadAssignments() {
    const { data, error } = await supabase
      .from('trip_assignments')
      .select('*, drivers(full_name, photo_data, status)')
      .order('assigned_at', { ascending: false })
      .limit(200);
    if (error) {
      handleSupabaseError(error, 'DispatchBoard:loadAssignments', { fallback: 'Failed to load dispatch board.' });
    }
    setAssignments(data || []);
    setLoading(false);
  }

  async function updateStatus(id, status) {
    const { error } = await supabase
      .from('trip_assignments')
      .update({ status, ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}) })
      .eq('id', id);
    if (error) {
      handleSupabaseError(error, 'DispatchBoard:updateStatus', { fallback: 'Failed to update trip status.' });
      return;
    }
    await loadAssignments();
  }

  async function clearCompleted() {
    if (!confirm('Clear all completed trips from board?')) return;
    const completedIds = assignments.filter(a => a.status === 'completed').map(a => a.id);
    if (completedIds.length) {
      const { error } = await supabase.from('trip_assignments').delete().in('id', completedIds);
      if (error) {
        handleSupabaseError(error, 'DispatchBoard:clearCompleted', { fallback: 'Failed to clear completed trips.' });
        return;
      }
      await loadAssignments();
    }
  }

  function exportCSV() {
    const rows = [
      ['Trip ID', 'Driver', 'Status', 'Pickup', 'Dropoff', 'Time', 'Price', 'Assigned At'],
      ...assignments.map(a => [
        a.trip_id, a.driver_name, a.status, a.pu_address, a.do_address,
        a.pu_time, a.delivery_price, a.assigned_at
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dispatch_board_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const filtered = filter === 'all' ? assignments : assignments.filter(a => a.status === filter);
  const counts = Object.keys(STATUS_CONFIG).reduce((acc, k) => {
    acc[k] = assignments.filter(a => a.status === k).length;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-4">
          <p className="font-700 text-sm" style={{ fontWeight: 700 }}>Dispatch Board — {assignments.length} trips</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className="text-xs px-2.5 py-1 rounded-full transition-all"
              style={{
                background: filter === 'all' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === 'all' ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                border: '1px solid',
                borderColor: filter === 'all' ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.07)',
              }}
            >
              All ({assignments.length})
            </button>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              counts[k] > 0 && (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className="text-xs px-2.5 py-1 rounded-full transition-all"
                  style={{
                    background: filter === k ? v.bg : 'rgba(255,255,255,0.04)',
                    color: filter === k ? v.color : 'rgba(255,255,255,0.4)',
                    border: '1px solid',
                    borderColor: filter === k ? v.color + '40' : 'rgba(255,255,255,0.07)',
                  }}
                >
                  {v.label} ({counts[k]})
                </button>
              )
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearCompleted} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Clear Done
          </button>
          <button onClick={exportCSV} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
            <Download className="w-3 h-3" /> Export CSV
          </button>
          <button onClick={loadAssignments} className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-56 gap-4">
            <AnimatedCar size={40} color="#c9a84c" />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>Loading trips...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 gap-4">
            <AnimatedCar size={40} color="rgba(255,255,255,0.2)" />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>No trips in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(a => {
              const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
              const driver = a.drivers;
              const initials = driver?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
              return (
                <div
                  key={a.id}
                  className="rounded-xl p-3.5 flex flex-col gap-3 transition-all"
                  style={{ background: '#0d1117', border: `1px solid ${cfg.color}30` }}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-600"
                      style={{ background: cfg.bg, color: cfg.color, fontWeight: 600 }}
                    >
                      {cfg.label}
                    </span>
                    <span
                      className="text-xs font-mono min-w-0 max-w-[160px] truncate inline-block align-bottom text-right"
                      style={{ color: 'rgba(255,255,255,0.3)' }}
                      title={a.trip_id ? String(a.trip_id) : undefined}
                    >
                      {a.trip_id || '—'}
                    </span>
                  </div>

                  {driver && (
                    <div className="flex items-center gap-2">
                      {driver.photo_data ? (
                        <img src={driver.photo_data} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
                          {initials}
                        </div>
                      )}
                      <p className="text-xs font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{a.driver_name}</p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-start gap-1.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: '#00e5a0' }} />
                      <p className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.7)' }}>{a.pu_address || 'No pickup'}</p>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ background: '#ff4757' }} />
                      <p className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>{a.do_address || 'No dropoff'}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {a.pu_time && <span>{a.pu_time}</span>}
                    </div>
                    <span className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>
                      ${parseFloat(a.delivery_price || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex gap-1.5">
                    {a.status === 'pending' && (
                      <>
                        <button onClick={() => updateStatus(a.id, 'accepted')} className="flex-1 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600 }}>✓ Accept</button>
                        <button onClick={() => updateStatus(a.id, 'rejected')} className="w-8 py-1.5 rounded-lg text-xs flex items-center justify-center" style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.2)', color: '#ff4757' }}><X className="w-3 h-3" /></button>
                      </>
                    )}
                    {a.status === 'accepted' && (
                      <button onClick={() => updateStatus(a.id, 'en_route')} className="flex-1 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 600 }}>→ En Route</button>
                    )}
                    {a.status === 'en_route' && (
                      <button onClick={() => updateStatus(a.id, 'completed')} className="flex-1 py-1.5 rounded-lg text-xs font-600 transition-all" style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', color: '#0ea5e9', fontWeight: 600 }}>✓ Complete</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
