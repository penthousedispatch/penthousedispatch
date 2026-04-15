import React, { useState } from 'react';
import { Search, Zap, Clock, CheckCircle, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Bot } from 'lucide-react';
import { useSecurity } from '../../../context/SecurityContext';

const PRESETS = [
  { label: 'Brute Force Attack', topic: 'brute force credential attack', query: 'failed login attempts password spraying' },
  { label: 'Phishing Campaign', topic: 'phishing social engineering', query: 'email phishing spear phishing credential harvesting' },
  { label: 'Ransomware', topic: 'ransomware data encrypted for impact', query: 'file encryption ransom payment C2 communication' },
  { label: 'Lateral Movement', topic: 'lateral movement remote services', query: 'internal network pivot compromise spread' },
  { label: 'Data Exfiltration', topic: 'exfiltration C2 channel data theft', query: 'unauthorized data transfer sensitive information leak' },
  { label: 'Privilege Escalation', topic: 'privilege escalation abuse elevation', query: 'sudo bypass UAC administrator access' },
  { label: 'Credential Theft', topic: 'credential access unsecured credentials', query: 'password dump hash extraction keylogger' },
  { label: 'Supply Chain', topic: 'supply chain attack ingress tool transfer', query: 'third party compromise malicious package dependency' },
];

const STATUS_COLOR = { pending: '#f59e0b', running: '#0ea5e9', completed: '#00e5a0', failed: '#ff4757' };
const STATUS_ICON = {
  pending: Clock,
  running: RefreshCw,
  completed: CheckCircle,
  failed: AlertTriangle,
};

export default function ThreatResearch() {
  const { researchJobs, researching, startResearch } = useSecurity();
  const [topic, setTopic] = useState('');
  const [query, setQuery] = useState('');
  const [expandedJob, setExpandedJob] = useState(null);

  async function handleResearch() {
    if (!topic.trim()) return;
    await startResearch(topic.trim(), query.trim());
    setTopic('');
    setQuery('');
  }

  function loadPreset(p) {
    setTopic(p.topic);
    setQuery(p.query);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>AI Threat Research</h3>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          The AI engine researches threats, maps them to MITRE ATT&amp;CK, and auto-generates threat records
        </p>
      </div>

      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4" style={{ color: '#0ea5e9' }} />
          <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>New Research Job</span>
        </div>

        <div>
          <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Threat Topic *</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g. brute force attack, ransomware, lateral movement..."
            className="w-full text-sm px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
          />
        </div>

        <div>
          <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.4)' }}>Additional Context (optional)</label>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Add keywords or context for deeper analysis..."
            className="w-full text-sm px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
          />
        </div>

        <div>
          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Quick Presets</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => loadPreset(p)}
                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.15)', color: 'rgba(201,168,76,0.7)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleResearch}
          disabled={!topic.trim() || researching}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-600 transition-all"
          style={{
            background: topic.trim() && !researching ? 'rgba(14,165,233,0.15)' : 'rgba(14,165,233,0.05)',
            border: `1px solid ${topic.trim() && !researching ? 'rgba(14,165,233,0.35)' : 'rgba(14,165,233,0.1)'}`,
            color: topic.trim() && !researching ? '#0ea5e9' : 'rgba(14,165,233,0.3)',
            fontWeight: 600,
            cursor: topic.trim() && !researching ? 'pointer' : 'not-allowed',
          }}
        >
          {researching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {researching ? 'AI Researching...' : 'Launch AI Research'}
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>Research History</span>
        </div>
        {researchJobs.length === 0 ? (
          <div className="p-8 text-center">
            <Search className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No research jobs yet</p>
          </div>
        ) : (
          <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.04)' }}>
            {researchJobs.map(job => {
              const Icon = STATUS_ICON[job.status] || Clock;
              const isExpanded = expandedJob === job.id;
              const mappings = Array.isArray(job.mitre_mappings) ? job.mitre_mappings : [];
              return (
                <div key={job.id}>
                  <button
                    onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
                  >
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 ${job.status === 'running' ? 'animate-spin' : ''}`}
                      style={{ color: STATUS_COLOR[job.status] || '#888' }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb', fontWeight: 500 }}>{job.topic}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {job.status} &bull; {new Date(job.created_at).toLocaleString()}
                        {mappings.length > 0 && ` \u2022 ${mappings.length} MITRE mapping${mappings.length > 1 ? 's' : ''}`}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
                    )}
                  </button>
                  {isExpanded && job.findings && (
                    <div className="px-4 pb-4">
                      <div className="rounded-xl p-3" style={{ background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.1)' }}>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                          {job.findings.replace(/##\s/g, '').replace(/\*\*/g, '')}
                        </p>
                      </div>
                      {mappings.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          {mappings.map((m, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                              {m.technique_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
