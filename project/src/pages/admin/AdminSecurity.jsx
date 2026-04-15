import React, { useState } from 'react';
import { Shield, AlertTriangle, Search, List, Target, Bell } from 'lucide-react';
import { SecurityProvider, useSecurity } from '../../context/SecurityContext';
import SecurityDashboard from './security/SecurityDashboard';
import ThreatsList from './security/ThreatsList';
import ThreatDetail from './security/ThreatDetail';
import MITREViewer from './security/MITREViewer';
import ThreatResearch from './security/ThreatResearch';
import SecurityAlerts from './security/SecurityAlerts';

const TABS = [
  { id: 'dashboard', label: 'Overview', icon: Shield },
  { id: 'threats', label: 'Threats', icon: Target },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'research', label: 'AI Research', icon: Search },
  { id: 'mitre', label: 'MITRE ATT&CK', icon: List },
];

function SecurityContent() {
  const [tab, setTab] = useState('dashboard');
  const [viewThreat, setViewThreat] = useState(null);
  const { unacknowledgedAlerts, stats } = useSecurity();

  function handleViewThreat(t) {
    setViewThreat(t);
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.2)' }}>
            <Shield className="w-4 h-4" style={{ color: '#ff4757' }} />
          </div>
          <div>
            <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>AI Security System</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>MITRE ATT&amp;CK &bull; Threat Intelligence &bull; Auto-Research</p>
          </div>
        </div>
        {stats.critical > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.2)' }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ff4757' }} />
            <span className="text-xs font-600" style={{ color: '#ff4757', fontWeight: 600 }}>
              {stats.critical} CRITICAL
            </span>
          </div>
        )}
      </div>

      <div className="flex border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)', padding: '0 20px' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const badge = t.id === 'alerts' ? unacknowledgedAlerts : t.id === 'threats' ? stats.active : 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-3 text-xs font-500 relative transition-colors"
              style={{
                color: tab === t.id ? '#e5e7eb' : 'rgba(255,255,255,0.4)',
                fontWeight: tab === t.id ? 600 : 400,
                borderBottom: tab === t.id ? '2px solid #ff4757' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {badge > 0 && (
                <span className="text-xs px-1.5 rounded-full ml-0.5" style={{ background: 'rgba(255,71,87,0.15)', color: '#ff4757', fontSize: 10 }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'dashboard' && <SecurityDashboard onViewThreat={handleViewThreat} />}
        {tab === 'threats' && <ThreatsList onViewThreat={handleViewThreat} />}
        {tab === 'alerts' && <SecurityAlerts />}
        {tab === 'research' && <ThreatResearch />}
        {tab === 'mitre' && <MITREViewer />}
      </div>

      {viewThreat && (
        <ThreatDetail
          threat={viewThreat}
          onClose={() => setViewThreat(null)}
        />
      )}
    </div>
  );
}

export default function AdminSecurity() {
  return (
    <SecurityProvider>
      <SecurityContent />
    </SecurityProvider>
  );
}
