import React, { useState, useEffect } from 'react';
import { onToast } from '../../utils/errorHandler';
import { X, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const ICONS = {
  success: <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#22c55e' }} />,
  warn: <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#f59e0b' }} />,
  error: <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#ef4444' }} />,
};

const BORDER = {
  success: 'rgba(34,197,94,0.35)',
  warn: 'rgba(245,158,11,0.35)',
  error: 'rgba(239,68,68,0.35)',
};

function Toast({ id, message, type, duration, onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(id), 320);
    }, duration);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'rgba(15,15,20,0.97)',
        border: `1px solid ${BORDER[type] || BORDER.error}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        maxWidth: '360px',
        fontSize: '13px',
        lineHeight: '1.45',
        color: '#e2e8f0',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(20px)',
        pointerEvents: 'all',
      }}
    >
      {ICONS[type] || ICONS.error}
      <span style={{ flex: 1, wordBreak: 'break-word' }}>{message}</span>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(id), 320); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, lineHeight: 1 }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = onToast(t => setToasts(prev => [...prev, t]));
    return unsub;
  }, []);

  const remove = id => setToasts(prev => prev.filter(t => t.id !== id));

  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <Toast key={t.id} {...t} onRemove={remove} />
      ))}
    </div>
  );
}
