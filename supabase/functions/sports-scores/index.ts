import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// API-Football (api-sports.io direct). Free plan: 100 requests/day.
// Set the secret API_FOOTBALL_KEY in Lovable Cloud.
const API_KEY = Deno.env.get('API_FOOTBALL_KEY');
const BASE = 'https://v3.football.api-sports.io';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!API_KEY) {
      return new Response(
        JSON.stringify({ error: 'missing_api_key', response: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? 'live';
    const fixtureId = body?.fixtureId;

    let url = '';
    if (action === 'events') {
      if (!fixtureId) {
        return new Response(
          JSON.stringify({ error: 'missing_fixture_id', response: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      url = `${BASE}/fixtures/events?fixture=${encodeURIComponent(String(fixtureId))}`;
    } else {
      // All currently live fixtures across every competition.
      url = `${BASE}/fixtures?live=all`;
    }

    const res = await fetch(url, { headers: { 'x-apisports-key': API_KEY } });
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e), response: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
