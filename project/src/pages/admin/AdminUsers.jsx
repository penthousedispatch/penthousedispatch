import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { normalizeAppRole } from '../../lib/roles';
import { ensurePlatformAdminOrg, isPlatformOwnerUser } from '../../lib/platformAdminOrg';
import { toastError, toastSuccess, toastWarn } from '../../utils/errorHandler';
import { Users, ShieldCheck, RefreshCw } from 'lucide-react';

const ROLES = ['admin', 'company', 'driver', 'rider'];

export default function AdminUsers() {
  const { isPlatformOwner, user: sessionUser } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
      toastError(error.message || 'Failed to load users.');
      setUsers([]);
      setLoading(false);
      return;
    }
    setUsers(data || []);
    setLoading(false);
  }

  async function updateRole(userRecord, nextRoleValue) {
    const currentRole = normalizeAppRole(userRecord?.role) || 'company';
    const nextRole = normalizeAppRole(nextRoleValue) || 'company';
    const isProtectedOwner = isPlatformOwnerUser({ email: userRecord?.email });

    if (currentRole === nextRole) return;

    if (isProtectedOwner && nextRole !== 'admin') {
      toastWarn('Platform owner emails must remain admin accounts.');
      return;
    }

    if (nextRole === 'admin' && !isPlatformOwner) {
      toastWarn('Only the platform owner can promote another user to admin.');
      return;
    }

    setSaving(userRecord.id);

    try {
      if (nextRole === 'admin') {
        const platformOrg = await ensurePlatformAdminOrg(sessionUser, { forceBootstrap: true });

        if (!platformOrg?.id) {
          throw new Error('No platform admin organization is available for this promotion.');
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: 'admin', company_id: null })
          .eq('id', userRecord.id);

        if (profileError) throw profileError;

        const { error: membershipError } = await supabase
          .from('org_members')
          .upsert(
            {
              org_id: platformOrg.id,
              user_id: userRecord.id,
              role: 'admin',
            },
            { onConflict: 'org_id,user_id' }
          );

        if (membershipError) throw membershipError;
      } else {
        const profilePayload = { role: nextRole };
        if (nextRole === 'rider') {
          profilePayload.company_id = null;
        }

        const { error: profileError } = await supabase
          .from('profiles')
          .update(profilePayload)
          .eq('id', userRecord.id);

        if (profileError) throw profileError;

        if (currentRole === 'admin') {
          const { error: membershipError } = await supabase
            .from('org_members')
            .delete()
            .eq('user_id', userRecord.id)
            .in('role', ['admin', 'superadmin']);

          if (membershipError) throw membershipError;
        }
      }

      toastSuccess(`${userRecord.full_name || userRecord.email || 'User'} is now ${nextRole}.`);
      await loadUsers();
    } catch (error) {
      toastError(error.message || 'Failed to save user role.');
    } finally {
      setSaving(null);
    }
  }

  const roleColor = { admin: '#c9a84c', company: '#00e5a0', driver: '#f59e0b', rider: '#60a5fa' };

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

        <div className="rounded-xl p-4 mb-5" style={{ background: isPlatformOwner ? 'rgba(0,229,160,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${isPlatformOwner ? 'rgba(0,229,160,0.2)' : 'rgba(245,158,11,0.2)'}` }}>
          <p className="text-sm font-600 mb-1" style={{ color: isPlatformOwner ? '#00e5a0' : '#f59e0b', fontWeight: 600 }}>
            {isPlatformOwner ? 'Owner Admin Controls Enabled' : 'Approval-Gated Admin Mode'}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {isPlatformOwner
              ? 'Only the platform owner can promote another user into an admin account.'
              : 'You can review users, but only the platform owner can create or promote admin accounts.'}
          </p>
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
                    value={normalizeAppRole(user.role) || 'company'}
                    onChange={e => updateRole(user, e.target.value)}
                    disabled={
                      saving === user.id ||
                      isPlatformOwnerUser({ email: user.email }) ||
                      (!isPlatformOwner && normalizeAppRole(user.role) === 'admin')
                    }
                    className="text-xs py-1.5 pl-2 pr-6"
                    style={{
                      background: `${roleColor[normalizeAppRole(user.role)] || '#c9a84c'}15`,
                      border: `1px solid ${roleColor[normalizeAppRole(user.role)] || '#c9a84c'}40`,
                      borderRadius: 8,
                      color: roleColor[normalizeAppRole(user.role)] || '#c9a84c',
                      fontWeight: 600,
                    }}
                  >
                    {ROLES.filter(r => isPlatformOwner || r !== 'admin').map(r => <option key={r} value={r}>{r}</option>)}
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
