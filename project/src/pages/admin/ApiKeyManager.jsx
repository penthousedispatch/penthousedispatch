import React, { useState, useEffect, useCallback } from 'react';
import {
  Key, Plus, Copy, Trash2, RefreshCw, Eye, EyeOff,
  CheckCircle, XCircle, AlertTriangle, Shield, Clock, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

const SCOPES = [
  { key: 'trips:read', label: 'Read Trips', desc: 'List and view trip data' },
  { key: 'trips:write', label: 'Write Trips', desc: 'Create and update trips' },
  { key: 'drivers:read', label: 'Read Drivers', desc: 'List and view driver profiles' },
  { key: 'assignments:read', label: 'Read Assignments', desc: 'View trip assignments' },
  { key: 'assignments:write', label: 'Write Assignments', desc: 'Create and update assignments' },
  { key: 'webhooks:receive', label: 'Receive Webhooks', desc: 'Accept inbound webhook payloads' },
  { key: 'reports:read', label: 'Read Reports', desc: 'Access analytics and reports' },
];

function generateKey() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return 'pk_' + Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

async function hashKey(key) {
  const enc = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function NewKeyModal({ orgId, onCreated, onClose }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['trips:read']);
  const [rateLimit, setRateLimit] = useState(60);
  const [expiry, setExpiry] = useState('');
  const [ipList, setIpList] = useState('');
  const [saving, setSaving] = useState(false);
  const [newKeyPlain, setNewKeyPlain] = useState(null);

  function toggleScope(key) {
    setScopes(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const plain = generateKey();
    const hash = await hashKey(plain);
    const prefix = plain.slice(0, 12);
    const ips = ipList.split('\n').map(s => s.trim()).filter(Boolean);
    await supabase.from('api_keys').insert({
      org_id: orgId,
      name: name.trim(),
      key_prefix: prefix,
      key_hash: hash,
      scopes,
      allowed_ips: ips,
      rate_limit_per_minute: rateLimit,
      expires_at: expiry || null,
      is_active: true,
    });
    setNewKeyPlain(plain);
    setSaving(false);
    onCreated();
  }

  if (newKeyPlain) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
        <div className="mx-auto w-full max-w-md rounded-2xl p-6" style={{ background: '#0d1117', border: '1px solid rgba(0,229,160,0.2)' }}>
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-5 h-5" style={{ color: '#00e5a0' }} />
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>API Key Created</p>
          </div>
          <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
            Copy this key now — it will not be shown again.
          </p>
          <div
            className="flex items-center gap-2 p-3 rounded-xl mb-4 cursor-pointer"
            style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}
            onClick={() => navigator.clipboard?.writeText(newKeyPlain)}
          >
            <code className="flex-1 text-xs font-mono break-all" style={{ color: '#00e5a0' }}>{newKeyPlain}</code>
            <Copy className="w-4 h-4 flex-shrink-0" style={{ color: '#00e5a0' }} />
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-600"
            style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600 }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Create API Key</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Key Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Production Webhook Key"
              className="w-full text-xs p-2.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
            />
          </div>

          <div>
            <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Scopes</label>
            <div className="space-y-1.5">
              {SCOPES.map(s => (
                <div
                  key={s.key}
                  className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: scopes.includes(s.key) ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${scopes.includes(s.key) ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.05)'}`,
                  }}
                  onClick={() => toggleScope(s.key)}
                >
                  <div>
                    <p className="text-xs font-mono" style={{ color: scopes.includes(s.key) ? '#c9a84c' : 'rgba(255,255,255,0.5)' }}>{s.key}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{s.desc}</p>
                  </div>
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center"
                    style={{ background: scopes.includes(s.key) ? '#c9a84c' : 'rgba(255,255,255,0.08)', border: `1px solid ${scopes.includes(s.key) ? '#c9a84c' : 'rgba(255,255,255,0.1)'}` }}
                  >
                    {scopes.includes(s.key) && <CheckCircle className="w-3 h-3" style={{ color: '#07090d' }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Rate Limit (req/min)</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={rateLimit}
                onChange={e => setRateLimit(parseInt(e.target.value) || 60)}
                className="w-full text-xs p-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Expires At (optional)</label>
              <input
                type="date"
                value={expiry}
                onChange={e => setExpiry(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>IP Allowlist (one per line, empty = all IPs)</label>
            <textarea
              rows={3}
              value={ipList}
              onChange={e => setIpList(e.target.value)}
              placeholder="192.168.1.1&#10;10.0.0.0/8"
              className="w-full text-xs p-2.5 rounded-xl font-mono resize-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-600 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-600 flex items-center justify-center gap-2 transition-all"
              style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600, opacity: saving || !name.trim() ? 0.5 : 1 }}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Generate Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApiKeyManager() {
  const { org } = useApp();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    if (!org?.id) return;
    const { data } = await supabase.from('api_keys').select('*').eq('org_id', org.id).order('created_at', { ascending: false });
    setKeys(data || []);
    setLoading(false);
  }, [org?.id]);

  useEffect(() => { load(); }, [load]);

  async function revokeKey(id) {
    await supabase.from('api_keys').update({ is_active: false, revoked_at: new Date().toISOString() }).eq('id', id);
    load();
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ color: '#e5e7eb' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <Key className="w-4 h-4" style={{ color: '#c9a84c' }} />
          </div>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>API Key Manager</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Manage inbound API access — HMAC-signed, scoped, rate-limited</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl font-600"
          style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)', color: '#c9a84c', fontWeight: 600 }}
        >
          <Plus className="w-4 h-4" /> New Key
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Key className="w-10 h-10 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No API keys yet</p>
            <button onClick={() => setShowModal(true)} className="btn-gold px-4 py-2 text-sm mt-4">Create First Key</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="grid px-4 py-2.5 text-xs font-600 uppercase tracking-wider" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.5fr auto', color: 'rgba(255,255,255,0.3)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span>Name / Prefix</span>
                <span>Status</span>
                <span>Rate Limit</span>
                <span>Scopes</span>
                <span></span>
              </div>
              {keys.map(key => (
                <div
                  key={key.id}
                  className="grid items-center px-4 py-3 border-b last:border-0"
                  style={{ gridTemplateColumns: '2fr 1fr 1fr 1.5fr auto', borderColor: 'rgba(255,255,255,0.04)' }}
                >
                  <div>
                    <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{key.name}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{key.key_prefix}...</p>
                    {key.expires_at && (
                      <p className="text-xs mt-0.5" style={{ color: new Date(key.expires_at) < new Date() ? '#ff4757' : 'rgba(255,255,255,0.25)' }}>
                        Expires {new Date(key.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div>
                    {key.is_active ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00e5a0' }} />
                        <span className="text-xs" style={{ color: '#00e5a0' }}>Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ff4757' }} />
                        <span className="text-xs" style={{ color: '#ff4757' }}>Revoked</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{key.rate_limit_per_minute}/min</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(key.scopes || []).slice(0, 3).map(s => (
                      <span key={s} className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(201,168,76,0.08)', color: 'rgba(201,168,76,0.7)', fontSize: 9 }}>{s}</span>
                    ))}
                    {(key.scopes || []).length > 3 && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>+{key.scopes.length - 3}</span>
                    )}
                  </div>
                  <div>
                    {key.is_active && (
                      <button
                        onClick={() => revokeKey(key.id)}
                        className="p-1.5 rounded-lg transition-all"
                        style={{ color: 'rgba(255,71,87,0.5)' }}
                        title="Revoke key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4" style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.1)' }}>
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#c9a84c' }} />
                <div className="text-xs space-y-1" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  <p>Keys are stored as SHA-256 hashes — only the prefix is visible after creation. Treat keys like passwords.</p>
                  <p>Attach keys to integration requests using the <code style={{ color: '#c9a84c' }}>Authorization: Bearer pk_...</code> header.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <NewKeyModal
          orgId={org?.id}
          onCreated={load}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
