import React, { useState } from 'react';
import { Shield, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useSecurity } from '../../../context/SecurityContext';

const SEV_COLOR = { critical: '#ff4757', high: '#f59e0b', medium: '#0ea5e9', low: '#00e5a0' };

export default function MITREViewer() {
  const { mitreMap, threats } = useSecurity();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const tacticGroups = mitreMap.reduce((acc, t) => {
    if (!acc[t.tactic]) acc[t.tactic] = [];
    acc[t.tactic].push(t);
    return acc;
  }, {});

  const filteredGroups = Object.entries(tacticGroups).reduce((acc, [tactic, techs]) => {
    const q = search.toLowerCase();
    const filtered = techs.filter(t =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.technique_id.toLowerCase().includes(q) ||
      t.tactic.toLowerCase().includes(q)
    );
    if (filtered.length > 0) acc[tactic] = filtered;
    return acc;
  }, {});

  function getThreatCount(technique_id) {
    return threats.filter(t => t.technique_id === technique_id).length;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>MITRE ATT&amp;CK Framework</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {mitreMap.length} techniques across {Object.keys(tacticGroups).length} tactics
          </p>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search techniques..."
            className="text-xs pl-8 pr-3 py-2 rounded-xl w-56"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', outline: 'none' }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {Object.entries(filteredGroups).map(([tactic, techs]) => (
          <div key={tactic} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setExpanded(expanded === tactic ? null : tactic)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4" style={{ color: '#c9a84c' }} />
                <span className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{tactic}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(201,168,76,0.1)', color: '#c9a84c' }}>
                  {techs.length}
                </span>
              </div>
              {expanded === tactic ? (
                <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
              ) : (
                <ChevronRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
              )}
            </button>

            {expanded === tactic && (
              <div className="divide-y" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                {techs.map(tech => {
                  const threatCount = getThreatCount(tech.technique_id);
                  return (
                    <div key={tech.id} className="px-4 py-3 flex items-start gap-3" style={{ background: '#0d1117' }}>
                      <div className="flex-shrink-0 mt-0.5">
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9' }}>
                          {tech.technique_id}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{tech.name}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: `${SEV_COLOR[tech.severity]}12`, color: SEV_COLOR[tech.severity] }}>
                            {tech.severity}
                          </span>
                          {threatCount > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,71,87,0.1)', color: '#ff4757' }}>
                              {threatCount} detected
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1 line-clamp-2" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{tech.description}</p>
                        {tech.mitigation && (
                          <p className="text-xs mt-1" style={{ color: 'rgba(0,229,160,0.6)', lineHeight: 1.5 }}>
                            <span style={{ color: 'rgba(0,229,160,0.4)' }}>Mitigation: </span>{tech.mitigation}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {Object.keys(filteredGroups).length === 0 && (
          <div className="p-10 text-center rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No techniques match your search</p>
          </div>
        )}
      </div>
    </div>
  );
}
