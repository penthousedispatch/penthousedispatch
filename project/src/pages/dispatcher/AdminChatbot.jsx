import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Bot, User, RefreshCw, Trash2, Zap,
  TrendingUp, Navigation, Users, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { callAI } from '../../utils/aiMotivation';
import { runAutoScheduler } from '../../utils/autoScheduler';

const QUICK_ACTIONS = [
  { label: 'Fleet status', msg: 'Give me a current fleet status summary. How many drivers are online, on trips, and offline?' },
  { label: 'Revenue check', msg: 'How are we performing against our $60/hr revenue target right now?' },
  { label: 'Unassigned trips', msg: 'How many trips are unassigned right now and what should I prioritize?' },
  { label: 'Run scheduler', msg: 'Run the auto-scheduler now and assign the best trips to available drivers.' },
  { label: 'Driver suggestions', msg: 'Which drivers need trips assigned and which available trips are the best matches?' },
];

function buildSystemPrompt(drivers, trips, assignments) {
  const online = drivers.filter(d => d.status === 'online').length;
  const onTrip = drivers.filter(d => d.status === 'on_trip').length;
  const offline = drivers.filter(d => d.status !== 'online' && d.status !== 'on_trip').length;
  const available = trips.filter(t => t.status === 'available').length;
  const assigned = assignments.filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status)).length;

  const driverList = drivers.slice(0, 20).map(d =>
    `- ${d.full_name}: ${d.status}${d.current_lat ? ', has GPS' : ', no GPS'}${d.pay_rate ? `, $${d.pay_rate}/${d.pay_rate_type === 'per_trip' ? 'trip' : 'hr'}` : ''}`
  ).join('\n');

  return `You are an AI dispatch assistant for Penthouse Dispatch, a professional transportation dispatch platform.

Current fleet snapshot:
- Online (available): ${online} drivers
- On trip: ${onTrip} drivers
- Offline: ${offline} drivers
- Available trips in marketplace: ${available}
- Active assignments: ${assigned}

Driver roster (up to 20):
${driverList || 'No drivers loaded.'}

Revenue model:
- Target: $60/hr revenue per driver
- Driver pay: $35/hr
- Margin: $25/hr per driver

Your role: Help the dispatcher make smart decisions. You can:
1. Summarize fleet and trip status
2. Suggest which drivers should get which trips (based on proximity, pay, mileage)
3. Identify issues (idle drivers, unassigned high-value trips)
4. When asked to "run the scheduler" — confirm you'll trigger it and describe expected results
5. Answer questions about driver performance and revenue

Be concise, data-driven, and action-oriented. Use bullet points for lists. Keep responses under 200 words unless analysis demands more.`;
}

export default function AdminChatbot() {
  const { org, drivers, trips, assignments, loadAssignments, loadTrips } = useApp();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiSettings, setAiSettings] = useState(null);
  const [schedulerConfig, setSchedulerConfig] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastRunResult, setLastRunResult] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (org?.id) {
      loadHistory();
      loadAISettings();
      loadSchedulerConfig();
    }
  }, [org?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadHistory() {
    const { data } = await supabase
      .from('admin_chat_messages')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data?.length > 0) {
      setMessages(data.map(m => ({ role: m.role, content: m.content, id: m.id, metadata: m.metadata })));
    } else {
      setMessages([{
        role: 'assistant',
        content: `Hello! I'm your AI dispatch assistant. I have real-time access to your fleet data.\n\nRight now you have **${drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length}** active drivers and **${trips.filter(t => t.status === 'available').length}** available trips.\n\nHow can I help you today?`,
        id: 'welcome',
      }]);
    }
  }

  async function loadAISettings() {
    const { data } = await supabase.from('ai_settings').select('*').eq('org_id', org.id).maybeSingle();
    setAiSettings(data);
  }

  async function loadSchedulerConfig() {
    const { data } = await supabase.from('auto_scheduler_config').select('*').eq('org_id', org.id).maybeSingle();
    setSchedulerConfig(data);
  }

  async function saveMessage(role, content, metadata = {}) {
    if (!org?.id) return;
    await supabase.from('admin_chat_messages').insert({
      org_id: org.id,
      role,
      content,
      metadata,
    });
  }

  async function handleSend(overrideMsg) {
    const text = (overrideMsg ?? input).trim();
    if (!text || sending) return;

    const userMsg = { role: 'user', content: text, id: Date.now().toString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    await saveMessage('user', text);

    const isSchedulerCommand = /run.*(scheduler|auto|assign|dispatch)|schedule.*now|auto.assign/i.test(text);

    if (isSchedulerCommand) {
      const runResult = await triggerScheduler(true);
      const assistantContent = buildSchedulerResponseText(runResult);
      const assistantMsg = { role: 'assistant', content: assistantContent, id: Date.now().toString() + '_r', metadata: { scheduler_run: true, result: runResult } };
      setMessages(prev => [...prev, assistantMsg]);
      await saveMessage('assistant', assistantContent, { scheduler_run: true });
      setSending(false);
      return;
    }

    const systemPrompt = buildSystemPrompt(drivers, trips, assignments);
    const history = messages.slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    let responseText = '';

    if (aiSettings && aiSettings.provider !== 'disabled' && aiSettings.api_key) {
      const result = await callAI(aiSettings, [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: text },
      ]);
      responseText = result?.text || '';
    }

    if (!responseText) {
      responseText = generateFallbackResponse(text, drivers, trips, assignments);
    }

    const assistantMsg = { role: 'assistant', content: responseText, id: Date.now().toString() + '_r' };
    setMessages(prev => [...prev, assistantMsg]);
    await saveMessage('assistant', responseText);
    setSending(false);
  }

  async function triggerScheduler(fromChat = false) {
    if (!schedulerConfig && !fromChat) return null;
    const cfg = schedulerConfig || {
      revenue_target_per_hour: 60,
      driver_pay_per_hour: 35,
      max_trip_distance_miles: 25,
      proximity_weight: 7,
      mileage_weight: 5,
      price_weight: 8,
      buffer_mins: 15,
      auto_assign: false,
      shift_hours: '7am-5pm',
    };
    setRunning(true);
    const result = await runAutoScheduler({
      drivers,
      trips,
      assignments,
      config: cfg,
      orgId: org?.id,
      dryRun: !cfg.auto_assign,
    });
    setLastRunResult(result);
    if (cfg.auto_assign) {
      await loadAssignments();
      await loadTrips();
    }
    setRunning(false);
    return result;
  }

  function buildSchedulerResponseText(result) {
    if (!result) return 'Scheduler encountered an error. Please check your configuration.';
    const { driversProcessed, trips: tripCount, totalAssigned, totalRevenue, avgRPH, issues, results, availableCount } = result;

    let text = `Scheduler run complete.\n\n`;
    text += `**${driversProcessed}** active drivers scanned, **${availableCount}** trips evaluated.\n`;
    if (totalAssigned > 0) {
      text += `**${totalAssigned}** trips ${schedulerConfig?.auto_assign ? 'assigned' : 'recommended'}`;
      text += ` — projected $${totalRevenue.toFixed(2)} revenue ($${avgRPH.toFixed(0)}/hr avg).\n\n`;
      if (results && results.length > 0) {
        text += `**Recommendations:**\n`;
        results.slice(0, 5).forEach(({ driver, trips: driverTrips }) => {
          const rev = driverTrips.reduce((s, t) => s + (parseFloat(t.delivery_price) || 0), 0);
          text += `- ${driver.full_name}: ${driverTrips.length} trip${driverTrips.length !== 1 ? 's' : ''} ($${rev.toFixed(2)})\n`;
        });
      }
    } else {
      text += `No trips could be matched to drivers at this time.\n`;
    }
    if (issues && issues.length > 0) {
      text += `\n**Issues:**\n${issues.map(i => `- ${i}`).join('\n')}`;
    }
    if (!schedulerConfig?.auto_assign) {
      text += `\n\n_Auto-assign is OFF — enable it in the Scheduler tab to push assignments automatically._`;
    }
    return text;
  }

  function generateFallbackResponse(text, drivers, trips, assignments) {
    const t = text.toLowerCase();
    const online = drivers.filter(d => d.status === 'online');
    const onTrip = drivers.filter(d => d.status === 'on_trip');
    const available = trips.filter(t => t.status === 'available');
    const active = assignments.filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status));

    if (t.includes('status') || t.includes('fleet') || t.includes('how many')) {
      return `**Fleet Status:**\n- Online (available): ${online.length} drivers\n- On trip: ${onTrip.length} drivers\n- Available trips: ${available.length}\n- Active assignments: ${active.length}\n\nRevenue target: $60/hr per driver. To run optimal routing, use the Scheduler tab or ask me to "run the scheduler".`;
    }
    if (t.includes('revenue') || t.includes('earn')) {
      const totalPay = active.reduce((s, a) => s + (parseFloat(a.delivery_price) || 0), 0);
      return `**Revenue Overview:**\n- Active trip value: $${totalPay.toFixed(2)}\n- Target: $60/hr per driver\n- Driver cost: $35/hr per driver\n- Margin target: $25/hr per driver\n\nFor full revenue analysis, check the Earnings tab.`;
    }
    if (t.includes('unassigned') || t.includes('trip')) {
      const topTrips = available.slice(0, 5);
      const list = topTrips.map(t => `- $${parseFloat(t.delivery_price || 0).toFixed(2)} — ${t.pu_address || 'Unknown'}`).join('\n');
      return `**${available.length} unassigned trips:**\n${list || 'None available.'}\n\nWant me to run the scheduler to route the best ones to your drivers?`;
    }
    if (t.includes('driver') || t.includes('who')) {
      const list = online.slice(0, 8).map(d => `- ${d.full_name}: available${d.current_lat ? ' (GPS active)' : ''}`).join('\n');
      return `**Available Drivers (${online.length}):**\n${list || 'No drivers online.'}\n\nDrivers on trip: ${onTrip.map(d => d.full_name).join(', ') || 'None.'}`;
    }
    return `I'm your AI dispatch assistant. I can help with fleet status, revenue analysis, and trip routing.\n\nTry asking:\n- "Show fleet status"\n- "How many unassigned trips?"\n- "Run the scheduler"\n- "Which drivers need trips?"`;
  }

  async function clearHistory() {
    if (!org?.id) return;
    await supabase.from('admin_chat_messages').delete().eq('org_id', org.id);
    setMessages([{
      role: 'assistant',
      content: 'Chat cleared. How can I help you?',
      id: 'cleared',
    }]);
  }

  function renderContent(content) {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      const italic = bold.replace(/_(.*?)_/g, '<em>$1</em>');
      return (
        <span key={i}>
          {i > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: italic }} />
        </span>
      );
    });
  }

  const onlineCount = drivers.filter(d => d.status === 'online' || d.status === 'on_trip').length;
  const availableCount = trips.filter(t => t.status === 'available').length;

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#07090d' }}>
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))', border: '1px solid rgba(201,168,76,0.3)' }}>
              <Bot className="w-4.5 h-4.5" style={{ color: '#c9a84c', width: 18, height: 18 }} />
            </div>
            <div>
              <p className="text-sm font-700" style={{ color: '#e5e7eb', fontWeight: 700 }}>Dispatch AI Assistant</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {onlineCount} active drivers · {availableCount} trips available
                {aiSettings?.provider && aiSettings.provider !== 'disabled' ? ` · ${aiSettings.model}` : ' · No AI configured'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => triggerScheduler(false)}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-600 transition-all"
              style={{ background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', color: '#00e5a0', fontWeight: 600 }}
            >
              <Zap className={`w-3 h-3 ${running ? 'animate-pulse' : ''}`} />
              {running ? 'Running...' : 'Run Scheduler'}
            </button>
            <button
              onClick={clearHistory}
              className="w-8 h-8 flex items-center justify-center rounded-xl btn-ghost"
              title="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.35)' }} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 flex gap-2 flex-wrap flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => handleSend(a.msg)}
              disabled={sending}
              className="px-3 py-1 rounded-full text-xs transition-all"
              style={{
                background: 'rgba(201,168,76,0.06)',
                border: '1px solid rgba(201,168,76,0.15)',
                color: 'rgba(201,168,76,0.8)',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {lastRunResult && (
          <div className="mx-4 mt-3 px-4 py-3 rounded-xl flex-shrink-0" style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)' }}>
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-1.5" style={{ color: '#00e5a0' }}>
                <Users className="w-3 h-3" />
                <span>{lastRunResult.driversProcessed} drivers</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: '#c9a84c' }}>
                <Navigation className="w-3 h-3" />
                <span>{lastRunResult.totalAssigned} trips matched</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: '#e5e7eb' }}>
                <TrendingUp className="w-3 h-3" />
                <span>${lastRunResult.totalRevenue?.toFixed(2)} projected</span>
              </div>
              {lastRunResult.issues?.length > 0 && (
                <div className="flex items-center gap-1.5" style={{ color: '#f59e0b' }}>
                  <AlertTriangle className="w-3 h-3" />
                  <span>{lastRunResult.issues.length} issue{lastRunResult.issues.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-3`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-1" style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.2)' }}>
                  <Bot className="w-4 h-4" style={{ color: '#c9a84c' }} />
                </div>
              )}
              <div
                className="max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{
                  background: msg.role === 'user'
                    ? 'rgba(201,168,76,0.12)'
                    : '#0d1117',
                  border: msg.role === 'user'
                    ? '1px solid rgba(201,168,76,0.25)'
                    : '1px solid rgba(255,255,255,0.07)',
                  color: msg.role === 'user' ? '#e5e7eb' : '#d1d5db',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                }}
              >
                {renderContent(msg.content)}
                {msg.metadata?.scheduler_run && (
                  <div className="mt-2 pt-2 flex items-center gap-1 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                    <Zap className="w-3 h-3" style={{ color: '#00e5a0' }} />
                    Auto-scheduler result
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <User className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                </div>
              )}
            </div>
          ))}
          {sending && (
            <div className="flex justify-start gap-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.2)' }}>
                <Bot className="w-4 h-4" style={{ color: '#c9a84c' }} />
              </div>
              <div className="px-4 py-3 rounded-2xl" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: '#c9a84c', animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div
            className="flex items-end gap-3 px-4 py-3 rounded-2xl"
            style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask about fleet status, revenue, or say 'run the scheduler'..."
              rows={1}
              className="flex-1 bg-transparent resize-none text-sm outline-none"
              style={{
                color: '#e5e7eb',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                maxHeight: 120,
                border: 'none',
                padding: 0,
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || sending}
              className="w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 transition-all"
              style={{
                background: input.trim() && !sending ? '#c9a84c' : 'rgba(255,255,255,0.05)',
                color: input.trim() && !sending ? '#07090d' : 'rgba(255,255,255,0.2)',
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-center mt-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Press Enter to send · Shift+Enter for new line
            {(!aiSettings || aiSettings.provider === 'disabled') && ' · Configure AI in the AI tab for smarter responses'}
          </p>
        </div>
      </div>
    </div>
  );
}
