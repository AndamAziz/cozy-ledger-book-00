import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Lock, Eye, EyeOff, CheckCircle2, Mail } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [resendSent, setResendSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setIsReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setIsReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: t('error'), description: t('passwordMin6'), variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: t('error'), description: t('passwordsDoNotMatch'), variant: 'destructive' });
      return;
    }
    if (!isReady) {
      toast({ title: t('error'), description: t('resetSessionInvalid'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({ title: t('error'), description: error.message || t('error'), variant: 'destructive' });
        return;
      }
      setIsDone(true);
      toast({ title: t('passwordUpdated'), description: t('passwordUpdatedDesc') });
      await supabase.auth.signOut({ scope: 'local' });
      setTimeout(() => navigate('/'), 1800);
    } catch {
      toast({ title: t('error'), description: t('error'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!resendEmail.trim()) return;

    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resendEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResendSent(true);
      toast({ title: t('success'), description: t('resendResetSuccessDesc') });
    } catch {
      toast({ title: t('error'), description: t('errorOccurred'), variant: 'destructive' });
    } finally {
      setResendLoading(false);
    }
  };

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
              <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-primary to-success mx-auto flex items-center justify-center shadow-xl shadow-primary/30 mb-4">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-primary mb-2">{t('resetPasswordTitle')}</h1>
              <p className="text-slate-400 text-sm">{t('enterNewPassword')}</p>
            </div>

            {isDone ? (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 rounded-full bg-success/20 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <p className="text-slate-300 text-sm">{t('passwordUpdatedDesc')}</p>
                <Button
                  type="button"
                  onClick={() => navigate('/')}
                  className="w-full py-4 h-auto bg-gradient-to-r from-primary to-success text-base font-bold rounded-xl"
                >
                  {t('backToLogin')}
                </Button>
              </div>
            ) : resendSent ? (
              <div className="text-center space-y-6">
                <div className="w-16 h-16 rounded-full bg-success/20 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <p className="text-slate-300 text-sm">{t('resendResetSuccessDesc')}</p>
                <Button
                  type="button"
                  onClick={() => { setResendSent(false); setResendEmail(''); navigate('/'); }}
                  className="w-full py-4 h-auto bg-gradient-to-r from-primary to-success text-base font-bold rounded-xl"
                >
                  {t('backToLogin')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="relative group">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 z-10">
                    <Lock className="w-5 h-5" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder=" "
                    disabled={isLoading}
                    className="peer w-full py-4 pr-12 pl-12 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-white text-base outline-none transition-all focus:border-primary focus:bg-slate-800/80 placeholder-transparent"
                  />
                  <label className="absolute right-12 top-4 text-slate-400 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-slate-900/80 to-transparent px-1
                    peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-primary
                    peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                    {t('newPassword')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <div className="relative group">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 z-10">
                    <Lock className="w-5 h-5" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder=" "
                    disabled={isLoading}
                    className="peer w-full py-4 pr-12 pl-12 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-white text-base outline-none transition-all focus:border-primary focus:bg-slate-800/80 placeholder-transparent"
                  />
                  <label className="absolute right-12 top-4 text-slate-400 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-slate-900/80 to-transparent px-1
                    peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-primary
                    peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                    {t('confirmPassword')}
                  </label>
                </div>

                {!isReady && (
                  <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 text-center">
                    <p className="text-xs text-warning">{t('resetSessionInvalid')}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || !isReady}
                  className="w-full py-4 h-auto bg-gradient-to-r from-primary to-success hover:shadow-lg hover:shadow-primary/40 text-base font-bold rounded-xl transition-all duration-300"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('loading')}</span>
                    </div>
                  ) : (
                    t('updatePassword')
                  )}
                </Button>

                <div className="pt-2 border-t border-slate-700/50 space-y-3">
                  <p className="text-xs text-center text-slate-400">{t('linkExpired')}</p>
                  <div className="relative">
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 z-10">
                      <Mail className="w-5 h-5" />
                    </span>
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder={t('enterEmail')}
                      disabled={resendLoading}
                      className="w-full py-3 pr-12 pl-4 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-white text-sm outline-none transition-all focus:border-primary focus:bg-slate-800/80"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleResend}
                    disabled={resendLoading || !resendEmail.trim()}
                    variant="outline"
                    className="w-full py-3 h-auto text-sm font-semibold rounded-xl border-primary/30 text-primary hover:text-primary hover:bg-primary/10"
                  >
                    {resendLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span>{t('loading')}</span>
                      </div>
                    ) : (
                      t('resendResetEmail')
                    )}
                  </Button>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="text-sm text-primary hover:text-success font-semibold transition-colors"
                    disabled={isLoading}
                  >
                    {t('backToLogin')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
