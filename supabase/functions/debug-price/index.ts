import { createStripeClient, corsHeaders } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const env = (new URL(req.url).searchParams.get("env") ?? "sandbox") as "sandbox" | "live";
  const stripe = createStripeClient(env);
  const prices = await stripe.prices.list({ lookup_keys: ["ctp_pro_monthly"], expand: ["data.product"], limit: 10 });
  const out = prices.data.map((p: any) => ({
    price: p.id, lookup_key: p.lookup_key, amount: p.unit_amount, currency: p.currency,
    product_id: p.product?.id, product_name: p.product?.name,
  }));
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
