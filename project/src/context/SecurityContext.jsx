import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SecurityContext = createContext(null);

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-threat-research`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function SecurityProvider({ children }) {
  const [threats, setThreats] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [mitreMap, setMitreMap] = useState([]);
  const [researchJobs, setResearchJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [researching, setResearching] = useState(false);
  const [stats, setStats] = useState({ critical: 0, high: 0, medium: 0, low: 0, active: 0, mitigated: 0 });

  const loadAll = useCallback(async () => {
    const [t, a, m, r] = await Promise.all([
      supabase.from('security_threats').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('security_alerts').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('mitre_techniques').select('*').order('tactic').eq('is_active', true),
      supabase.from('threat_research_jobs').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    const threatData = t.data || [];
    setThreats(threatData);
    setAlerts(a.data || []);
    setMitreMap(m.data || []);
    setResearchJobs(r.data || []);
    setStats({
      critical: threatData.filter(x => x.severity === 'critical' && x.status === 'active').length,
      high: threatData.filter(x => x.severity === 'high' && x.status === 'active').length,
      medium: threatData.filter(x => x.severity === 'medium' && x.status === 'active').length,
      low: threatData.filter(x => x.severity === 'low' && x.status === 'active').length,
      active: threatData.filter(x => x.status === 'active').length,
      mitigated: threatData.filter(x => x.status === 'mitigated' || x.status === 'resolved').length,
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch(`${EDGE_URL}/scan`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      await loadAll();
      return data;
    } finally {
      setScanning(false);
    }
  }

  async function startResearch(topic, query = '') {
    setResearching(true);
    try {
      const { data: job } = await supabase.from('threat_research_jobs').insert({
        topic,
        query: query || topic,
        status: 'pending',
        triggered_by: 'manual',
      }).select().single();

      const res = await fetch(`${EDGE_URL}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, query, job_id: job?.id }),
      });
      const result = await res.json();
      await loadAll();
      return result;
    } finally {
      setResearching(false);
    }
  }

  async function updateThreatStatus(id, status) {
    await supabase.from('security_threats').update({
      status,
      updated_at: new Date().toISOString(),
      resolved_at: (status === 'resolved' || status === 'mitigated') ? new Date().toISOString() : null,
    }).eq('id', id);
    await loadAll();
  }

  async function acknowledgeAlert(id) {
    await supabase.from('security_alerts').update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  }

  async function ingestEvent(eventType, description, severity = 'medium', source = 'manual') {
    await supabase.from('security_events').insert({
      event_type: eventType,
      description,
      severity,
      source,
      processed: false,
    });
  }

  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged).length;

  return (
    <SecurityContext.Provider value={{
      threats, alerts, mitreMap, researchJobs, stats,
      loading, scanning, researching, unacknowledgedAlerts,
      loadAll, runScan, startResearch,
      updateThreatStatus, acknowledgeAlert, ingestEvent,
    }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
}
