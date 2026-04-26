import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function normalizeOpenAICompatibleBaseUrl(baseUrl = '') {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { settings, messages, options } = await req.json();
    if (!settings?.provider || !settings?.api_key) {
      return json({ error: 'Missing AI provider settings' }, 400);
    }

    const maxTokensOverride = options?.max_tokens != null ? parseInt(options.max_tokens, 10) : null;
    let url = '';
    let body: string | undefined;
    let headers: Record<string, string> = {};

    if (settings.provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.api_key}`,
      };
      body = JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages,
        max_tokens: Number.isFinite(maxTokensOverride) ? maxTokensOverride : (settings.max_tokens || 200),
        temperature: parseFloat(settings.temperature) || 0.7,
      });
    } else if (settings.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': settings.api_key,
        'anthropic-version': '2023-06-01',
      };
      const system = (messages || []).find((m: { role?: string }) => m.role === 'system')?.content || '';
      const convo = (messages || [])
        .filter((m: { role?: string }) => m.role !== 'system')
        .map((m: { role?: string, content?: string }) => ({
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
    } else if (settings.provider === 'gemini') {
      const model = settings.model || 'gemini-1.5-flash';
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.api_key}`;
      headers = { 'Content-Type': 'application/json' };
      const combined = (messages || []).map((m: { content?: string }) => m.content || '').join('\n');
      body = JSON.stringify({
        contents: [{ parts: [{ text: combined }] }],
      });
    } else if (settings.provider === 'self_hosted') {
      const normalized = normalizeOpenAICompatibleBaseUrl(settings.base_url);
      if (!normalized) return json({ error: 'Missing self-hosted base URL' }, 400);
      url = normalized;
      headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.api_key}`,
      };
      body = JSON.stringify({
        model: settings.model || 'local-chat',
        messages,
        max_tokens: Number.isFinite(maxTokensOverride) ? maxTokensOverride : (settings.max_tokens || 200),
        temperature: parseFloat(settings.temperature) || 0.7,
      });
    } else {
      return json({ error: `Unsupported provider: ${settings.provider}` }, 400);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      return json({
        text: '',
        error: payload?.error?.message || payload?.message || `AI provider HTTP ${res.status}`,
        status: res.status,
        model: settings.model || '',
      }, res.status);
    }

    if (settings.provider === 'openai' || settings.provider === 'self_hosted') {
      return json({
        text: payload?.choices?.[0]?.message?.content || '',
        tokens: payload?.usage?.total_tokens || 0,
        model: payload?.model || settings.model || '',
      });
    }

    if (settings.provider === 'gemini') {
      return json({
        text: payload?.candidates?.[0]?.content?.parts?.[0]?.text || '',
        tokens: 0,
        model: settings.model || '',
      });
    }

    const text = Array.isArray(payload?.content)
      ? payload.content.filter((part: { type?: string }) => part.type === 'text').map((part: { text?: string }) => part.text || '').join('\n').trim()
      : '';
    const tokens = (payload?.usage?.input_tokens || 0) + (payload?.usage?.output_tokens || 0);

    return json({
      text,
      tokens,
      model: payload?.model || settings.model || '',
    });
  } catch (error) {
    return json({
      text: '',
      error: error instanceof Error ? error.message : 'Unknown AI proxy error',
      status: 500,
    }, 500);
  }
});
