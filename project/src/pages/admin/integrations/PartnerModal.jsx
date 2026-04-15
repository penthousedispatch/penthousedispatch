import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw } from 'lucide-react';

const AUTH_TYPES = ['api_key', 'basic', 'bearer', 'oauth2', 'none'];
const CATEGORIES = ['dispatch', 'billing', 'mapping', 'analytics', 'communication', 'compliance', 'custom'];

const BLANK = {
  name: '', slug: '', description: '', category: 'dispatch',
  logo_initial: '', logo_color: '#c9a84c',
  sandbox_enabled: true, sandbox_base_url: '', sandbox_auth_type: 'api_key',
  sandbox_api_key: '', sandbox_username: '', sandbox_password: '',
  prod_enabled: false, prod_base_url: '', prod_auth_type: 'api_key',
  prod_api_key: '', prod_username: '', prod_password: '',
  health_endpoint: '', docs_url: '', contact_email: '',
};

export default function PartnerModal({ partner, onSave, onClose, saving }) {
  const [form, setForm] = useState(BLANK);

  useEffect(() => {
    if (partner) {
      setForm({ ...BLANK, ...partner });
    } else {
      setForm(BLANK);
    }
  }, [partner]);

  function set(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
    if (key === 'name' && !partner) {
      setForm(prev => ({ ...prev, [key]: val, slug: val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  const isEdit = !!partner?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>
            {isEdit ? `Edit: ${partner.name}` : 'Add Integration Partner'}
          </p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 flex flex-col gap-5">
          <section>
            <p className="text-xs font-600 mb-3 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Partner Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Name *</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required className="w-full text-sm px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Slug *</label>
                <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)} required className="w-full text-sm px-3 py-2 rounded-xl font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
              </div>
              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className="w-full text-sm px-3 py-2 rounded-xl resize-none" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Category</label>
                <select value={form.category} onChange={e => set('category', e.target.value)} className="w-full text-sm px-3 py-2 rounded-xl capitalize" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Logo Initial</label>
                  <input type="text" maxLength={2} value={form.logo_initial} onChange={e => set('logo_initial', e.target.value)} className="w-full text-sm px-3 py-2 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} placeholder="S" />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Color</label>
                  <input type="color" value={form.logo_color} onChange={e => set('logo_color', e.target.value)} className="w-full h-9 rounded-xl cursor-pointer" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', outline: 'none', padding: '2px' }} />
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-600 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Sandbox Environment</p>
              <div
                className="relative w-8 h-4 rounded-full cursor-pointer transition-colors"
                style={{ background: form.sandbox_enabled ? '#0ea5e9' : 'rgba(255,255,255,0.15)' }}
                onClick={() => set('sandbox_enabled', !form.sandbox_enabled)}
              >
                <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: form.sandbox_enabled ? '17px' : '2px' }} />
              </div>
            </div>
            {form.sandbox_enabled && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl" style={{ background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.1)' }}>
                <div className="col-span-2">
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Sandbox Base URL</label>
                  <input type="text" value={form.sandbox_base_url} onChange={e => set('sandbox_base_url', e.target.value)} placeholder="https://api.sandbox.partner.com" className="w-full text-xs px-3 py-2 rounded-xl font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Auth Type</label>
                  <select value={form.sandbox_auth_type} onChange={e => set('sandbox_auth_type', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}>
                    {AUTH_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                {form.sandbox_auth_type === 'api_key' && (
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>API Key</label>
                    <input type="password" value={form.sandbox_api_key} onChange={e => set('sandbox_api_key', e.target.value)} placeholder="sk_test_..." className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                  </div>
                )}
                {form.sandbox_auth_type === 'basic' && (
                  <>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Username</label>
                      <input type="text" value={form.sandbox_username} onChange={e => set('sandbox_username', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Password</label>
                      <input type="password" value={form.sandbox_password} onChange={e => set('sandbox_password', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                    </div>
                  </>
                )}
                {form.sandbox_auth_type === 'bearer' && (
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Bearer Token</label>
                    <input type="password" value={form.sandbox_api_key} onChange={e => set('sandbox_api_key', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                  </div>
                )}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-600 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Production Environment</p>
              <div
                className="relative w-8 h-4 rounded-full cursor-pointer transition-colors"
                style={{ background: form.prod_enabled ? '#00e5a0' : 'rgba(255,255,255,0.15)' }}
                onClick={() => set('prod_enabled', !form.prod_enabled)}
              >
                <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: form.prod_enabled ? '17px' : '2px' }} />
              </div>
            </div>
            {form.prod_enabled && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,229,160,0.03)', border: '1px solid rgba(0,229,160,0.1)' }}>
                <div className="col-span-2">
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Production Base URL</label>
                  <input type="text" value={form.prod_base_url} onChange={e => set('prod_base_url', e.target.value)} placeholder="https://api.partner.com" className="w-full text-xs px-3 py-2 rounded-xl font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Auth Type</label>
                  <select value={form.prod_auth_type} onChange={e => set('prod_auth_type', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}>
                    {AUTH_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>API Key / Token</label>
                  <input type="password" value={form.prod_api_key} onChange={e => set('prod_api_key', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
                </div>
              </div>
            )}
          </section>

          <section>
            <p className="text-xs font-600 mb-3 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>Extra</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Health Check Endpoint</label>
                <input type="text" value={form.health_endpoint} onChange={e => set('health_endpoint', e.target.value)} placeholder="/health or /ping" className="w-full text-xs px-3 py-2 rounded-xl font-mono" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Docs URL</label>
                <input type="text" value={form.docs_url} onChange={e => set('docs_url', e.target.value)} placeholder="https://..." className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Contact Email</label>
                <input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} className="w-full text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }} />
              </div>
            </div>
          </section>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-gold flex items-center gap-2 px-5 py-2 text-sm">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Partner'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
