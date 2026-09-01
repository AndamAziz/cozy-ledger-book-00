import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, LogIn, UserPlus, Building2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { isResetEmailAvailable } from '@/lib/emailDns';
import { getAccountProviderInfo } from '@/lib/accountProvider';

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string; errorKey?: string }>;
  onSignup: (email: string, password: string, companyName: string) => Promise<{ success: boolean; error?: string; errorKey?: string }>;
}

export function LoginForm({ onLogin, onSignup }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const passwordsMismatch =
    isSignupMode && confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!email || !password) {
      toast({
        title: t('error'),
        description: t('error'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({
        title: t('error'),
        description: t('error'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (isSignupMode && !companyName.trim()) {
      toast({
        title: t('error'),
        description: t('error'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (isSignupMode && password !== confirmPassword) {
      toast({
        title: t('error'),
        description: t('passwordsDoNotMatch'),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // When signing up, detect emails already registered via Google Sign-In
    // and show a clear, actionable message instead of a generic error.
    if (isSignupMode) {
      const info = await getAccountProviderInfo(normalizedEmail);
      if (info.exists && info.hasGoogle && !info.hasPassword) {
        toast({
          title: t('googleAccountSignupTitle'),
          description: t('googleAccountSignupDesc'),
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
    }

    const result = isSignupMode
      ? await onSignup(normalizedEmail, password, companyName.trim())
      : await onLogin(normalizedEmail, password);

    if (result.success) {
      toast({
        title: t('success'),
        description: t('success'),
      });
    } else {
      const description = result.errorKey
        ? t(result.errorKey as Parameters<typeof t>[0])
        : result.error || t('error');
      toast({
        title: t('error'),
        description,
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  const switchTab = (signup: boolean) => {
    setIsSignupMode(signup);
    setIsForgotMode(false);
    setResetSent(false);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setCompanyName('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const openForgotMode = () => {
    setIsForgotMode(true);
    setResetSent(false);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: t('error'), description: t('enterEmail'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      // Block reset attempts until the sender domain DNS is verified/active.
      const available = await isResetEmailAvailable();
      if (!available) {
        toast({
          title: t('resetUnavailableTitle'),
          description: t('resetUnavailableDesc'),
          variant: 'destructive',
        });
        return;
      }
      const normalizedEmail = email.trim().toLowerCase();

      // Detect accounts created via Google Sign-In (no password set). We still
      // send the recovery link so they can OPTIONALLY set a password and enable
      // email login as well (account linking), but we tell them clearly that
      // Google Sign-In is how this account was created.
      const info = await getAccountProviderInfo(normalizedEmail);

      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      if (error) {
        toast({ title: t('error'), description: error.message || t('error'), variant: 'destructive' });
      } else {
        // Always show success to avoid leaking which emails exist
        setResetSent(true);
        if (info.isGoogleOnly) {
          toast({ title: t('googleAccountResetTitle'), description: t('googleAccountResetDesc') });
        } else {
          toast({ title: t('resetLinkSent'), description: t('resetLinkSentDesc') });
        }
      }
    } catch (err) {
      toast({ title: t('error'), description: t('error'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  // If the user landed here from an OAuth consent redirect (?next=/…), send them
  // back to that same-origin path after Google sign-in completes.
  const getReturnUrl = () => {
    if (typeof window === 'undefined') return '/';
    const raw = new URLSearchParams(window.location.search).get('next');
    const safe = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
    return `${window.location.origin}${safe}`;
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getReturnUrl(),
        },
      });

      if (error) {
        toast({
          title: t('error'),
          description: error.message || t('error'),
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: t('error'),
        description: t('error'),
        variant: 'destructive',
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-[#08070a]">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <LanguageSwitcher />
      </div>

      {/* Cinematic golden light rays */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-[35%] left-1/2 -translate-x-1/2 w-[160vw] h-[110vh] opacity-[0.55]"
          style={{
            background:
              'conic-gradient(from 200deg at 50% 0%, transparent 0deg, hsl(var(--gold)/0.35) 14deg, transparent 24deg, transparent 38deg, hsl(var(--gold)/0.22) 48deg, transparent 58deg, transparent 74deg, hsl(var(--gold)/0.30) 84deg, transparent 96deg, transparent 116deg, hsl(var(--gold)/0.18) 126deg, transparent 140deg)',
            filter: 'blur(14px)',
          }}
        />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[70vw] h-[70vw] max-w-[620px] max-h-[620px] rounded-full bg-gold/20 blur-[120px]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#08070a] via-[#08070a]/85 to-transparent" />
      </div>

      <div className="w-full max-w-[440px] relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-gold/20 bg-black/45 backdrop-blur-2xl shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
          {/* Top decoration line */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent" />

          <div className="p-6 sm:p-10">
            {/* Logo & Title */}
            <div className="text-center mb-8">
              <img
                src="/logo-mark.png"
                alt="ANDAM logo"
                width={96}
                height={96}
                className="mx-auto mb-3 h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-[0_6px_20px_hsl(var(--gold)/0.45)]"
              />
              <h1 className="text-3xl sm:text-[2rem] font-extrabold tracking-[0.16em] bg-gradient-to-b from-gold via-gold to-gold/60 bg-clip-text text-transparent">
                ALL IN ONE
              </h1>
              <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
              <p className="text-white/45 text-xs sm:text-sm mt-3 tracking-wide">
                {isSignupMode ? t('signup') : t('login')}
              </p>
            </div>

            
            {isForgotMode ? (
              <div className="animate-fade-in">
                {resetSent ? (
                  <div className="text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-gold/15 mx-auto flex items-center justify-center">
                      <Mail className="w-8 h-8 text-gold" />
                    </div>
                    <p className="text-white/70 text-sm">{t('resetLinkSentDesc')}</p>
                    <Button
                      type="button"
                      onClick={() => switchTab(false)}
                      className="w-full py-4 h-auto bg-gradient-to-r from-gold via-gold to-gold/80 text-gold-foreground text-base font-bold rounded-xl"
                    >
                      {t('backToLogin')}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-6">
                    <div className="text-center mb-2">
                      <h2 className="text-lg font-bold text-white mb-1">{t('resetPasswordTitle')}</h2>
                      <p className="text-white/45 text-sm">{t('resetPasswordDesc')}</p>
                    </div>
                    <div className="relative group">
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 text-xl z-10">
                        <Mail className="w-5 h-5" />
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder=" "
                        disabled={isLoading}
                        className="peer w-full py-4 pr-12 pl-4 bg-white/[0.04] border-2 border-white/10 rounded-xl text-white text-base outline-none transition-all focus:border-gold/60 focus:bg-white/[0.07] placeholder-transparent"
                      />
                      <label className="absolute right-12 top-4 text-white/45 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-black/70 to-transparent px-1
                        peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-gold
                        peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                        {t('email')}
                      </label>
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-4 h-auto bg-gradient-to-r from-gold via-gold to-gold/80 text-gold-foreground hover:shadow-lg hover:shadow-gold/40 text-base font-bold rounded-xl transition-all duration-300"
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>{t('loading')}</span>
                        </div>
                      ) : (
                        t('sendResetLink')
                      )}
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => switchTab(false)}
                        className="text-sm text-gold hover:text-gold/70 font-semibold transition-colors"
                        disabled={isLoading}
                      >
                        {t('backToLogin')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
            <>
            {/* Tabs */}
            <div className="flex gap-2 mb-8 bg-white/[0.04] p-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => switchTab(false)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  !isSignupMode 
                    ? 'bg-gradient-to-r from-gold via-gold to-gold/80 text-gold-foreground shadow-lg shadow-gold/30' 
                    : 'text-white/45 hover:text-white/70'
                }`}
              >
                {t('login')}
              </button>
              <button
                type="button"
                onClick={() => switchTab(true)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  isSignupMode 
                    ? 'bg-gradient-to-r from-gold via-gold to-gold/80 text-gold-foreground shadow-lg shadow-gold/30' 
                    : 'text-white/45 hover:text-white/70'
                }`}
              >
                {t('signup')}
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name - Only in signup mode */}
              {isSignupMode && (
                <div className="relative group">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 text-xl z-10">
                    <Building2 className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder=" "
                    disabled={isLoading}
                    className="peer w-full py-4 pr-12 pl-4 bg-white/[0.04] border-2 border-white/10 rounded-xl text-white text-base outline-none transition-all focus:border-gold/60 focus:bg-white/[0.07] placeholder-transparent"
                  />
                  <label className="absolute right-12 top-4 text-white/45 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-black/70 to-transparent px-1
                    peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-gold
                    peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                    {t('companyName')}
                  </label>
                </div>
              )}
              
              {/* Email */}
              <div className="relative group">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 text-xl z-10">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=" "
                  disabled={isLoading}
                  className="peer w-full py-4 pr-12 pl-4 bg-white/[0.04] border-2 border-white/10 rounded-xl text-white text-base outline-none transition-all focus:border-gold/60 focus:bg-white/[0.07] placeholder-transparent"
                />
                <label className="absolute right-12 top-4 text-white/45 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-black/70 to-transparent px-1
                  peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-gold
                  peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                  {t('email')}
                </label>
              </div>
              
              {/* Password */}
              <div className="relative group">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 text-xl z-10">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  disabled={isLoading}
                  className="peer w-full py-4 pr-12 pl-12 bg-white/[0.04] border-2 border-white/10 rounded-xl text-white text-base outline-none transition-all focus:border-gold/60 focus:bg-white/[0.07] placeholder-transparent"
                />
                <label className="absolute right-12 top-4 text-white/45 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-black/70 to-transparent px-1
                  peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-gold
                  peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                  {t('password')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-gold transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Forgot password link - login mode only */}
              {!isSignupMode && (
                <div className="text-left -mt-2">
                  <button
                    type="button"
                    onClick={openForgotMode}
                    className="text-sm text-gold hover:text-gold/70 font-medium transition-colors"
                    disabled={isLoading}
                  >
                    {t('forgotPassword')}
                  </button>
                </div>
              )}


              {isSignupMode && (
                <div>
                  <div className="relative group">
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/35 text-xl z-10">
                      <Lock className="w-5 h-5" />
                    </span>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder=" "
                      disabled={isLoading}
                      className={`peer w-full py-4 pr-12 pl-12 bg-white/[0.04] border-2 rounded-xl text-white text-base outline-none transition-all focus:bg-white/[0.07] placeholder-transparent ${
                        passwordsMismatch
                          ? 'border-destructive focus:border-destructive'
                          : 'border-white/10 focus:border-gold/60'
                      }`}
                    />
                    <label className="absolute right-12 top-4 text-white/45 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-black/70 to-transparent px-1
                      peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-gold
                      peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                      {t('confirmPassword')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35 hover:text-gold transition-colors p-1"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordsMismatch && (
                    <p className="mt-2 text-sm text-destructive text-right">
                      {t('passwordsDoNotMatch')}
                    </p>
                  )}
                </div>
              )}
              
              
              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full py-4 h-auto bg-gradient-to-r from-gold via-gold to-gold/80 text-gold-foreground hover:shadow-lg hover:shadow-gold/40 hover:-translate-y-0.5 active:translate-y-0 text-base font-bold rounded-xl transition-all duration-300 mt-2"
                disabled={isLoading || passwordsMismatch}
              >
              {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t('loading')}</span>
                  </div>
                ) : isSignupMode ? (
                  <div className="flex items-center gap-2">
                    <span>{t('signup')}</span>
                    <UserPlus className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>{t('login')}</span>
                    <LogIn className="h-5 w-5" />
                  </div>
                )}
              </Button>
            </form>
            
            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-black/60 text-white/35">—</span>
              </div>
            </div>
            
            {/* Google Login Button */}
            <Button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading || isGoogleLoading}
              variant="outline"
              className="w-full py-4 h-auto bg-white/[0.04] border-2 border-white/10 hover:border-gold/40 hover:bg-white/[0.07] text-white text-base font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-3"
            >
              {isGoogleLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('loading')}</span>
                </div>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>{t('loginWithGoogle')}</span>
                </>
              )}
            </Button>
            
            {/* Footer */}
            <div className="text-center mt-6">
              <p className="text-white/35 text-sm">
                <button
                  type="button"
                  onClick={() => switchTab(!isSignupMode)}
                  className="text-gold hover:text-gold/70 font-semibold transition-colors"
                  disabled={isLoading}
                >
                  {isSignupMode ? t('login') : t('signup')}
                </button>
              </p>
            </div>
            </>
            )}
          </div>
        </div>
        
        {/* Bottom decoration */}
        <div className="flex justify-center gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-gold/60" />
          <div className="w-2 h-2 rounded-full bg-gold/35" />
          <div className="w-2 h-2 rounded-full bg-gold/20" />
        </div>

        {/* Trust & Security link */}
        <div className="flex justify-center mt-5">
          <Link
            to="/trust"
            className="inline-flex items-center gap-1.5 text-xs text-white/35 hover:text-gold transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Trust &amp; Security</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
