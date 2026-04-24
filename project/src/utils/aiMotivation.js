import { supabase } from '../lib/supabase';
import { getEdgeFunctionHeaders } from '../lib/edgeHeaders';

export async function getAiSettings(orgId) {
  if (!orgId) return null;
  const { data } = await supabase.from('ai_settings').select('*').eq('org_id', orgId).maybeSingle();
  return data;
}

export async function getBotMemory(orgId, botId, memoryKey = 'provider_config') {
  if (!orgId || !botId) return null;
  const { data } = await supabase
    .from('bot_memory')
    .select('*')
    .eq('org_id', orgId)
    .eq('bot_id', botId)
    .eq('memory_key', memoryKey)
    .maybeSingle();
  return data;
}

export async function saveBotMemory(orgId, botId, memoryKey = 'provider_config', memoryValue = {}) {
  if (!orgId || !botId) return null;
  const existing = await getBotMemory(orgId, botId, memoryKey);
  const payload = {
    org_id: orgId,
    bot_id: botId,
    memory_key: memoryKey,
    memory_value: memoryValue,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data } = await supabase
      .from('bot_memory')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    return data;
  }

  const { data } = await supabase.from('bot_memory').insert(payload).select().maybeSingle();
  return data;
}

export async function getBotRuntimeSettings(orgId, botId, preferredProvider, fallbackSettings = null) {
  const memory = await getBotMemory(orgId, botId, 'provider_config');
  const saved = memory?.memory_value || {};
  const defaultModel =
    preferredProvider === 'self_hosted'
      ? 'local-chat'
      : preferredProvider === 'anthropic'
        ? 'claude-3-5-sonnet-latest'
        : preferredProvider === 'gemini'
          ? 'gemini-1.5-flash'
          : 'gpt-4o-mini';

  if (saved.provider === 'self_hosted' && saved.api_key && saved.base_url) {
    return {
      ...fallbackSettings,
      provider: 'self_hosted',
      api_key: saved.api_key,
      base_url: saved.base_url,
      model: saved.model || 'local-chat',
      temperature: saved.temperature ?? fallbackSettings?.temperature ?? 0.3,
      max_tokens: saved.max_tokens ?? fallbackSettings?.max_tokens ?? 400,
    };
  }

  if (saved.api_key) {
    return {
      ...fallbackSettings,
      provider: saved.provider || preferredProvider,
      api_key: saved.api_key,
      base_url: saved.base_url || fallbackSettings?.base_url || '',
      model: saved.model || defaultModel,
      temperature: saved.temperature ?? fallbackSettings?.temperature ?? 0.3,
      max_tokens: saved.max_tokens ?? fallbackSettings?.max_tokens ?? 400,
    };
  }

  if (fallbackSettings?.provider === 'self_hosted' && fallbackSettings?.api_key && fallbackSettings?.base_url) {
    return {
      ...fallbackSettings,
      provider: 'self_hosted',
      model: fallbackSettings.model || 'local-chat',
    };
  }

  if (fallbackSettings?.provider === preferredProvider && fallbackSettings?.api_key) {
    return {
      ...fallbackSettings,
      provider: preferredProvider,
      model: fallbackSettings.model || defaultModel,
    };
  }

  return null;
}

function normalizeOpenAICompatibleBaseUrl(baseUrl = '') {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

function stripMarkdownFences(text = '') {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

/** If the model returns a one-element array of objects, unwrap for structured-plan parsers. */
function unwrapStructuredJsonRoot(parsed) {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed) && parsed.length === 1 && parsed[0] && typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
    return parsed[0];
  }
  return null;
}

function parseJsonCandidate(candidate) {
  if (!candidate) return null;
  try {
    return unwrapStructuredJsonRoot(JSON.parse(candidate));
  } catch {
    return null;
  }
}

function extractFencedJson(text = '') {
  const match = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? parseJsonCandidate(match[1].trim()) : null;
}

function extractBalancedJsonObject(text = '') {
  const start = text.search(/[\{\[]/);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  const opener = text[start];
  const closer = opener === '[' ? ']' : '}';

  for (let i = start; i < text.length; i += 1) {
    const c = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (c === opener) depth += 1;
    else if (c === closer) {
      depth -= 1;
      if (depth === 0) {
        return parseJsonCandidate(text.slice(start, i + 1));
      }
    }
  }
  return null;
}

export function parseAIJson(text = '') {
  const cleaned = stripMarkdownFences(String(text || '').replace(/^\uFEFF/, '').trim());
  const fenced = extractFencedJson(cleaned);
  if (fenced) return fenced;

  try {
    return unwrapStructuredJsonRoot(JSON.parse(cleaned));
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return unwrapStructuredJsonRoot(JSON.parse(cleaned.slice(start, end + 1)));
      } catch {
        return extractBalancedJsonObject(cleaned);
      }
    }
    return extractBalancedJsonObject(cleaned);
  }
}

async function callHostedAIThroughEdge(settings, messages, options = {}) {
  const edgeBase = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1`;
  if (!edgeBase) {
    return { text: '', error: 'Missing Supabase edge base URL', status: 0, model: settings?.model };
  }

  try {
    const res = await fetch(`${edgeBase}/ai-proxy`, {
      method: 'POST',
      headers: await getEdgeFunctionHeaders(),
      body: JSON.stringify({ settings, messages, options }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        text: '',
        error: json?.error || `AI proxy HTTP ${res.status}`,
        status: res.status,
        model: settings?.model,
      };
    }
    return {
      text: json?.text || '',
      error: json?.error || null,
      status: json?.status || res.status,
      model: json?.model || settings?.model,
      tokens: json?.tokens || 0,
    };
  } catch (error) {
    return {
      text: '',
      error: error?.message || 'AI proxy request failed',
      status: 0,
      model: settings?.model,
    };
  }
}

export async function callAI(settings, messages, options = {}) {
  if (!settings || settings.provider === 'disabled' || !settings.api_key) return null;

  const maxTokensOverride = options.max_tokens != null ? parseInt(options.max_tokens, 10) : null;

  if (['openai', 'anthropic', 'gemini'].includes(settings.provider)) {
    const proxied = await callHostedAIThroughEdge(settings, messages, options);
    if (proxied && (proxied.text || proxied.error || proxied.status !== 404)) {
      return proxied;
    }
  }

  let url, body, headers;

  if (settings.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.api_key}` };
    body = JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      messages,
      max_tokens: Number.isFinite(maxTokensOverride) ? maxTokensOverride : (settings.max_tokens || 200),
      temperature: parseFloat(settings.temperature) || 0.7,
    });
  } else if (settings.provider === 'self_hosted') {
    url = normalizeOpenAICompatibleBaseUrl(settings.base_url);
    if (!url) return null;
    headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.api_key}` };
    body = JSON.stringify({
      model: settings.model || 'local-chat',
      messages,
      max_tokens: Number.isFinite(maxTokensOverride) ? maxTokensOverride : (settings.max_tokens || 200),
      temperature: parseFloat(settings.temperature) || 0.7,
    });
  } else if (settings.provider === 'gemini') {
    const model = settings.model || 'gemini-1.5-flash';
    url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.api_key}`;
    headers = { 'Content-Type': 'application/json' };
    const combined = messages.map(m => m.content).join('\n');
    body = JSON.stringify({ contents: [{ parts: [{ text: combined }] }] });
  } else if (settings.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': settings.api_key,
      'anthropic-version': '2023-06-01',
    };
    const system = messages.find(m => m.role === 'system')?.content || '';
    const convo = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
    body = JSON.stringify({
      model: settings.model || 'claude-3-5-sonnet-latest',
      system,
      messages: convo,
      max_tokens: Number.isFinite(maxTokensOverride)
        ? maxTokensOverride
        : (parseInt(settings.max_tokens, 10) || 400),
      temperature: parseFloat(settings.temperature) || 0.3,
    });
  } else {
    return null;
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        text: '',
        error: json?.error?.message || json?.message || `AI provider HTTP ${res.status}`,
        status: res.status,
        model: settings.model,
      };
    }

    if (settings.provider === 'openai' || settings.provider === 'self_hosted') {
      const text = json.choices?.[0]?.message?.content || '';
      const tokens = json.usage?.total_tokens || 0;
      return { text, tokens, model: json.model || settings.model };
    } else if (settings.provider === 'gemini') {
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text, tokens: 0, model: settings.model };
    } else if (settings.provider === 'anthropic') {
      const text = Array.isArray(json.content)
        ? json.content.filter(part => part.type === 'text').map(part => part.text).join('\n').trim()
        : '';
      const tokens = (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0);
      return { text, tokens, model: json.model || settings.model };
    }
  } catch (error) {
    return { text: '', error: error?.message || 'AI request failed', status: 0, model: settings.model };
  }
  return null;
}

export async function requestAIStructuredPlan(settings, { systemPrompt, userPrompt }) {
  const result = await callAI(
    settings,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { max_tokens: 4096 },
  );

  if (!result?.text) return result?.error ? { ...result, json: null } : null;

  let parsed = parseAIJson(result.text);
  if (!parsed) {
    const repairPrompt = `Convert the following response into raw JSON only.
Return exactly one JSON object and no markdown fences.
Expected keys:
- go_no_go
- severity
- summary
- top_blockers
- next_actions
- confidence

Source response:
${result.text}`;

    const repaired = await callAI(
      settings,
      [
        { role: 'system', content: 'You convert semi-structured AI output into strict raw JSON. Return JSON only.' },
        { role: 'user', content: repairPrompt },
      ],
      { max_tokens: 1200 },
    );

    if (repaired?.text) {
      parsed = parseAIJson(repaired.text);
      if (parsed) {
        return {
          ...result,
          text: repaired.text,
          json: parsed,
          repaired_from_unstructured: true,
        };
      }
    }
  }

  return {
    ...result,
    json: parsed,
  };
}

async function logAICall({ orgId, driverId, driverName, contextType, prompt, response, model, tokens }) {
  await supabase.from('ai_logs').insert({
    org_id: orgId,
    driver_id: driverId || null,
    driver_name: driverName || '',
    context_type: contextType,
    prompt,
    response,
    model_used: model || '',
    tokens_used: tokens || 0,
  });
}

export async function getMotivationMessage({ orgId, driverId, driverName, todayEarnings, tripsCompleted, incentiveProgress, shiftStartedAt, trigger }) {
  const settings = await getAiSettings(orgId);
  if (!settings || settings.provider === 'disabled' || !settings.motivation_enabled) return null;

  const hoursOnShift = shiftStartedAt ? ((Date.now() - shiftStartedAt) / 3600000).toFixed(1) : 'unknown';

  const incentiveText = incentiveProgress?.length > 0
    ? incentiveProgress.map(i => `- ${i.name}: ${i.current}/${i.goal} ${i.unit} (${Math.round((i.current / i.goal) * 100)}% complete, $${i.bonus} bonus)`).join('\n')
    : 'No active incentives.';

  const triggerMessages = {
    near_goal: 'The driver is close to completing an incentive goal.',
    five_trips: 'The driver just completed 5 trips in a row — great momentum!',
    idle: 'The driver has been waiting for a trip for over 20 minutes.',
    shift_start: 'The driver just started their shift for the day.',
    trip_complete: 'The driver just completed a trip.',
  };

  const systemPrompt = `You are an encouraging, high-energy motivational coach for a professional transportation driver.
Keep messages SHORT (1-2 sentences max), personal, and energetic. Use the driver's first name.
Be genuine — not over the top. Focus on their progress and momentum.`;

  const userPrompt = `Driver name: ${driverName}
Today's earnings so far: $${(todayEarnings || 0).toFixed(2)}
Trips completed today: ${tripsCompleted || 0}
Hours on shift: ${hoursOnShift}h
Active incentives:
${incentiveText}

Trigger: ${triggerMessages[trigger] || 'Encouraging check-in.'}

Write a brief, motivating message for this driver.`;

  const result = await callAI(settings, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  if (!result?.text) return null;

  await logAICall({
    orgId,
    driverId,
    driverName,
    contextType: 'motivation',
    prompt: userPrompt,
    response: result.text,
    model: result.model,
    tokens: result.tokens,
  });

  return result.text;
}

export async function testAIConnection(settings) {
  if (!settings || settings.provider === 'disabled') return { ok: false, error: 'AI disabled' };
  const result = await callAI(settings, [
    { role: 'user', content: 'Respond with exactly: "Penthouse Dispatch AI is online."' },
  ]);
  if (result?.text) return { ok: true, response: result.text, model: result.model };
  return { ok: false, error: 'No response from AI provider' };
}
