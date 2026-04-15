import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, ShieldCheck, RefreshCw } from 'lucide-react';

const ROLES = ['admin', 'dispatcher', 'company', 'driver'];

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
    setLoading(false);
  }

  async function updateRole(userId, newRole) {
    setSaving(userId);
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    setSaving(null);
    await loadUsers();
  }

  const roleColor = { admin: '#c9a84c', dispatcher: '#0ea5e9', company: '#00e5a0', driver: '#f59e0b' };

  return (
    <div className="h-full overflow-y-auto p-6" style={{ color: '#e5e7eb' }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-700 mb-1" style={{ fontWeight: 700, color: '#c9a84c' }}>Users</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Manage user roles across all tenants</p>
          </div>
          <button onClick={loadUsers} className="btn-ghost px-3 py-2 flex items-center gap-1.5 text-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#c9a84c', borderTopColor: 'transparent' }} />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
            <Users className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No users found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(user => (
              <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-700 flex-shrink-0" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c', border: '2px solid rgba(201,168,76,0.25)', fontWeight: 700 }}>
                  {user.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-600 text-sm" style={{ fontWeight: 600 }}>{user.full_name || 'Unknown'}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {user.role === 'admin' && <ShieldCheck className="w-4 h-4" style={{ color: '#c9a84c' }} />}
                  <select
                    value={user.role || 'dispatcher'}
                    onChange={e => updateRole(user.id, e.target.value)}
                    disabled={saving === user.id}
                    className="text-xs py-1.5 pl-2 pr-6"
                    style={{
                      background: `${roleColor[user.role] || '#c9a84c'}15`,
                      border: `1px solid ${roleColor[user.role] || '#c9a84c'}40`,
                      borderRadius: 8,
                      color: roleColor[user.role] || '#c9a84c',
                      fontWeight: 600,
                    }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
