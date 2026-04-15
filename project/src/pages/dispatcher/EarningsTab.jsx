import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, Award, Star, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';

const BADGES = [
  { type: 'sign_on', label: 'Sign-On Bonus', icon: '🎉', amount: 50, desc: 'First 10 trips' },
  { type: 'fifty_hour', label: '50-Hour Club', icon: '⏰', amount: 100, desc: '50+ hours in a week' },
  { type: 'perfect_week', label: 'Perfect Week', icon: '⭐', amount: 25, desc: 'Zero missed trips' },
  { type: 'five_day_streak', label: '5-Day Streak', icon: '🔥', amount: 20, desc: '5 consecutive days' },
  { type: 'referral', label: 'Referral Bonus', icon: '👥', amount: 75, desc: 'Referred driver (20 trips)' },
  { type: 'century_club', label: 'Century Club', icon: '💯', amount: 30, desc: '100 lifetime trips' },
];

function calcDriverPay(driver, totalRevenue, totalTrips, totalHours) {
  const rate = parseFloat(driver.pay_rate) || 0;
  const type = driver.pay_rate_type || 'hourly';
  if (type === 'per_trip') return rate * totalTrips;
  return rate * totalHours;
}

export default function EarningsTab() {
  const { drivers } = useApp();
  const [earnings, setEarnings] = useState([]);
  const [badges, setBadges] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [period, setPeriod] = useState('week');
  const [view, setView] = useState('rankings');

  useEffect(() => {
    loadEarnings();
    loadBadges();
  }, [period]);

  async function loadEarnings() {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 1;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from('driver_earnings')
      .select('*, drivers(full_name, photo_data)')
      .gte('earn_date', since)
      .order('earn_date', { ascending: false });
    setEarnings(data || []);
  }

  async function loadBadges() {
    const { data } = await supabase
      .from('incentive_badges')
      .select('*, drivers(full_name)')
      .order('earned_at', { ascending: false })
      .limit(50);
    setBadges(data || []);
  }

  const driverStats = drivers.map(driver => {
    const dEarnings = earnings.filter(e => e.driver_id === driver.id);
    const totalRev = dEarnings.reduce((s, e) => s + parseFloat(e.total_revenue || 0), 0);
    const totalTrips = dEarnings.reduce((s, e) => s + (e.trips_completed || 0), 0);
    const totalHours = dEarnings.reduce((s, e) => s + parseFloat(e.hours_worked || 0), 0);
    const totalBonuses = dEarnings.reduce((s, e) => s + parseFloat(e.bonuses || 0), 0);
    const driverBadges = badges.filter(b => b.driver_id === driver.id);
    const driverPay = calcDriverPay(driver, totalRev, totalTrips, totalHours);
    const netProfit = totalRev - driverPay;
    return { driver, totalRev, totalTrips, totalHours, totalBonuses, driverBadges, driverPay, netProfit };
  }).sort((a, b) => b.totalRev - a.totalRev);

  const totalRevAll = driverStats.reduce((s, d) => s + d.totalRev, 0);
  const totalPayAll = driverStats.reduce((s, d) => s + d.driverPay, 0);
  const totalProfitAll = totalRevAll - totalPayAll;

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {['rankings', 'breakdown'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="text-xs px-3 py-1.5 rounded-lg transition-all capitalize"
                style={{
                  background: view === v ? 'rgba(201,168,76,0.12)' : 'transparent',
                  color: view === v ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                  border: '1px solid',
                  borderColor: view === v ? 'rgba(201,168,76,0.2)' : 'transparent',
                  fontWeight: view === v ? 600 : 400,
                }}
              >
                {v === 'rankings' ? 'Driver Rankings' : 'Profit Breakdown'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {['day', 'week', 'month'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="text-xs px-2.5 py-1 rounded-full transition-all capitalize"
                style={{
                  background: period === p ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)',
                  color: period === p ? '#c9a84c' : 'rgba(255,255,255,0.4)',
                  border: '1px solid',
                  borderColor: period === p ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.07)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Net Profit</p>
            <p className="text-lg font-800" style={{ color: totalProfitAll >= 0 ? '#00e5a0' : '#ff4757', fontWeight: 800 }}>${totalProfitAll.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Revenue</p>
            <p className="text-lg font-800" style={{ color: '#c9a84c', fontWeight: 800 }}>${totalRevAll.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {view === 'breakdown' && (
          <div className="mb-5 grid grid-cols-3 gap-3">
            {[
              { label: 'Gross Revenue', value: totalRevAll, color: '#c9a84c', icon: TrendingUp },
              { label: 'Driver Pay', value: totalPayAll, color: '#f59e0b', icon: DollarSign },
              { label: 'Net Profit', value: totalProfitAll, color: totalProfitAll >= 0 ? '#00e5a0' : '#ff4757', icon: totalProfitAll >= 0 ? TrendingUp : TrendingDown },
            ].map(stat => (
              <div key={stat.label} className="rounded-xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</p>
                </div>
                <p className="text-xl font-800" style={{ color: stat.color, fontWeight: 800 }}>${stat.value.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <p className="text-xs font-700 uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Driver Rankings</p>
            {driverStats.map(({ driver, totalRev, totalTrips, totalHours, totalBonuses, driverBadges, driverPay, netProfit }, i) => (
              <div
                key={driver.id}
                className="rounded-xl p-4 cursor-pointer transition-all"
                style={{
                  background: selectedDriver === driver.id ? 'rgba(201,168,76,0.07)' : '#0d1117',
                  border: `1px solid ${selectedDriver === driver.id ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}
                onClick={() => setSelectedDriver(prev => prev === driver.id ? null : driver.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-800 flex-shrink-0"
                    style={{
                      background: i === 0 ? 'rgba(201,168,76,0.2)' : i === 1 ? 'rgba(156,163,175,0.1)' : 'rgba(255,255,255,0.05)',
                      color: i === 0 ? '#c9a84c' : i === 1 ? '#9ca3af' : 'rgba(255,255,255,0.4)',
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </div>
                  {driver.photo_data ? (
                    <img src={driver.photo_data} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-700 flex-shrink-0" style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', fontWeight: 700 }}>
                      {driver.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driver.full_name}</p>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
                        {driver.pay_rate_type === 'per_trip' ? `$${driver.pay_rate}/trip` : `$${driver.pay_rate}/hr`}
                      </span>
                      {driverBadges.map(b => (
                        <span key={b.id} title={BADGES.find(x => x.type === b.badge_type)?.label}>{BADGES.find(x => x.type === b.badge_type)?.icon}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <span>{totalTrips} trips</span>
                      <span>{totalHours.toFixed(1)}h</span>
                      {totalBonuses > 0 && <span style={{ color: '#c9a84c' }}>+${totalBonuses.toFixed(0)} bonus</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${totalRev.toFixed(2)}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      pay: <span style={{ color: '#f59e0b' }}>${driverPay.toFixed(2)}</span>
                    </p>
                  </div>
                </div>

                {selectedDriver === driver.id && (
                  <div className="mt-3 pt-3 grid grid-cols-3 gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-center">
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Gross Revenue</p>
                      <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>${totalRev.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Driver Pay</p>
                      <p className="text-sm font-700" style={{ color: '#f59e0b', fontWeight: 700 }}>${driverPay.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Net Profit</p>
                      <p className="text-sm font-700" style={{ color: netProfit >= 0 ? '#00e5a0' : '#ff4757', fontWeight: 700 }}>${netProfit.toFixed(2)}</p>
                    </div>
                  </div>
                )}

                {totalTrips > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (totalRev / Math.max(...driverStats.map(d => d.totalRev), 1)) * 100)}%`,
                          background: 'linear-gradient(90deg, #c9a84c, #e8c76a)',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-700 uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Incentive Badges</p>
            {BADGES.map(badge => {
              const earned = badges.filter(b => b.badge_type === badge.type);
              return (
                <div
                  key={badge.type}
                  className="rounded-xl p-3 flex items-center gap-3"
                  style={{
                    background: earned.length > 0 ? 'rgba(201,168,76,0.06)' : '#0d1117',
                    border: `1px solid ${earned.length > 0 ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <span className="text-xl">{badge.icon}</span>
                  <div className="flex-1">
                    <p className="text-xs font-600" style={{ color: earned.length > 0 ? '#c9a84c' : 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{badge.label}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{badge.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>+${badge.amount}</p>
                    {earned.length > 0 && (
                      <p className="text-xs" style={{ color: '#00e5a0' }}>{earned.length}x earned</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
