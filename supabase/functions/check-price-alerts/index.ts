import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@^0.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map our alert symbols to Binance ticker symbols. XAUUSD isn't tradable
// on Binance — we use PAXGUSDT (Pax Gold, 1:1 backed by 1 oz XAU) as the
// closest live Binance-sourced proxy.
const SYMBOL_TO_BINANCE: Record<string, string> = {
  XAUUSD: "PAXGUSDT",
  BTCUSDT: "BTCUSDT",
  ETHUSDT: "ETHUSDT",
  SOLUSDT: "SOLUSDT",
  BNBUSDT: "BNBUSDT",
  XRPUSDT: "XRPUSDT",
};

async function fetchPrices(symbols: string[]): Promise<Record<string, number>> {
  const binanceSyms = Array.from(new Set(symbols.map((s) => SYMBOL_TO_BINANCE[s]).filter(Boolean)));
  const out: Record<string, number> = {};
  if (binanceSyms.length === 0) return out;
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(binanceSyms))}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const data = await res.json() as Array<{ symbol: string; price: string }>;
  const bySym: Record<string, number> = {};
  for (const row of data) bySym[row.symbol] = Number(row.price);
  for (const s of symbols) {
    const b = SYMBOL_TO_BINANCE[s];
    if (b && Number.isFinite(bySym[b])) out[s] = bySym[b];
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Public endpoint: frontend fetches the VAPID public key to subscribe with.
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ publicKey: Deno.env.get("VAPID_PUBLIC_KEY") || "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@andam.uk";
    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load VAPID keypair for the negrel/webpush library.
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: vapidSubject,
      vapidKeys: await webpush.importVapidKeys(
        { publicKey: vapidPublic, privateKey: vapidPrivate },
        { extractable: false },
      ),
    });

    // Fetch active alerts.
    const { data: alerts, error: alertsErr } = await supabase
      .from("price_alerts")
      .select("id, user_id, symbol, condition, target_price")
      .eq("is_active", true);
    if (alertsErr) throw alertsErr;

    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ checked: 0, matched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const symbols = Array.from(new Set(alerts.map((a) => a.symbol)));
    const prices = await fetchPrices(symbols);

    let matched = 0;
    let sent = 0;

    for (const a of alerts) {
      const price = prices[a.symbol];
      if (!Number.isFinite(price)) continue;
      const target = Number(a.target_price);
      const hit = a.condition === "above" ? price >= target : price <= target;
      if (!hit) continue;
      matched++;

      // Look up all push subscriptions for this user.
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .eq("user_id", a.user_id);

      const payload = JSON.stringify({
        title: "Price Alert",
        body: `${a.symbol} reached ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })} (target: ${a.condition} ${target.toLocaleString(undefined, { maximumFractionDigits: 2 })})`,
        url: "/crypto",
        tag: `alert-${a.id}`,
      });

      for (const s of subs || []) {
        try {
          const subscriber = appServer.subscribe({
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth_key },
          });
          await subscriber.pushTextMessage(payload, {});
          sent++;
        } catch (e) {
          const msg = String(e?.message || e);
          // Purge expired subscriptions.
          if (msg.includes("404") || msg.includes("410")) {
            await supabase.from("push_subscriptions").delete().eq("id", s.id);
          } else {
            console.error("push send failed", msg);
          }
        }
      }

      // Mark alert as triggered (one-shot).
      await supabase
        .from("price_alerts")
        .update({ is_active: false, triggered_at: new Date().toISOString() })
        .eq("id", a.id);
    }

    return new Response(JSON.stringify({ checked: alerts.length, matched, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-price-alerts error", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
