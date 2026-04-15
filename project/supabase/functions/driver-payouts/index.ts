import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function stripeRequest(path: string, method: string, body?: Record<string, unknown>) {
  const url = `https://api.stripe.com/v1${path}`;
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  if (body) {
    options.body = new URLSearchParams(body as Record<string, string>).toString();
  }
  const res = await fetch(url, options);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const url = new URL(req.url);
    const path = url.pathname.replace('/driver-payouts', '') || '/';
    const body = req.method !== 'GET' ? await req.json() : {};

    // POST /create-connect-account - create Stripe Connect account for a driver
    if (path === '/create-connect-account' && req.method === 'POST') {
      const { driver_id, email, name } = body;

      const account = await stripeRequest('/accounts', 'POST', {
        type: 'express',
        email,
        'individual[first_name]': name.split(' ')[0] || name,
        'individual[last_name]': name.split(' ').slice(1).join(' ') || '',
        'capabilities[transfers][requested]': 'true',
        'capabilities[card_payments][requested]': 'true',
      });

      if (account.error) {
        return new Response(JSON.stringify({ error: account.error.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('driver_bank_accounts').upsert({
        driver_id,
        stripe_account_id: account.id,
        account_holder_name: name,
        verification_status: 'pending',
        is_default: true,
        is_active: true,
      });

      return new Response(JSON.stringify({ stripe_account_id: account.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /create-onboarding-link - get Stripe Connect onboarding URL
    if (path === '/create-onboarding-link' && req.method === 'POST') {
      const { stripe_account_id, return_url, refresh_url } = body;

      const link = await stripeRequest('/account_links', 'POST', {
        account: stripe_account_id,
        return_url,
        refresh_url,
        type: 'account_onboarding',
      });

      if (link.error) {
        return new Response(JSON.stringify({ error: link.error.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ url: link.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /initiate-payout - send ACH payout to driver
    if (path === '/initiate-payout' && req.method === 'POST') {
      const { payout_id } = body;

      const { data: payout, error: payoutErr } = await supabase
        .from('driver_payouts')
        .select('*, driver_bank_accounts(stripe_account_id), drivers(full_name)')
        .eq('id', payout_id)
        .maybeSingle();

      if (payoutErr || !payout) {
        return new Response(JSON.stringify({ error: 'Payout not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const stripeAccountId = payout.driver_bank_accounts?.stripe_account_id;
      if (!stripeAccountId) {
        return new Response(JSON.stringify({ error: 'Driver has no connected Stripe account' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const amountCents = Math.round(payout.net_amount * 100);

      const transfer = await stripeRequest('/transfers', 'POST', {
        amount: String(amountCents),
        currency: 'usd',
        destination: stripeAccountId,
        description: `Pay period ${payout.pay_period_start} to ${payout.pay_period_end}`,
      });

      if (transfer.error) {
        await supabase.from('driver_payouts').update({
          status: 'failed',
          failure_reason: transfer.error.message,
          updated_at: new Date().toISOString(),
        }).eq('id', payout_id);

        return new Response(JSON.stringify({ error: transfer.error.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('driver_payouts').update({
        status: 'processing',
        stripe_transfer_id: transfer.id,
        updated_at: new Date().toISOString(),
      }).eq('id', payout_id);

      await updateAnnualEarnings(supabase, payout.driver_id, payout.net_amount, payout.org_id);

      return new Response(JSON.stringify({ transfer_id: transfer.id, status: 'processing' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /check-account-status - check verification status
    if (path === '/check-account-status' && req.method === 'POST') {
      const { stripe_account_id, driver_bank_account_id } = body;

      const account = await stripeRequest(`/accounts/${stripe_account_id}`, 'GET');

      if (account.error) {
        return new Response(JSON.stringify({ error: account.error.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const status =
        account.details_submitted && account.payouts_enabled
          ? 'verified'
          : account.requirements?.currently_due?.length > 0
          ? 'requires_action'
          : 'pending';

      await supabase.from('driver_bank_accounts').update({
        verification_status: status,
        bank_name: account.external_accounts?.data?.[0]?.bank_name || '',
        last4: account.external_accounts?.data?.[0]?.last4 || '',
        routing_last4: account.external_accounts?.data?.[0]?.routing_number?.slice(-4) || '',
        account_type: account.external_accounts?.data?.[0]?.account_type || 'checking',
        updated_at: new Date().toISOString(),
      }).eq('id', driver_bank_account_id);

      return new Response(JSON.stringify({ status, details_submitted: account.details_submitted, payouts_enabled: account.payouts_enabled }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /generate-1099s - generate 1099-NEC records for a given year
    if (path === '/generate-1099s' && req.method === 'POST') {
      const { org_id, tax_year } = body;
      const threshold = 600;

      const { data: payouts } = await supabase
        .from('driver_payouts')
        .select('driver_id, net_amount')
        .eq('org_id', org_id)
        .eq('status', 'paid')
        .gte('pay_period_start', `${tax_year}-01-01`)
        .lte('pay_period_end', `${tax_year}-12-31`);

      const totals: Record<string, number> = {};
      for (const p of payouts || []) {
        totals[p.driver_id] = (totals[p.driver_id] || 0) + parseFloat(p.net_amount);
      }

      const upserts = Object.entries(totals)
        .filter(([, amt]) => amt >= threshold)
        .map(([driver_id, total]) => ({
          driver_id,
          org_id,
          tax_year,
          total_compensation: total,
          document_status: 'ready',
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

      if (upserts.length > 0) {
        await supabase.from('driver_tax_documents').upsert(upserts, { onConflict: 'driver_id,tax_year' });
      }

      return new Response(JSON.stringify({ generated: upserts.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function updateAnnualEarnings(supabase: ReturnType<typeof createClient>, driver_id: string, amount: number, org_id: string) {
  const year = new Date().getFullYear();
  const { data: existing } = await supabase
    .from('driver_tax_documents')
    .select('id, total_compensation')
    .eq('driver_id', driver_id)
    .eq('tax_year', year)
    .maybeSingle();

  if (existing) {
    await supabase.from('driver_tax_documents').update({
      total_compensation: (existing.total_compensation || 0) + amount,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await supabase.from('driver_tax_documents').insert({
      driver_id, org_id, tax_year: year,
      total_compensation: amount,
      document_status: 'draft',
    });
  }
}
