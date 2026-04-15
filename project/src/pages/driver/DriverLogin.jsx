import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { handleSupabaseError } from '../../utils/errorHandler';

export default function DriverLogin({ onLogin }) {
  const [query, setQuery] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('drivers').select('id, full_name, photo_data, tlc_number').eq('is_active', true).order('full_name').then(({ data, error }) => {
      if (error) handleSupabaseError(error, 'DriverLogin:loadDrivers', { fallback: 'Failed to load driver list.' });
      setDrivers(data || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!query.trim()) { setFiltered([]); return; }
    const q = query.toLowerCase();
    setFiltered(drivers.filter(d => d.full_name.toLowerCase().includes(q)));
  }, [query, drivers]);

  function handleSelect(driver) {
    setSelected(driver);
    setQuery(driver.full_name);
    setFiltered([]);
  }

  function handleStart(e) {
    e.preventDefault();
    if (!selected) return;
    onLogin({ id: selected.id, name: selected.full_name, photo: selected.photo_data });
  }

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center px-6" style={{ background: '#07090d' }}>
      <div className="flex flex-col items-center gap-8 w-full max-w-xs">
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '2px solid rgba(201,168,76,0.3)' }}
          >
            <span style={{ color: '#c9a84c', fontSize: 42, fontWeight: 800 }}>P</span>
          </div>
          <div className="text-center">
            <p style={{ color: '#c9a84c', fontSize: 22, fontWeight: 800, letterSpacing: '0.5px' }}>PENTHOUSE</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Driver App</p>
          </div>
        </div>

        <form onSubmit={handleStart} className="w-full flex flex-col gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder={loading ? 'Loading drivers...' : 'Search your name'}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null); }}
              disabled={loading}
              autoFocus
              required
              className="w-full text-center text-lg py-4 rounded-2xl"
              style={{ fontSize: 16, textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#e5e7eb' }}
            />
            {filtered.length > 0 && (
              <div
                className="absolute left-0 right-0 top-full mt-1 rounded-2xl overflow-hidden z-10"
                style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
              >
                {filtered.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleSelect(d)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(201,168,76,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {d.photo_data ? (
                      <img src={d.photo_data} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: '2px solid rgba(201,168,76,0.3)' }} />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-700" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
                        {d.full_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span style={{ color: '#e5e7eb', fontSize: 15 }}>{d.full_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)' }}>
              {selected.photo_data ? (
                <img src={selected.photo_data} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-700" style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
                  {selected.full_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p style={{ color: '#00e5a0', fontSize: 14, fontWeight: 600 }}>{selected.full_name}</p>
                {selected.tlc_number && <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>TLC #{selected.tlc_number}</p>}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={!selected}
            className="w-full py-5 rounded-2xl text-xl font-800 flex items-center justify-center gap-2 transition-all"
            style={{
              background: selected ? 'linear-gradient(135deg, #c9a84c, #b8983e)' : 'rgba(255,255,255,0.05)',
              color: selected ? '#07090d' : 'rgba(255,255,255,0.3)',
              fontWeight: 800,
              fontSize: 18,
              boxShadow: selected ? '0 8px 32px rgba(201,168,76,0.35)' : 'none',
              border: selected ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            Start Shift
          </button>
        </form>

        <button
          onClick={() => alert('Search for your name in the list\nAccept or reject trips within 30s\nTap map for navigation\nBreak button = 15 min timer')}
          className="text-sm"
          style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none' }}
        >
          How to use this app?
        </button>
      </div>
    </div>
  );
}
