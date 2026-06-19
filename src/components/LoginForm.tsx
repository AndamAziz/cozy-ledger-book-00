import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, LogIn, UserPlus, Building2, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSignup: (email: string, password: string, companyName: string) => Promise<{ success: boolean; error?: string }>;
}

export function LoginForm({ onLogin, onSignup }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
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

    const result = isSignupMode 
      ? await onSignup(email, password, companyName.trim())
      : await onLogin(email, password);

    if (result.success) {
      toast({
        title: t('success'),
        description: t('success'),
      });
    } else {
      toast({
        title: t('error'),
        description: result.error || t('error'),
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  const switchTab = (signup: boolean) => {
    setIsSignupMode(signup);
    setEmail('');
    setPassword('');
    setCompanyName('');
    setShowPassword(false);
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <LanguageSwitcher />
      </div>
      
      {/* Decorative background elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-72 h-72 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full bg-success/15 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-info/10 blur-[150px]" />
      </div>
      
      <div className="w-full max-w-[440px] relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
          {/* Top decoration line */}
          <div className="h-1 bg-gradient-to-r from-primary via-info to-primary" />
          
          <div className="p-6 sm:p-10">
            {/* Logo & Title */}
            <div className="text-center mb-8">
              <div className="relative inline-block mb-4">
                <div className="w-20 h-20 rounded-[20px] bg-gradient-to-br from-primary to-success mx-auto flex items-center justify-center shadow-xl shadow-primary/30">
                  <span className="text-4xl">💼</span>
                </div>
                <div className="absolute -top-1 -right-1 text-xl animate-pulse">✨</div>
              </div>
              <h1 className="text-2xl font-bold text-primary mb-2">
                {t('financialManagement')}
              </h1>
              <p className="text-slate-400 text-sm">
                {isSignupMode ? t('signup') : t('login')}
              </p>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-2 mb-8 bg-slate-800/50 p-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => switchTab(false)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  !isSignupMode 
                    ? 'bg-gradient-to-r from-primary to-success text-white shadow-lg shadow-primary/30' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {t('login')}
              </button>
              <button
                type="button"
                onClick={() => switchTab(true)}
                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-300 ${
                  isSignupMode 
                    ? 'bg-gradient-to-r from-primary to-success text-white shadow-lg shadow-primary/30' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {t('signup')}
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name - Only in signup mode */}
              {isSignupMode && (
                <div className="relative group">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl z-10">
                    <Building2 className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder=" "
                    disabled={isLoading}
                    className="peer w-full py-4 pr-12 pl-4 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-white text-base outline-none transition-all focus:border-primary focus:bg-slate-800/80 placeholder-transparent"
                  />
                  <label className="absolute right-12 top-4 text-slate-400 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-slate-900/80 to-transparent px-1
                    peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-primary
                    peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                    {t('companyName')}
                  </label>
                </div>
              )}
              
              {/* Email */}
              <div className="relative group">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl z-10">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=" "
                  disabled={isLoading}
                  className="peer w-full py-4 pr-12 pl-4 bg-slate-800/60 border-2 border-slate-700/50 rounded-xl text-white text-base outline-none transition-all focus:border-primary focus:bg-slate-800/80 placeholder-transparent"
                />
                <label className="absolute right-12 top-4 text-slate-400 text-base pointer-events-none transition-all duration-300 bg-gradient-to-b from-transparent via-slate-900/80 to-transparent px-1
                  peer-focus:-translate-y-7 peer-focus:text-sm peer-focus:text-primary
                  peer-[:not(:placeholder-shown)]:-translate-y-7 peer-[:not(:placeholder-shown)]:text-sm">
                  {t('email')}
                </label>
              </div>
              
              {/* Password */}
              <div className="relative group">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl z-10">
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
                  {t('password')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-primary transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              
              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full py-4 h-auto bg-gradient-to-r from-primary to-success hover:shadow-lg hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 text-base font-bold rounded-xl transition-all duration-300 mt-2"
                disabled={isLoading}
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
                <div className="w-full border-t border-slate-700/50"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-slate-900/80 text-slate-500">—</span>
              </div>
            </div>
            
            {/* Google Login Button */}
            <Button 
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading || isGoogleLoading}
              variant="outline"
              className="w-full py-4 h-auto bg-slate-800/60 border-2 border-slate-700/50 hover:border-primary/50 hover:bg-slate-800/80 text-white text-base font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-3"
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
              <p className="text-slate-500 text-sm">
                <button
                  type="button"
                  onClick={() => switchTab(!isSignupMode)}
                  className="text-primary hover:text-success font-semibold transition-colors"
                  disabled={isLoading}
                >
                  {isSignupMode ? t('login') : t('signup')}
                </button>
              </p>
            </div>
          </div>
        </div>
        
        {/* Bottom decoration */}
        <div className="flex justify-center gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-primary/50" />
          <div className="w-2 h-2 rounded-full bg-success/50" />
          <div className="w-2 h-2 rounded-full bg-info/50" />
        </div>
      </div>
    </div>
  );
}
