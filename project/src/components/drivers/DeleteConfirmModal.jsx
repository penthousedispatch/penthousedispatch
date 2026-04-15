import React, { useState } from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';

export default function DeleteConfirmModal({
  title,
  subtitle,
  names,
  requireTyping,
  confirmWord = 'DELETE ALL',
  confirmLabel = 'Permanently Delete',
  onConfirm,
  onClose,
  loading,
}) {
  const [typed, setTyped] = useState('');

  const canConfirm = requireTyping ? typed === confirmWord : true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: '#0d1117', border: '1px solid rgba(255,71,87,0.3)', boxShadow: '0 0 60px rgba(255,71,87,0.12)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,71,87,0.15)', background: 'rgba(255,71,87,0.04)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.25)' }}
            >
              <Trash2 className="w-4 h-4" style={{ color: '#ff4757' }} />
            </div>
            <div>
              <p className="text-sm font-700" style={{ fontWeight: 700, color: '#ff4757' }}>{title}</p>
              {subtitle && (
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{subtitle}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div
            className="flex items-start gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.15)' }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              This action is <strong style={{ color: '#ff4757' }}>permanent and cannot be undone</strong>.
              Driver records, assignments, and all associated data will be removed from the database immediately.
            </p>
          </div>

          {names && names.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                <p className="text-xs font-600" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                  {names.length} driver{names.length > 1 ? 's' : ''} will be deleted:
                </p>
              </div>
              <div className="max-h-36 overflow-y-auto p-2 space-y-1">
                {names.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,71,87,0.05)' }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'rgba(255,71,87,0.5)' }} />
                    <p className="text-xs" style={{ color: '#e5e7eb' }}>{name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {requireTyping && (
            <div>
              <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Type <strong style={{ color: '#ff4757', letterSpacing: 1 }}>{confirmWord}</strong> to confirm:
              </p>
              <input
                type="text"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={confirmWord}
                className="w-full text-sm"
                style={{
                  background: 'rgba(255,71,87,0.05)',
                  border: `1px solid ${typed === confirmWord ? 'rgba(255,71,87,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  color: '#e5e7eb',
                  outline: 'none',
                  fontFamily: 'monospace',
                  letterSpacing: 1,
                }}
                autoFocus
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-600 btn-ghost"
              style={{ fontWeight: 600 }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={!canConfirm || loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-700 flex items-center justify-center gap-2"
              style={{
                background: canConfirm && !loading ? '#ff4757' : 'rgba(255,71,87,0.2)',
                color: canConfirm && !loading ? '#fff' : 'rgba(255,71,87,0.4)',
                fontWeight: 700,
                transition: 'all 0.2s',
                cursor: canConfirm && !loading ? 'pointer' : 'not-allowed',
                border: 'none',
              }}
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {loading ? 'Deleting...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
