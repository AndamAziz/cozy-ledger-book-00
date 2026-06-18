import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

// Public channel to count members of
const CHANNEL_CHAT_ID = '@goldmarketai';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      return json({ count: null, error: 'telegram_not_configured' }, 200);
    }

    const res = await fetch(`${GATEWAY_URL}/getChatMemberCount`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: CHANNEL_CHAT_ID }),
    });

    const data = await res.json();
    if (!res.ok || !data?.ok) {
      return json({ count: null, error: `telegram_error_${res.status}` }, 200);
    }

    return json({ count: data.result as number });
  } catch (e) {
    return json({ count: null, error: String(e) }, 200);
  }
});
