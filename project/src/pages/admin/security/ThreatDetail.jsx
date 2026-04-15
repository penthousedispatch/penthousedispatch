import React from 'react';
import { X, Shield, AlertTriangle, CheckCircle, Clock, Target, Zap } from 'lucide-react';
import { useSecurity } from '../../../context/SecurityContext';

const SEV_COLOR = { critical: '#ff4757', high: '#f59e0b', medium: '#0ea5e9', low: '#00e5a0' };
const STATUS_OPTS = ['active', 'investigating', 'mitigated', 'resolved', 'false_positive'];

export default function ThreatDetail({ threat, onClose }) {
  const { updateThreatStatus } = useSecurity();
  if (!threat) return null;

  const indicators = Array.isArray(threat.indicators) ? threat.indicators : [];
  const steps = Array.isArray(threat.mitigation_steps) ? threat.mitigation_steps : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}>
        <div className="flex items-start justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${SEV_COLOR[threat.severity]}15`, border: `1px solid ${SEV_COLOR[threat.severity]}30` }}>
              <Target className="w-4 h-4" style={{ color: SEV_COLOR[threat.severity] }} />
            </div>
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>{threat.title}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full font-600" style={{ background: `${SEV_COLOR[threat.severity]}15`, color: SEV_COLOR[threat.severity], fontWeight: 600 }}>
                  {threat.severity?.toUpperCase()}
                </span>
                {threat.technique_id && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                    {threat.technique_id}
                  </span>
                )}
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{threat.mitre_tactic}</span>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Confidence: {threat.confidence}%</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs font-600 mb-2" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>UPDATE STATUS</p>
            <div className="flex gap-2 flex-wrap">
              {STATUS_OPTS.map(s => (
                <button
                  key={s}
                  onClick={() => updateThreatStatus(threat.id, s)}
                  className="text-xs px-3 py-1.5 rounded-lg capitalize transition-all"
                  style={{
                    background: threat.status === s ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${threat.status === s ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: threat.status === s ? '#c9a84c' : 'rgba(255,255,255,0.5)',
                  }}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {threat.ai_analysis && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.12)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5" style={{ color: '#0ea5e9' }} />
                <span className="text-xs font-600" style={{ color: '#0ea5e9', fontWeight: 600 }}>AI ANALYSIS</span>
              </div>
              <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                {threat.ai_analysis.replace(/##\s/g, '').replace(/\*\*/g, '')}
              </div>
            </div>
          )}

          {indicators.length > 0 && (
            <div>
              <p className="text-xs font-600 mb-2" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>INDICATORS OF COMPROMISE</p>
              <div className="flex flex-col gap-1.5">
                {indicators.map((ind, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.1)' }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff4757' }} />
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{ind}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <p className="text-xs font-600 mb-2" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>MITIGATION STEPS</p>
              <div className="flex flex-col gap-1.5">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.1)' }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-700" style={{ background: 'rgba(0,229,160,0.15)', color: '#00e5a0', fontWeight: 700 }}>
                      {i + 1}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Detected By', value: threat.detected_by },
              { label: 'MITRE Tactic', value: threat.mitre_tactic },
              { label: 'Technique', value: threat.technique_id || threat.mitre_technique },
              { label: 'Detected', value: threat.created_at ? new Date(threat.created_at).toLocaleString() : '—' },
            ].map(f => (
              <div key={f.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{f.label}</p>
                <p className="text-xs font-500" style={{ color: '#e5e7eb', fontWeight: 500 }}>{f.value || '—'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
