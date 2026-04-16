import React, { useState, useEffect, useRef } from 'react';
import { fbListen, fbPush, fbUpdate, fbGet } from '../../lib/firebase';
import { X, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const QUICK_REPLIES = ['On my way', 'Arrived', 'Running late', 'Need help'];

export default function ChatWindow({ thread, profile, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const driverName = thread.drivers?.full_name || 'Driver';

  useEffect(() => {
    const unsub = fbListen(`chats/${thread.id}/messages`, (data) => {
      if (!data) { setMessages([]); return; }
      const list = Object.entries(data).map(([k, v]) => ({ _key: k, ...v }));
      list.sort((a, b) => a.ts - b.ts);
      setMessages(list);
    });
    return () => unsub && unsub();
  }, [thread.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread.id]);

  async function sendMessage(body) {
    if (!body.trim()) return;
    setSending(true);
    const trimmed = body.trim();
    const msg = {
      body: trimmed,
      sender: 'dispatch',
      sender_name: profile?.full_name || 'Dispatch',
      ts: Date.now(),
    };
    await fbPush(`chats/${thread.id}/messages`, msg);
    const metaResult = await fbGet(`chats/${thread.id}/meta`);
    const currentMeta = metaResult.ok ? (metaResult.data || {}) : {};
    const unreadDriver = Number(currentMeta.unread_driver ?? 0) + 1;
    const lastAt = new Date().toISOString();

    await fbUpdate(`chats/${thread.id}/meta`, {
      lastMessage: trimmed.slice(0, 60),
      lastAt,
      unread_dispatch: 0,
      unread_driver: unreadDriver,
    });
    await supabase.from('chat_threads').update({
      last_message_at: lastAt,
      unread_dispatch_count: 0,
      unread_driver_count: unreadDriver,
    }).eq('id', thread.id);
    setText('');
    setSending(false);
    inputRef.current?.focus();
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(text);
    }
  }

  return (
    <div className="w-72 rounded-2xl overflow-hidden shadow-2xl flex flex-col" style={{ background: '#0d1117', border: '1px solid rgba(201,168,76,0.25)', height: '420px' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(201,168,76,0.04)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-700"
            style={{ background: 'rgba(201,168,76,0.2)', color: '#c9a84c', fontWeight: 700 }}>
            {driverName[0]}
          </div>
          <div>
            <p className="text-xs font-600" style={{ color: '#e5e7eb', fontWeight: 600 }}>{driverName}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>{thread.drivers?.status || 'offline'}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md btn-ghost">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>No messages yet</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg._key} msg={msg} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-1 flex flex-wrap gap-1.5 flex-shrink-0">
        {QUICK_REPLIES.map(qr => (
          <button
            key={qr}
            type="button"
            onClick={() => sendMessage(qr)}
            className="px-2 py-0.5 rounded-full text-xs transition-all"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(201,168,76,0.8)', fontSize: 10 }}
          >
            {qr}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3 pt-2 flex gap-2 flex-shrink-0">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Type a message..."
          className="flex-1 text-sm"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 10px', color: '#e5e7eb', outline: 'none', fontSize: 12 }}
        />
        <button
          type="button"
          onClick={() => sendMessage(text)}
          disabled={!text.trim() || sending}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
          style={{ background: text.trim() ? 'linear-gradient(135deg, #c9a84c, #a07830)' : 'rgba(255,255,255,0.06)', flexShrink: 0 }}
        >
          <Send className="w-3.5 h-3.5" style={{ color: text.trim() ? '#000' : 'rgba(255,255,255,0.3)' }} />
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isDispatch = msg.sender === 'dispatch';
  const time = msg.ts ? new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className={`flex ${isDispatch ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2"
        style={{
          background: isDispatch ? 'rgba(201,168,76,0.15)' : 'rgba(0,229,160,0.1)',
          border: `1px solid ${isDispatch ? 'rgba(201,168,76,0.25)' : 'rgba(0,229,160,0.2)'}`,
        }}
      >
        <p style={{ color: '#e5e7eb', fontSize: 12 }}>{msg.body}</p>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, marginTop: 2, textAlign: isDispatch ? 'right' : 'left' }}>
          {msg.sender_name} · {time}
        </p>
      </div>
    </div>
  );
}
