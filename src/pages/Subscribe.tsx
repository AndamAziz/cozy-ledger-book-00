import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Crown, Send, Mail, Sparkles, Loader2, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/contexts/LanguageContext";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { isPaymentsConfigured, getStripeEnvironment } from "@/lib/stripe";
import { CEO_TELEGRAM_HANDLE } from "@/lib/telegramContact";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const PRICE_ID = "ctp_pro_monthly_299gbp";

const COPY = {
  en: {
    title: "Subscribe to CTP Pro",
    subtitle: "Unlock everything after your free trial",
    trial: "7 days free — no card required",
    price: "£2.99",
    per: "/ month",
    features: [
      "Full financial management (multi-currency)",
      "Inventory & sales tracking with PDF reports",
      "Live markets, signals & trading bots",
      "Prayer times, Quran, movies & sports live",
      "Priority support",
    ],
    subscribeBtn: "Subscribe with card",
    contactCeo: "Prefer manual renewal? Contact CEO on Telegram",
    back: "Back",
    successTitle: "Payment successful",
    successBody: "Your access has been extended. It may take a few seconds to appear.",
    goHome: "Go to app",
    activeTitle: "You're subscribed",
    activeBody: "Your CTP Pro subscription is active.",
    renewsOn: "Renews on",
    endsOn: "Access ends on",
    cancelScheduled: "Your subscription will not renew.",
    manageBtn: "Manage subscription",
    openingPortal: "Opening portal…",
    verifying: "Verifying your payment…",
  },
} as const;

type SubRow = {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export default function Subscribe() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { approvalStatus } = useUserRole(user);
  const { language } = useLanguage();
  const t = COPY.en; // subscription page uses English copy consistently across langs (labels are simple)

  const [showCheckout, setShowCheckout] = useState(false);
  const [subscription, setSubscription] = useState<SubRow | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const isSuccess = params.get("status") === "success";
  const configured = isPaymentsConfigured();
  const env = configured ? getStripeEnvironment() : null;

  const fetchSubscription = async (): Promise<SubRow | null> => {
    if (!user || !env) return null;
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as SubRow | null) ?? null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSub(true);
      const row = await fetchSubscription();
      if (!cancelled) {
        setSubscription(row);
        setLoadingSub(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, env]);

  // After a successful checkout, poll for the webhook to land.
  useEffect(() => {
    if (!isSuccess || !user || !env) return;
    setShowCheckout(false);
    setVerifying(true);
    let tries = 0;
    const iv = setInterval(async () => {
      tries += 1;
      const row = await fetchSubscription();
      if (row && ACTIVE_STATUSES.has(row.status)) {
        setSubscription(row);
        setVerifying(false);
        clearInterval(iv);
        toast({ title: t.successTitle, description: t.successBody });
      } else if (tries >= 12) {
        setVerifying(false);
        clearInterval(iv);
      }
    }, 2500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, user?.id, env]);

  const hasActiveSub = !!subscription && ACTIVE_STATUSES.has(subscription.status);

  const openPortal = async () => {
    if (!env) return;
    try {
      setPortalLoading(true);
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          environment: env,
          returnUrl: `${window.location.origin}/subscribe`,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || "Failed to open portal");
      window.open(data.url as string, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        title: "Error",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSubscribeClick = () => {
    if (hasActiveSub) {
      openPortal();
      return;
    }
    setShowCheckout(true);
  };

  const clearSuccessParam = () => {
    params.delete("status");
    params.delete("session_id");
    setParams(params, { replace: true });
  };

  return (
    <>
      <Helmet>
        <title>Subscribe — CTP Pro</title>
        <meta name="description" content="Subscribe to City Taxperts Pro for £2.99/month or contact the CEO for manual renewal." />
      </Helmet>

      <PaymentTestModeBanner />

      <main className="min-h-screen p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4 gap-2">
            <ArrowLeft className="h-4 w-4" /> {t.back}
          </Button>

          {verifying && (
            <div className="mb-4 rounded-2xl border border-primary/30 bg-card/60 backdrop-blur-xl p-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm">{t.verifying}</p>
            </div>
          )}

          {loadingSub ? (
            <div className="rounded-3xl border border-border/40 bg-card/60 p-8 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : hasActiveSub ? (
            <div className="rounded-3xl border border-success/30 bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-2xl p-6 sm:p-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-gold flex items-center justify-center shadow-lg mb-4">
                <Crown className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-1">{t.activeTitle}</h1>
              <p className="text-muted-foreground mb-6">{t.activeBody}</p>

              {subscription?.current_period_end && (
                <div className="rounded-xl bg-secondary/40 border border-border/30 p-4 mb-6">
                  <p className="text-xs text-muted-foreground mb-1">
                    {subscription.cancel_at_period_end ? t.endsOn : t.renewsOn}
                  </p>
                  <p className="text-lg font-semibold">
                    {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                  {subscription.cancel_at_period_end && (
                    <p className="text-xs text-warning mt-2">{t.cancelScheduled}</p>
                  )}
                </div>
              )}

              <Button
                onClick={openPortal}
                disabled={portalLoading}
                className="w-full py-6 text-base font-bold rounded-xl bg-gradient-to-r from-primary to-gold hover:opacity-90"
              >
                {portalLoading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t.openingPortal}</>
                ) : (
                  <><ExternalLink className="h-4 w-4 mr-2" /> {t.manageBtn}</>
                )}
              </Button>

              {isSuccess && (
                <Button variant="ghost" onClick={() => { clearSuccessParam(); navigate("/"); }} className="w-full mt-3">
                  {t.goHome}
                </Button>
              )}
            </div>
          ) : showCheckout && configured ? (
            <div className="rounded-3xl border border-border/40 bg-card/60 backdrop-blur-xl p-4 sm:p-6">
              <StripeEmbeddedCheckout
                priceId={PRICE_ID}
                customerEmail={user?.email}
                userId={user?.id}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-card/80 via-card/60 to-transparent backdrop-blur-2xl shadow-2xl overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary via-gold to-accent" />
              <div className="p-6 sm:p-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-gold flex items-center justify-center shadow-lg">
                    <Crown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
                    <p className="text-sm text-muted-foreground">{t.subtitle}</p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 border border-success/30 text-success text-xs sm:text-sm my-4">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.trial}
                </div>

                {approvalStatus?.expiresAt && !approvalStatus.isExpired && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Trial ends: {new Date(approvalStatus.expiresAt).toLocaleDateString()}
                  </p>
                )}

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-bold bg-gradient-to-r from-primary to-gold bg-clip-text text-transparent">
                    {t.price}
                  </span>
                  <span className="text-muted-foreground">{t.per}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {t.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-success" />
                      </div>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={handleSubscribeClick}
                  disabled={!configured}
                  className="w-full py-6 text-base font-bold rounded-xl bg-gradient-to-r from-primary to-gold hover:opacity-90 transition-all"
                >
                  {t.subscribeBtn}
                </Button>

                <div className="mt-6 pt-6 border-t border-border/40 space-y-3">
                  <p className="text-xs text-center text-muted-foreground">{t.contactCeo}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`https://t.me/${CEO_TELEGRAM_HANDLE}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/30 hover:bg-[#229ED9]/25 transition-colors text-sm"
                    >
                      <Send className="h-4 w-4 text-[#229ED9]" />
                      Telegram
                    </a>
                    <a
                      href="mailto:info@andam.uk"
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/15 border border-primary/30 hover:bg-primary/25 transition-colors text-sm"
                    >
                      <Mail className="h-4 w-4 text-primary" />
                      Email
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
