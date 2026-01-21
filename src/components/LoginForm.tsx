import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, LogIn, UserPlus, Building2, Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSignup: (email: string, password: string, companyName: string) => Promise<{ success: boolean; error?: string }>;
}

export function LoginForm({ onLogin, onSignup }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!email || !password) {
      toast({
        title: 'هەڵە',
        description: 'تکایە هەموو خانەکان پڕبکەوە',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'هەڵە',
        description: 'وشەی نهێنی دەبێت لانیکەم ٦ پیت بێت',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    if (isSignupMode && !companyName.trim()) {
      toast({
        title: 'هەڵە',
        description: 'تکایە ناوی کۆمپانیاکەت بنووسە',
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
        title: 'سەرکەوتوو',
        description: isSignupMode ? 'هەژمارەکەت دروست کرا' : 'بەخێرهاتیت',
      });
    } else {
      toast({
        title: 'هەڵە',
        description: result.error || 'هەڵەیەک ڕویدا',
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
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
                بەڕێوەبردنی داراییی
              </h1>
              <p className="text-slate-400 text-sm">
                {isSignupMode ? 'هەژمارەی نوێ دروست بکە' : 'بچۆ ژوورەوە بۆ بەڕێوەبردنی حسابەکانت'}
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
                چوونەژوورەوە
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
                تۆمارکردن
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
                    ناوی کۆمپانیا
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
                  ئیمەیڵ
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
                  وشەی نهێنی
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
                    <span>چاوەڕوانبە...</span>
                  </div>
                ) : isSignupMode ? (
                  <div className="flex items-center gap-2">
                    <span>تۆمارکردن</span>
                    <UserPlus className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>چوونەژوورەوە</span>
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
                <span className="px-3 bg-slate-900/80 text-slate-500">یان</span>
              </div>
            </div>
            
            {/* Footer */}
            <div className="text-center">
              <p className="text-slate-500 text-sm">
                {isSignupMode ? 'هەژمارت هەیە؟ ' : 'هەژمارت نییە؟ '}
                <button
                  type="button"
                  onClick={() => switchTab(!isSignupMode)}
                  className="text-primary hover:text-success font-semibold transition-colors"
                  disabled={isLoading}
                >
                  {isSignupMode ? 'چوونەژوورەوە' : 'تۆمارکردن'}
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
