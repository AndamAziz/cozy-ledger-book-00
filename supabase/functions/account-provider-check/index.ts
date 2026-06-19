import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckResponse {
  exists: boolean;
  providers: string[];
  hasPassword: boolean;
  // Convenience flags for the client UI
  isGoogleOnly: boolean;
  hasGoogle: boolean;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json().catch(() => ({ email: "" }));

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "A valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Look up the auth provider(s) for this email via the secure,
    // service-role-only database helper (reads auth.users + auth.identities).
    const { data, error } = await supabaseAdmin.rpc("get_email_auth_providers", {
      _email: email.trim().toLowerCase(),
    });

    if (error) {
      console.error("get_email_auth_providers error:", error.message);
      return new Response(
        JSON.stringify({ error: "lookup_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const providers: string[] = row?.providers ?? [];
    const exists: boolean = row?.account_exists ?? false;
    const hasPassword: boolean = row?.has_password ?? false;

    const hasGoogle = providers.includes("google");
    const hasEmail = providers.includes("email");
    const isGoogleOnly = exists && hasGoogle && !hasEmail && !hasPassword;

    const result: CheckResponse = {
      exists,
      providers,
      hasPassword,
      isGoogleOnly,
      hasGoogle,
    };

    console.log("account-provider-check", {
      emailDomain: email.split("@")[1],
      exists,
      providers,
      hasPassword,
      isGoogleOnly,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("account-provider-check error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
