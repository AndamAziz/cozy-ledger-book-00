import { createStripeClient, corsHeaders } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const env = (new URL(req.url).searchParams.get("env") ?? "sandbox") as "sandbox" | "live";
  const stripe = createStripeClient(env);
  const prices = await stripe.prices.list({ lookup_keys: ["ctp_pro_monthly"], limit: 10 });
  const results = [];
  for (const p of prices.data) {
    const prod = await stripe.products.retrieve(p.product as string);
    results.push({
      price_id: p.id, lookup_key: p.lookup_key, amount: p.unit_amount, price_metadata: p.metadata,
      product_id: prod.id, product_name: prod.name, product_metadata: prod.metadata,
    });
  }
  return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
