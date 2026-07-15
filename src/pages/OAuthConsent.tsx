import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";

// Beta `auth.oauth` namespace wrapper — call the Supabase client methods but
// keep TypeScript happy without grepping SDK internals.
type OAuthClient = {
  name?: string;
  redirect_uri?: string;
  scope?: string;
};
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
} | null;

interface OAuthNamespace {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails; error: { message: string } | null }>;
}

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id");
        setReady(true);
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        // Preserve the FULL consent URL so login returns the user here.
        const next = window.location.pathname + window.location.search;
        window.location.href = `/?next=${encodeURIComponent(next)}`;
        return;
      }
      const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) {
        setError(error.message);
        setReady(true);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
      setReady(true);
    })().catch((err) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : String(err));
      setReady(true);
    });
    return () => { active = false; };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauth().approveAuthorization(authorizationId)
      : await oauth().denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "an application";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <Card className="w-full max-w-md p-6 sm:p-8 space-y-6 bg-slate-900/80 border-white/10 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/15 p-3 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Authorize connection</h1>
            <p className="text-xs text-slate-400">Central Tech Platform</p>
          </div>
        </div>

        {!ready && (
          <div className="flex items-center gap-2 text-slate-300 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading authorization request…
          </div>
        )}

        {ready && error && (
          <div className="flex items-start gap-2 text-destructive text-sm">
            <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>Could not load this authorization request: {error}</span>
          </div>
        )}

        {ready && !error && details && (
          <>
            <div className="space-y-2 text-sm">
              <h2 className="text-base font-semibold text-white">
                Connect {clientName} to your account
              </h2>
              <p className="text-slate-300">
                This lets <span className="font-semibold text-white">{clientName}</span> use Central Tech Platform as you — accessing the tools you would use in the app while you are signed in.
              </p>
              {details.client?.redirect_uri && (
                <p className="text-xs text-slate-500 break-all">
                  Redirect URI: {details.client.redirect_uri}
                </p>
              )}
              <p className="text-xs text-slate-500">
                This does not bypass Central Tech Platform's permissions or backend policies.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={busy}
                onClick={() => decide(true)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => decide(false)}
              >
                Cancel connection
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
