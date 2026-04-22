import React, { useEffect, useRef, useState } from 'react';
import { X, Upload, CheckCircle, Camera, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

export const CSV_DRIVERS = [
  { first_name: 'BARTHELEMY', last_name: 'ADJAVEHOUEDE', phone: '6312029396', gender: 'Male', dob: '01/01/1960', license_number: '273447679', license_state: 'New York', license_class: 'E', tlc_number: '5596965', status: 'Active' },
  { first_name: 'RAKESH', last_name: 'DUBEY', phone: '9178485148', gender: 'Male', dob: '12/31/1970', license_number: '169418192', license_state: 'New York', license_class: 'E', tlc_number: '5991134', status: 'Active' },
  { first_name: 'Ingrid', last_name: 'Patrone', phone: '6462200186', gender: 'Female', dob: '03/20/1971', license_number: '569866876', license_state: 'New York', license_class: 'E', tlc_number: '5446004', status: 'Active' },
  { first_name: 'JEAN', last_name: 'SEIDE', phone: '5165895716', gender: 'Male', dob: '02/27/1983', license_number: '730776864', license_state: 'New York', license_class: 'C', tlc_number: '6080497', status: 'Active' },
  { first_name: 'MD NIZAR', last_name: 'HOSSAIN', phone: '3475828646', gender: 'Male', dob: '01/20/1975', license_number: '202902377', license_state: 'New York', license_class: 'E', tlc_number: '5780344', status: 'Active' },
  { first_name: 'MAJID', last_name: 'HASSAN', phone: '6318192003', gender: 'Male', dob: '07/06/1990', license_number: '427119340', license_state: 'New York', license_class: 'E', tlc_number: '6069561', status: 'Active' },
  { first_name: 'TIMOTHY', last_name: 'TARRY', phone: '9142235783', gender: 'Male', dob: '09/29/1993', license_number: '889207262', license_state: 'New York', license_class: 'E', tlc_number: '6105180', status: 'Active' },
  { first_name: 'ADNAN ALI', last_name: 'FOTIH', phone: '7187048719', gender: 'Male', dob: '03/22/1988', license_number: '634896400', license_state: 'New York', license_class: 'E', tlc_number: '5534909', status: 'Active' },
  { first_name: 'JULIO', last_name: 'SANCHEZ', phone: '', gender: '', dob: '05/26/1980', license_number: '420148919', license_state: 'New York', license_class: 'E', tlc_number: '6044417', status: 'Active' },
  { first_name: 'Sandeep', last_name: 'Singh', phone: '5593948519', gender: 'Male', dob: '12/02/1998', license_number: '342763208', license_state: 'New York', license_class: 'E', tlc_number: '6074041', status: 'Active' },
  { first_name: 'nazim', last_name: 'yetim', phone: '5168849112', gender: 'Male', dob: '07/20/1971', license_number: '796994155', license_state: 'New York', license_class: 'E', tlc_number: '5608052', status: 'Active' },
];

const COLUMN_ALIASES = {
  first_name: ['first_name', 'first name', 'firstname', 'fname', 'given name'],
  last_name: ['last_name', 'last name', 'lastname', 'lname', 'surname', 'family name'],
  phone: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'tel'],
  gender: ['gender', 'sex'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'birthday'],
  license_number: ['license_number', 'license number', 'license #', 'dl number', 'driver license'],
  license_state: ['license_state', 'license state', 'dl state', 'state'],
  license_class: ['license_class', 'license class', 'class', 'dl class'],
  tlc_number: ['tlc_number', 'tlc number', 'tlc', 'commercial license', 'commercial (tlc) license number', 'tlc license'],
  status: ['status', 'active', 'driver status'],
};

function normalizeHeader(raw) {
  const lower = raw.trim().toLowerCase().replace(/[^a-z0-9 _]/g, '');
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(lower)) return field;
  }
  return lower.replace(/ /g, '_');
}

function parseCSVRobust(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) return { rows: [], headers: [] };

  const rawHeaders = nonEmpty[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const headers = rawHeaders.map(normalizeHeader);

  const rows = nonEmpty.slice(1).map((line, rowIdx) => {
    const vals = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        vals.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    vals.push(cur.trim());

    const obj = { _rowIndex: rowIdx + 2 };
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(r => {
    const name = (r.first_name || '') + (r.last_name || '');
    return name.trim().length > 0;
  });

  return { rows, headers };
}

function isUniqueViolation(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('already exists');
}

function fleetImportFieldsMatch(existing, payload) {
  const eq = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
  return (
    eq(existing.full_name, payload.full_name)
    && eq(existing.phone, payload.phone)
    && eq(existing.license_number, payload.license_number)
    && eq(existing.license_state, payload.license_state)
    && eq(existing.license_class, payload.license_class)
    && eq(existing.gender, payload.gender)
    && eq(existing.dob, payload.dob)
    && Boolean(existing.is_active) === Boolean(payload.is_active)
  );
}

export default function CSVImportModal({ onClose, companyIdOverride = null, onImported = null }) {
  const { company, profile, user } = useApp();
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [mode, setMode] = useState('builtin');
  const [driverResults, setDriverResults] = useState([]);
  const [parseError, setParseError] = useState(null);
  const fileRef = useRef();
  const [resolvedCompanyId, setResolvedCompanyId] = useState(companyIdOverride || (profile?.role === 'company' ? company?.id || profile?.company_id || null : null));

  async function syncProfileCompanyId(companyId) {
    if (!user?.id || !companyId || profile?.company_id === companyId) return;
    await supabase
      .from('profiles')
      .update({ company_id: companyId, updated_at: new Date().toISOString() })
      .eq('id', user.id);
  }

  useEffect(() => {
    let mounted = true;

    async function resolveCompanyId() {
      if (companyIdOverride) {
        await syncProfileCompanyId(companyIdOverride);
        if (mounted) setResolvedCompanyId(companyIdOverride);
        return;
      }

      const directCompanyId = profile?.role === 'company' ? (company?.id || profile?.company_id || null) : null;
      if (directCompanyId) {
        await syncProfileCompanyId(directCompanyId);
        if (mounted) setResolvedCompanyId(directCompanyId);
        return;
      }

      if (!user?.id) {
        if (mounted) setResolvedCompanyId(null);
        return;
      }

      const normalizedEmail = String(user.email || '').trim().toLowerCase();
      const lookups = [
        supabase
          .from('companies')
          .select('id')
          .eq('owner_user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ];

      if (normalizedEmail) {
        lookups.push(
          supabase
            .from('companies')
            .select('id')
            .ilike('billing_contact_email', normalizedEmail)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        );
      }

      for (const lookup of lookups) {
        const { data } = await lookup;
        if (data?.id) {
          await syncProfileCompanyId(data.id);
          if (mounted) setResolvedCompanyId(data.id);
          return;
        }
      }

      if (mounted) setResolvedCompanyId(null);
    }

    resolveCompanyId();
    return () => { mounted = false; };
  }, [company?.id, companyIdOverride, profile?.company_id, profile?.role, user?.email, user?.id]);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setParseError(null);
    setResults(null);
    setDriverResults([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows } = parseCSVRobust(ev.target.result);
      if (rows.length === 0) {
        setParseError('No valid rows found. Make sure the file has a header row and at least one driver row.');
        setPreview(null);
        return;
      }
      setPreview(rows);
      setMode('upload');
    };
    reader.readAsText(file);
  }

  async function importDrivers(driverList) {
    if (!resolvedCompanyId) {
      setResults(null);
      setDriverResults([]);
      setParseError('No company is attached to this import session yet. Reopen the company Drivers tab and try again.');
      return;
    }

    setImporting(true);
    setParseError(null);
    const perDriverResults = [];
    const scopedCompanyId = resolvedCompanyId;

    for (const d of driverList) {
      const firstName = (d.first_name || '').trim();
      const lastName = (d.last_name || '').trim();
      const fullName = `${firstName} ${lastName}`.trim();
      if (!fullName) {
        perDriverResults.push({ name: '(blank row)', status: 'skipped', reason: 'No name provided' });
        continue;
      }

      const tlc = (d.tlc_number || '').trim();
      if (!tlc) {
        perDriverResults.push({ name: fullName, status: 'skipped', reason: 'No TLC number — required for deduplication' });
        continue;
      }

      const driverNum = 'D' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
      const rawStatus = (d.status || 'Active').trim().toLowerCase();
      const isActive = rawStatus === 'active' || rawStatus === '1' || rawStatus === 'yes';

      const payload = {
        driver_number: driverNum,
        full_name: fullName,
        phone: (d.phone || '').trim(),
        license_number: (d.license_number || '').trim(),
        license_state: (d.license_state || '').trim(),
        license_class: (d.license_class || '').trim(),
        tlc_number: tlc,
        gender: (d.gender || '').trim(),
        dob: (d.dob || '').trim(),
        company_id: resolvedCompanyId,
        status: 'offline',
        is_active: isActive,
      };

      const { data: existingRows, error: lookupError } = await supabase
        .from('drivers')
        .select('id, full_name, phone, company_id, is_active, license_number, license_state, license_class, gender, dob')
        .eq('tlc_number', tlc)
        .limit(1);

      const existing = Array.isArray(existingRows) && existingRows[0] ? existingRows[0] : null;
      let error = lookupError || null;
      let finalStatus = 'failed';
      let finalReason = lookupError?.message || 'Database error';

      if (!error && existing) {
        if (fleetImportFieldsMatch(existing, payload) && String(existing.company_id || '') === String(scopedCompanyId || '')) {
          finalStatus = 'unchanged';
          finalReason = 'Same TLC — row already matches this import (no edit needed).';
          perDriverResults.push({ name: fullName, status: finalStatus, reason: finalReason });
          continue;
        }

        const { error: updateError } = await supabase
          .from('drivers')
          .update({
            ...payload,
            company_id: scopedCompanyId,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        error = updateError || null;
        if (!error) {
          finalStatus = 'updated';
          finalReason =
            existing.company_id && String(existing.company_id) !== String(scopedCompanyId)
              ? `TLC found — attached to this company (was: ${existing.full_name || 'other company'})`
              : 'TLC found — row updated from this import.';
        }
      } else if (!error) {
        const { error: insertError } = await supabase
          .from('drivers')
          .insert(payload);
        error = insertError || null;
        if (!error) {
          finalStatus = 'added';
          finalReason = 'New driver added';
        } else if (isUniqueViolation(insertError)) {
          error = null;
          finalStatus = 'unchanged';
          finalReason = 'TLC already in database (unique) — not duplicated. Existing record kept.';
        }
      }

      if (!error) {
        perDriverResults.push({
          name: fullName,
          status: finalStatus,
          reason: finalReason,
        });
      } else {
        perDriverResults.push({
          name: fullName,
          status: 'failed',
          reason: error.message || 'Database error',
        });
      }
    }

    const added = perDriverResults.filter(r => r.status === 'added').length;
    const updated = perDriverResults.filter(r => r.status === 'updated').length;
    const unchanged = perDriverResults.filter(r => r.status === 'unchanged').length;
    const skipped = perDriverResults.filter(r => r.status === 'skipped').length;
    const failed = perDriverResults.filter(r => r.status === 'failed').length;

    setDriverResults(perDriverResults);
    setResults({ added, updated, unchanged, skipped, failed });
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
    if ((added > 0 || updated > 0 || unchanged > 0) && typeof onImported === 'function') {
      onImported({
        companyId: scopedCompanyId,
        added,
        updated,
        unchanged,
        skipped,
        failed,
        records: perDriverResults,
      });
    }
  }

  const statusColor = (s) => ({
    added: '#00e5a0',
    updated: '#c9a84c',
    unchanged: '#7dd3fc',
    skipped: 'rgba(255,255,255,0.3)',
    failed: '#ff4757',
  }[s] || 'rgba(255,255,255,0.3)');

  const statusIcon = (s) => ({
    added: '✓',
    updated: '↻',
    unchanged: '=',
    skipped: '–',
    failed: '✕',
  }[s] || '–');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:flex sm:items-center sm:justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="mx-auto flex w-full max-w-lg flex-col rounded-2xl animate-slide-up overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <p className="font-700 text-sm" style={{ fontWeight: 700 }}>Import Drivers</p>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg btn-ghost">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {results ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-8 h-8 flex-shrink-0" style={{ color: results.failed > 0 ? '#c9a84c' : '#00e5a0' }} />
                <div>
                  <p className="font-700 text-sm" style={{ fontWeight: 700, color: results.failed > 0 ? '#c9a84c' : '#00e5a0' }}>Import Complete</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <span style={{ color: '#00e5a0' }}>{results.added} added</span>
                    {' · '}
                    <span style={{ color: '#c9a84c' }}>{results.updated} updated</span>
                    {' · '}
                    <span style={{ color: '#7dd3fc' }}>{results.unchanged ?? 0} unchanged</span>
                    {' · '}
                    <span style={{ color: 'rgba(255,255,255,0.35)' }}>{results.skipped} skipped</span>
                    {results.failed > 0 && <span style={{ color: '#ff4757' }}> · {results.failed} failed</span>}
                  </p>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="max-h-64 overflow-y-auto">
                  {driverResults.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3 py-2"
                      style={{
                        borderBottom: i < driverResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      }}
                    >
                      <span className="text-xs font-700 w-4 text-center flex-shrink-0" style={{ color: statusColor(r.status), fontWeight: 700 }}>
                        {statusIcon(r.status)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-500 truncate" style={{ color: '#e5e7eb' }}>{r.name}</p>
                        <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{r.reason}</p>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{
                        background: `${statusColor(r.status)}18`,
                        color: statusColor(r.status),
                        fontSize: 10,
                      }}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {results.failed > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {results.failed} driver{results.failed > 1 ? 's' : ''} failed to import. Check the error reason above, fix the data, and retry.
                  </p>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                <Camera className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#c9a84c' }} />
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Visit the fleet panel to upload a photo for each driver. Riders see the driver photo on their tracking page.
                </p>
              </div>

              <button onClick={onClose} className="btn-gold w-full py-2.5">Done</button>
            </div>
          ) : (
            <>
              <div className="flex rounded-xl overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {['builtin', 'upload'].map(m => (
                  <button key={m} onClick={() => { setMode(m); setParseError(null); setPreview(null); }} className="flex-1 py-2 text-sm transition-all" style={{
                    background: mode === m ? 'rgba(201,168,76,0.1)' : 'transparent',
                    color: mode === m ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                    fontWeight: mode === m ? 600 : 400,
                    border: 'none',
                  }}>
                    {m === 'builtin' ? 'Load Fleet Drivers' : 'Upload CSV File'}
                  </button>
                ))}
              </div>

              {mode === 'builtin' && (
                <div>
                  <div className="flex items-start gap-2 p-3 rounded-xl mb-3" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#00e5a0' }} />
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      These fleet records attach to this company and stay in the company dashboard until the company deletes them.
                    </p>
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {CSV_DRIVERS.length} fleet drivers ready to import:
                  </p>
                  <div className="space-y-1.5 max-h-52 overflow-y-auto mb-4">
                    {CSV_DRIVERS.map((d, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <p className="text-sm font-500" style={{ color: '#e5e7eb' }}>{d.first_name} {d.last_name}</p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>TLC: {d.tlc_number} · Class {d.license_class}</p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,160,0.1)', color: '#00e5a0' }}>Active</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => importDrivers(CSV_DRIVERS)}
                    disabled={importing}
                    className="btn-gold w-full py-3 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {importing ? 'Importing...' : `Import ${CSV_DRIVERS.length} Fleet Drivers`}
                  </button>
                </div>
              )}

              {mode === 'upload' && (
                <div>
                  {!resolvedCompanyId && (
                    <div className="flex items-start gap-2 p-3 rounded-xl mb-3" style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)' }}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
                      <p className="text-xs" style={{ color: '#ffb3bb' }}>
                        A company must be selected before CSV drivers can be imported.
                      </p>
                    </div>
                  )}
                  <label
                    className="flex flex-col items-center justify-center h-32 rounded-xl cursor-pointer transition-all"
                    style={{ border: '2px dashed rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.04)' }}
                  >
                    <Upload className="w-8 h-8 mb-2" style={{ color: 'rgba(201,168,76,0.6)' }} />
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Click to upload CSV</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Supports quoted fields, mixed case headers</p>
                    <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
                  </label>

                  {parseError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl mt-3" style={{ background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)' }}>
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#ff4757' }} />
                      <p className="text-xs" style={{ color: '#ff4757' }}>{parseError}</p>
                    </div>
                  )}

                  {preview && !parseError && (
                    <div className="mt-3">
                      <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {preview.length} driver rows detected — preview:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto mb-3">
                        {preview.slice(0, 5).map((d, i) => (
                          <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <p className="text-xs" style={{ color: '#e5e7eb' }}>{d.first_name || '?'} {d.last_name || '?'}</p>
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>TLC: {d.tlc_number || 'missing'}</span>
                          </div>
                        ))}
                        {preview.length > 5 && (
                          <p className="text-xs text-center py-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            +{preview.length - 5} more rows
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => importDrivers(preview)}
                        disabled={importing}
                        className="btn-gold w-full py-3"
                      >
                        {importing ? 'Importing...' : `Import ${preview.length} Drivers`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
