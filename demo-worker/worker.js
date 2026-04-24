// PQSafe Demo API Worker — proxies Airwallex sandbox for demo.pqsafe.xyz
// Credentials stored as Cloudflare secrets, never exposed to browser

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return json({ ok: true, env: 'sandbox', ts: Date.now() });
    }

    // Main: execute transfer
    if (url.pathname === '/transfer') {
      try {
        const body = await request.json();
        const { nonce, amount, agent, recipient } = body;

        // 1. Auth with Airwallex sandbox
        const authRes = await fetch('https://api-demo.airwallex.com/api/v1/authentication/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': env.AIRWALLEX_CLIENT_ID,
            'x-api-key': env.AIRWALLEX_API_KEY,
          },
        });
        if (!authRes.ok) {
          const err = await authRes.text();
          return json({ error: 'Airwallex auth failed', detail: err }, 502);
        }
        const { token } = await authRes.json();

        // 2. Create transfer
        const requestId = `${nonce}-${Date.now()}`;
        const txRes = await fetch('https://api-demo.airwallex.com/api/v1/transfers/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            request_id: requestId,
            source_currency: 'USD',
            transfer_currency: 'USD',
            transfer_amount: amount || 20,
            transfer_method: 'LOCAL',
            reason: 'goods_purchase',
            reference: `AgentPay/${agent || 'demo-agent-v1'}`,
            beneficiary: {
              type: 'BANK_ACCOUNT',
              entity_type: 'PERSONAL',
              individual_name: { first_name: 'PQSafe', last_name: 'Demo' },
              address: { country_code: 'US', state: 'NY', city: 'New York', street_address: '1 Demo St', postcode: '10001' },
              bank_details: {
                account_name: 'PQSafe Demo',
                account_number: '000123456789',
                bank_country_code: 'US',
                bank_name: 'Stripe Test Bank',
                account_currency: 'USD',
                bank_account_category: 'Checking',
                account_routing_type1: 'aba',
                account_routing_value1: '021000021',
              },
            },
          }),
        });

        const result = await txRes.json();
        return json({
          success: txRes.ok,
          transferId: result.id || result.transfer_id,
          status: result.status,
          requestId: result.request_id || requestId,
          amount: amount || 20,
          executedAt: new Date().toISOString(),
          raw: txRes.ok ? undefined : result,
        }, txRes.ok ? 200 : 502);

      } catch (err) {
        return json({ error: String(err) }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
