import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { fbListen, fbSet, fbUpdate } from '../../lib/firebase';
import { MessageCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import ChatWindow from './ChatWindow';

export default function ChatPanel() {
  const { profile, drivers, company } = useApp();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const unsubscribers = useRef([]);

  useEffect(() => {
    loadThreads();
    return () => {
      unsubscribers.current.forEach(fn => fn && fn());
    };
  }, [profile?.role, company?.id, drivers.length]);

  const scopedDrivers = profile?.role === 'company' && company?.id
    ? drivers.filter(driver => driver.company_id === company.id)
    : drivers;

  const availableDrivers = scopedDrivers.filter(
    driver => driver.status === 'online' || driver.status === 'on_trip'
  );

  async function loadThreads() {
    unsubscribers.current.forEach(fn => fn && fn());
    unsubscribers.current = [];
    setActiveThread(prev => {
      if (!prev) return prev;
      if (profile?.role === 'company' && company?.id) {
        return scopedDrivers.some(driver => driver.id === prev.driver_id) ? prev : null;
      }
      return prev;
    });

    let driverIds = [];
    if (profile?.role === 'company' && company?.id) {
      driverIds = scopedDrivers
        .map(driver => driver.id)
        .filter(Boolean);

      if (!driverIds.length) {
        setThreads([]);
        setActiveThread(null);
        return;
      }
    }

    let query = supabase
      .from('chat_threads')
      .select('*, drivers(full_name, status, company_id)')
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (driverIds.length) {
      query = query.in('driver_id', driverIds);
    }

    const { data } = await query;
    if (!data) return;

    setThreads(data);
    data.forEach(thread => subscribeToThread(thread));
  }

  function subscribeToThread(thread) {
    const unsub = fbListen(`chats/${thread.id}/meta`, (meta) => {
      if (!meta) return;
      setThreads(prev => prev.map(t =>
        t.id === thread.id
          ? {
              ...t,
              last_message: meta.lastMessage,
              last_message_at: meta.lastAt,
              unread_dispatch_count: meta.unread_dispatch ?? meta.unread ?? t.unread_dispatch_count ?? 0,
              unread_driver_count: meta.unread_driver ?? t.unread_driver_count ?? 0,
            }
          : t
      ).sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)));
    });
    unsubscribers.current.push(unsub);
  }

  useEffect(() => {
    const total = threads.reduce((s, t) => s + (t.unread_dispatch_count || 0), 0);
    setUnreadTotal(total);
  }, [threads]);

  async function openOrCreateThread(driver) {
    if (!driver?.id) return;
    const existing = threads.find(t => t.driver_id === driver.id);
    if (existing) {
      setActiveThread(existing);
      clearUnread(existing.id);
      return;
    }

    const { data: newThread } = await supabase
      .from('chat_threads')
      .insert({
        driver_id: driver.id,
        dispatcher_id: profile?.id,
        last_message_at: new Date().toISOString(),
        unread_dispatch_count: 0,
        unread_driver_count: 0,
      })
      .select()
      .maybeSingle();

    if (newThread) {
      await fbSet(`chats/${newThread.id}/meta`, {
        lastMessage: '',
        lastAt: new Date().toISOString(),
        unread_dispatch: 0,
        unread_driver: 0,
      });
      setThreads(prev => [{ ...newThread, drivers: driver }, ...prev]);
      subscribeToThread(newThread);
      setActiveThread({ ...newThread, drivers: driver });
    }
  }

  async function clearUnread(threadId) {
    await fbUpdate(`chats/${threadId}/meta`, { unread_dispatch: 0 });
    await supabase.from('chat_threads').update({ unread_dispatch_count: 0 }).eq('id', threadId);
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, unread_dispatch_count: 0 } : t));
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-[60] w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all"
        style={{ background: 'linear-gradient(135deg, #c9a84c, #a07830)', boxShadow: '0 4px 20px rgba(201,168,76,0.4)' }}
      >
        <MessageCircle className="w-5 h-5 text-black" />
        {unreadTotal > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-700"
            style={{ background: '#ff4757', color: '#fff', fontWeight: 700, fontSize: 10 }}>
            {unreadTotal > 9 ? '9+' : unreadTotal}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-[60] flex gap-3 items-end">
          {activeThread && (
            <ChatWindow
              thread={activeThread}
              profile={profile}
              onClose={() => setActiveThread(null)}
            />
          )}

          <div className="w-72 rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.25)', maxHeight: '70vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" style={{ color: '#c9a84c' }} />
                <span className="font-600 text-sm" style={{ color: '#c9a84c', fontWeight: 600 }}>Dispatch Chat</span>
                {unreadTotal > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-700" style={{ background: '#ff4757', color: '#fff', fontWeight: 700, fontSize: 10 }}>
                    {unreadTotal}
                  </span>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md btn-ghost">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {threads.length === 0 ? (
                <div className="p-6 text-center">
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No active chats</p>
                  <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 4 }}>Click a driver below to start</p>
                </div>
              ) : (
                threads.map(thread => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    active={activeThread?.id === thread.id}
                    onClick={() => { setActiveThread(thread); clearUnread(thread.id); }}
                  />
                ))
              )}
            </div>

            <div className="border-t px-3 py-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Start chat with driver</p>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {availableDrivers.slice(0, 8).map(d => (
                  <button
                    key={d.id}
                    onClick={() => openOrCreateThread(d)}
                    className="px-3 py-2 rounded-lg text-xs flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: d.status === 'on_trip' ? '#c9a84c' : '#00e5a0' }} />
                    {d.full_name?.split(' ')[0]}
                  </button>
                ))}
                {availableDrivers.length === 0 && (
                  <div className="w-full rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                    No online drivers are available to chat yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ThreadRow({ thread, active, onClick }) {
  const driverName = thread.drivers?.full_name || 'Driver';
  const status = thread.drivers?.status || 'offline';
  const statusColor = status === 'online' ? '#00e5a0' : status === 'on_trip' ? '#c9a84c' : '#6b7280';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
      style={{ background: active ? 'rgba(201,168,76,0.08)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
          style={{ background: 'rgba(201,168,76,0.15)', color: '#c9a84c', fontWeight: 700 }}>
          {driverName[0]}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black"
          style={{ background: statusColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-600 truncate" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driverName}</p>
        {thread.last_message && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{thread.last_message}</p>
        )}
      </div>
      {(thread.unread_dispatch_count || 0) > 0 && (
        <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs flex-shrink-0"
          style={{ background: '#ff4757', color: '#fff', fontSize: 9, fontWeight: 700 }}>
          {thread.unread_dispatch_count}
        </span>
      )}
    </button>
  );
}
