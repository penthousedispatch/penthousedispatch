import React, { useState, useEffect } from 'react';
import { Check, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { toastError, toastSuccess } from '../../utils/errorHandler';

export default function PayRatesSection() {
  const { drivers, loadDrivers } = useApp();
  const [rates, setRates] = useState({});
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [errors, setErrors] = useState({});
  const [bulkRate, setBulkRate] = useState('');
  const [bulkType, setBulkType] = useState('hourly');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [bulkError, setBulkError] = useState('');

  useEffect(() => {
    const initial = {};
    drivers.forEach(d => {
      initial[d.id] = { pay_rate: d.pay_rate ?? 18, pay_rate_type: d.pay_rate_type || 'hourly' };
    });
    setRates(initial);
  }, [drivers]);

  function setRate(driverId, field, value) {
    setRates(prev => ({ ...prev, [driverId]: { ...prev[driverId], [field]: value } }));
  }

  async function saveDriver(driverId) {
    const r = rates[driverId];
    if (!r) return;
    setSaving(prev => ({ ...prev, [driverId]: true }));
    setErrors(prev => ({ ...prev, [driverId]: '' }));

    const { data, error } = await supabase
      .from('drivers')
      .update({
        pay_rate: parseFloat(r.pay_rate) || 0,
        pay_rate_type: r.pay_rate_type,
      })
      .eq('id', driverId)
      .select('id, pay_rate, pay_rate_type')
      .maybeSingle();

    if (error || !data) {
      setSaving(prev => ({ ...prev, [driverId]: false }));
      setSaved(prev => ({ ...prev, [driverId]: false }));
      setErrors(prev => ({
        ...prev,
        [driverId]: error?.message || 'No driver row was updated. Check your permissions and try again.',
      }));
      toastError(error?.message || 'Driver pay rate save failed.');
      return;
    }

    setSaving(prev => ({ ...prev, [driverId]: false }));
    setSaved(prev => ({ ...prev, [driverId]: true }));
    setRates(prev => ({
      ...prev,
      [driverId]: {
        pay_rate: data.pay_rate,
        pay_rate_type: data.pay_rate_type,
      },
    }));
    toastSuccess('Driver pay rate saved.');
    setTimeout(() => setSaved(prev => ({ ...prev, [driverId]: false })), 2000);
    await loadDrivers();
  }

  async function applyBulk() {
    if (!bulkRate) return;
    const targetDriverIds = drivers.map(driver => driver.id).filter(Boolean);
    if (!targetDriverIds.length) {
      setBulkError('No scoped drivers were found for this update.');
      toastError('No drivers available for bulk pay-rate update.');
      return;
    }
    setBulkSaving(true);
    setBulkMessage('');
    setBulkError('');

    const { data, error } = await supabase
      .from('drivers')
      .update({
        pay_rate: parseFloat(bulkRate),
        pay_rate_type: bulkType,
      })
      .in('id', targetDriverIds)
      .select('id');

    if (error || !data?.length) {
      setBulkSaving(false);
      setBulkError(error?.message || 'No driver rows were updated. Check your permissions and try again.');
      toastError(error?.message || 'Bulk pay-rate update failed.');
      return;
    }

    await loadDrivers();
    setRates(prev => {
      const next = { ...prev };
      targetDriverIds.forEach(driverId => {
        next[driverId] = {
          pay_rate: parseFloat(bulkRate),
          pay_rate_type: bulkType,
        };
      });
      return next;
    });
    setBulkSaving(false);
    setBulkMessage(`Applied $${parseFloat(bulkRate).toFixed(2)}/${bulkType === 'per_trip' ? 'trip' : 'hr'} to all drivers.`);
    toastSuccess('Bulk pay rates updated.');
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-700 mb-1" style={{ fontWeight: 700 }}>Driver Pay Rates</h2>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Set how much each driver earns — by the hour or per trip</p>
      </div>

      <div className="p-4 rounded-xl" style={{ background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.15)' }}>
        <p className="text-xs font-700 uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Bulk Set All Drivers</p>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {['hourly', 'per_trip'].map(t => (
              <button
                key={t}
                onClick={() => setBulkType(t)}
                className="px-3 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  background: bulkType === t ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: bulkType === t ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                  border: 'none',
                }}
              >
                {t === 'hourly' ? '$/hr' : '$/trip'}
              </button>
            ))}
          </div>
          <input
            type="number"
            min="0"
            step="0.5"
            value={bulkRate}
            onChange={e => setBulkRate(e.target.value)}
            placeholder={bulkType === 'hourly' ? 'Rate per hour' : 'Rate per trip'}
            className="flex-1"
          />
          <button
            onClick={applyBulk}
            disabled={!bulkRate || bulkSaving}
            className="btn-gold px-4 py-2 text-sm flex-shrink-0 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {bulkSaving ? 'Applying...' : 'Apply to All'}
          </button>
        </div>
        {bulkError && (
          <p className="text-xs mt-3" style={{ color: '#ff4757' }}>{bulkError}</p>
        )}
        {bulkMessage && !bulkError && (
          <p className="text-xs mt-3" style={{ color: '#00e5a0' }}>{bulkMessage}</p>
        )}
      </div>

      {drivers.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>No drivers found</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Driver', 'Pay Type', 'Rate', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontWeight: 600, fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.map(driver => {
                const r = rates[driver.id] || { pay_rate: 18, pay_rate_type: 'hourly' };
                return (
                  <tr key={driver.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div className="flex items-center gap-2">
                        {driver.photo_data ? (
                          <img src={driver.photo_data} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700 }}>
                            {driver.full_name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm" style={{ color: '#e5e7eb' }}>{driver.full_name}</p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', textTransform: 'capitalize' }}>{driver.status}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content' }}>
                        {['hourly', 'per_trip'].map(t => (
                          <button
                            key={t}
                            onClick={() => setRate(driver.id, 'pay_rate_type', t)}
                            className="px-2.5 py-1 rounded-md text-xs transition-all"
                            style={{
                              background: r.pay_rate_type === t ? 'rgba(201,168,76,0.15)' : 'transparent',
                              color: r.pay_rate_type === t ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                              border: 'none',
                            }}
                          >
                            {t === 'hourly' ? '$/hr' : '$/trip'}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={r.pay_rate}
                          onChange={e => setRate(driver.id, 'pay_rate', e.target.value)}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#e5e7eb', padding: '5px 8px', fontSize: 13, width: 80 }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div className="space-y-1.5">
                        <button
                          onClick={() => saveDriver(driver.id)}
                          disabled={saving[driver.id]}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                          style={{
                            background: saved[driver.id] ? 'rgba(0,229,160,0.1)' : 'rgba(201,168,76,0.1)',
                            border: `1px solid ${saved[driver.id] ? 'rgba(0,229,160,0.2)' : 'rgba(201,168,76,0.2)'}`,
                            color: saved[driver.id] ? '#00e5a0' : '#c9a84c',
                          }}
                        >
                          {saved[driver.id] ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                          {saved[driver.id] ? 'Saved' : saving[driver.id] ? 'Saving...' : 'Save'}
                        </button>
                        {errors[driver.id] && (
                          <p className="text-xs" style={{ color: '#ff4757', maxWidth: 180 }}>{errors[driver.id]}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
