import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useEmailDnsStatus } from '@/hooks/useEmailDnsStatus';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-700/40 last:border-0">
      <span className="text-sm text-slate-300">{label}</span>
      {ok ? (
        <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-destructive shrink-0" />
      )}
    </div>
  );
}

export default function EmailStatus() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { status, loading, error, refresh } = useEmailDnsStatus();

  const active = status?.active === true;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <LanguageSwitcher />
      </div>

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-72 h-72 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full bg-success/15 blur-[120px]" />
      </div>

      <div className="w-full max-w-[440px] relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          <div className="h-1 bg-gradient-to-r from-primary via-info to-primary" />

          <div className="p-6 sm:p-10">
            <div className="text-center mb-8">
              <div
                className={`w-16 h-16 rounded-[20px] mx-auto flex items-center justify-center shadow-xl mb-4 ${
                  active
                    ? 'bg-gradient-to-br from-primary to-success shadow-primary/30'
                    : 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30'
                }`}
              >
                {active ? (
                  <ShieldCheck className="w-8 h-8 text-white" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-white" />
                )}
              </div>
              <h1 className="text-2xl font-bold text-primary mb-2">
                {t('emailStatusTitle')}
              </h1>
              <p className="text-slate-400 text-sm break-all">
                {status?.domain ?? 'notify.andam.uk'}
              </p>
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-slate-400 text-sm">{t('emailStatusChecking')}</p>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-center">
                <p className="text-sm text-destructive">{t('emailStatusError')}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Overall badge */}
                <div
                  className={`rounded-xl p-4 text-center border ${
                    active
                      ? 'bg-success/10 border-success/30'
                      : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  <p
                    className={`text-base font-bold ${
                      active ? 'text-success' : 'text-amber-400'
                    }`}
                  >
                    {active ? t('emailStatusActive') : t('emailStatusPending')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {active
                      ? t('emailStatusActiveDesc')
                      : t('emailStatusPendingDesc')}
                  </p>
                </div>

                {/* Detailed checks */}
                <div className="rounded-xl bg-slate-800/50 px-4 py-1">
                  <StatusRow
                    ok={!!status?.nsDelegated}
                    label={t('emailStatusNs')}
                  />
                  <StatusRow
                    ok={!!status?.mxPresent}
                    label={t('emailStatusMx')}
                  />
                  <StatusRow
                    ok={!!status?.spfPresent}
                    label={t('emailStatusSpf')}
                  />
                </div>

                {status?.checkedAt && (
                  <p className="text-[11px] text-center text-slate-500">
                    {t('emailStatusCheckedAt')}:{' '}
                    {new Date(status.checkedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="mt-8 space-y-3">
              <Button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="w-full py-4 h-auto bg-gradient-to-r from-primary to-success hover:shadow-lg hover:shadow-primary/40 text-base font-bold rounded-xl transition-all duration-300"
              >
                <RefreshCw
                  className={`w-5 h-5 mr-2 ${loading ? 'animate-spin' : ''}`}
                />
                {t('emailStatusRefresh')}
              </Button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full text-sm text-primary hover:text-success font-semibold transition-colors"
              >
                {t('backToLogin')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
