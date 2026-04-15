import React, { useState, useEffect, useRef } from 'react';
import { fbListen, fbPush, fbUpdate, fbGet } from '../../lib/firebase';
import { MessageCircle, X, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const QUICK_REPLIES = ['On my way', 'Arrived', 'Running late', 'Need help'];

export default function DriverChat({ driverId, driverName, threadId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!threadId) return;
    const unsub = fbListen(`chats/${threadId}/messages`, (data) => {
      if (!data) { setMessages([]); return; }
      const list = Object.entries(data).map(([k, v]) => ({ _key: k, ...v }));
      list.sort((a, b) => a.ts - b.ts);
      setMessages(list);
    });
    return () => unsub && unsub();
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    const unsub = fbListen(`chats/${threadId}/meta`, (meta) => {
      if (open) return;
      setUnread(meta?.unread_driver ?? meta?.unread ?? 0);
    });
    return () => unsub && unsub();
  }, [threadId, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      clearDriverUnread();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [open, messages]);

  async function clearDriverUnread() {
    if (!threadId) return;
    await fbUpdate(`chats/${threadId}/meta`, {
      unread_driver: 0,
      unread: 0,
    });
    await supabase.from('chat_threads').update({
      unread_driver_count: 0,
    }).eq('id', threadId);
  }

  async function send(body) {
    if (!body.trim() || !threadId) return;
    const trimmed = body.trim();
    const msg = {
      body: trimmed,
      sender: 'driver',
      sender_name: driverName || 'Driver',
      ts: Date.now(),
    };
    await fbPush(`chats/${threadId}/messages`, msg);
    const metaResult = await fbGet(`chats/${threadId}/meta`);
    const currentMeta = metaResult.ok ? (metaResult.data || {}) : {};
    const unreadDispatch = Number(currentMeta.unread_dispatch ?? currentMeta.unread ?? 0) + 1;
    const lastAt = new Date().toISOString();

    await fbUpdate(`chats/${threadId}/meta`, {
      lastMessage: trimmed.slice(0, 60),
      lastAt,
      unread_dispatch: unreadDispatch,
      unread_driver: 0,
    });
    await supabase.from('chat_threads').update({
      last_message_at: lastAt,
      unread_dispatch_count: unreadDispatch,
      unread_driver_count: 0,
    }).eq('id', threadId);
    setText('');
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: 'linear-gradient(135deg, #c9a84c, #a07830)', boxShadow: '0 4px 20px rgba(201,168,76,0.4)' }}
      >
        <MessageCircle className="w-5 h-5 text-black" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
            style={{ background: '#ff4757', color: '#fff', fontWeight: 700, fontSize: 10 }}>
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-20 left-6 z-50 w-72 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.25)', height: '360px' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(201,168,76,0.04)' }}>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" style={{ color: '#c9a84c' }} />
              <span className="text-sm font-600" style={{ color: '#c9a84c', fontWeight: 600 }}>Dispatch</span>
            </div>
            <button onClick={() => setOpen(false)} className="w-6 h-6 flex items-center justify-center rounded-md"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>No messages yet</p>
              </div>
            ) : messages.map(msg => {
              const isMe = msg.sender === 'driver';
              return (
                <div key={msg._key} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[85%] rounded-xl px-3 py-2"
                    style={{
                      background: isMe ? 'rgba(201,168,76,0.15)' : 'rgba(0,229,160,0.1)',
                      border: `1px solid ${isMe ? 'rgba(201,168,76,0.25)' : 'rgba(0,229,160,0.2)'}`,
                    }}>
                    <p style={{ color: '#e5e7eb', fontSize: 12 }}>{msg.body}</p>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2 }}>
                      {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 pb-1 flex flex-wrap gap-1.5 flex-shrink-0">
            {QUICK_REPLIES.map(qr => (
              <button key={qr} onClick={() => send(qr)}
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(201,168,76,0.8)', fontSize: 10 }}>
                {qr}
              </button>
            ))}
          </div>

          <div className="px-3 pb-3 pt-2 flex gap-2 flex-shrink-0">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(text); } }}
              placeholder="Message dispatch..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#e5e7eb', outline: 'none', fontSize: 12 }}
            />
            <button onClick={() => send(text)} disabled={!text.trim()}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: text.trim() ? 'linear-gradient(135deg, #c9a84c, #a07830)' : 'rgba(255,255,255,0.06)' }}>
              <Send className="w-3.5 h-3.5" style={{ color: text.trim() ? '#000' : 'rgba(255,255,255,0.3)' }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
