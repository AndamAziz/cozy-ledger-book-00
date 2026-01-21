import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Mail, Lock, LogIn, Wallet, Sparkles, UserPlus, Building2 } from 'lucide-react';

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

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-4 relative overflow-hidden safe-area-inset">
      {/* Background decorations - hidden on small mobile for performance */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-10 sm:top-20 left-5 sm:left-10 w-48 sm:w-72 h-48 sm:h-72 rounded-full bg-primary/15 sm:bg-primary/20 blur-[80px] sm:blur-[100px] animate-pulse" />
        <div className="absolute bottom-10 sm:bottom-20 right-5 sm:right-10 w-56 sm:w-80 h-56 sm:h-80 rounded-full bg-success/15 sm:bg-success/20 blur-[80px] sm:blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-96 h-64 sm:h-96 rounded-full bg-info/10 blur-[100px] sm:blur-[120px]" />
      </div>
      
      {/* Floating elements - smaller on mobile */}
      <div className="absolute top-12 sm:top-20 right-4 sm:right-20 w-12 sm:w-16 h-12 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
        <span className="text-lg sm:text-2xl">💰</span>
      </div>
      <div className="absolute bottom-20 sm:bottom-32 left-4 sm:left-16 w-10 sm:w-14 h-10 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br from-success/20 to-transparent border border-success/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>
        <span className="text-base sm:text-xl">📊</span>
      </div>
      <div className="hidden sm:flex absolute top-1/3 left-20 w-12 h-12 rounded-lg bg-gradient-to-br from-accent/20 to-transparent border border-accent/20 items-center justify-center animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1s' }}>
        <span className="text-lg">📈</span>
      </div>
      
      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-primary/20 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-primary/10">
          {/* Top gradient bar */}
          <div className="h-1 sm:h-1.5 bg-gradient-to-l from-primary via-success to-info" />
          
          <div className="p-5 sm:p-8 md:p-10">
            {/* Logo & Title */}
            <div className="text-center mb-6 sm:mb-10">
              <div className="relative inline-block mb-4 sm:mb-6">
                <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary via-primary to-success mx-auto flex items-center justify-center shadow-2xl shadow-primary/40" style={{ width: '4.5rem', height: '4.5rem' }}>
                  <Wallet className="h-9 w-9 sm:h-12 sm:w-12 text-primary-foreground" />
                </div>
                <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-success flex items-center justify-center shadow-lg animate-pulse">
                  <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-success-foreground" />
                </div>
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary via-success to-foreground bg-clip-text text-transparent mb-2 sm:mb-3">
                بەڕێوەبردنی داراییی
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed">
                {isSignupMode ? 'هەژمارەی نوێ دروست بکە' : 'بچۆ ژوورەوە بۆ بەڕێوەبردنی حسابەکانت'}
              </p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {isSignupMode && (
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="companyName" className="text-muted-foreground flex items-center gap-2 text-xs sm:text-sm">
                    <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    ناوی کۆمپانیا
                  </Label>
                  <div className="relative">
                    <Input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="ناوی کۆمپانیا بنووسە"
                      required={isSignupMode}
                      disabled={isLoading}
                      className="bg-secondary/30 border-border/50 rounded-xl h-12 sm:h-14 pr-4 text-sm sm:text-base focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="email" className="text-muted-foreground flex items-center gap-2 text-xs sm:text-sm">
                  <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  ئیمەیڵ
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ئیمەیڵ بنووسە"
                    required
                    disabled={isLoading}
                    className="bg-secondary/30 border-border/50 rounded-xl h-12 sm:h-14 pr-4 text-sm sm:text-base focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="password" className="text-muted-foreground flex items-center gap-2 text-xs sm:text-sm">
                  <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  وشەی نهێنی
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="وشەی نهێنی بنووسە"
                    required
                    disabled={isLoading}
                    className="bg-secondary/30 border-border/50 rounded-xl h-12 sm:h-14 pr-4 text-sm sm:text-base focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full btn-gradient-primary h-12 sm:h-14 text-base sm:text-lg font-bold rounded-xl shadow-xl shadow-primary/30 hover:shadow-primary/50 active:scale-[0.98] hover:scale-[1.02] transition-all duration-300 mt-3 sm:mt-4"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    <span className="text-sm sm:text-base">چاوەڕوانبە...</span>
                  </div>
                ) : isSignupMode ? (
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>تۆمارکردن</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span>چوونەژوورەوە</span>
                  </div>
                )}
              </Button>
            </form>
            
            {/* Toggle signup/login */}
            <div className="mt-4 sm:mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsSignupMode(!isSignupMode)}
                className="text-primary hover:underline text-xs sm:text-sm transition-colors py-2 px-4 -m-2 touch-manipulation"
                disabled={isLoading}
              >
                {isSignupMode ? 'هەژمارم هەیە، چوونەژوورەوە' : 'هەژمارم نییە، تۆمارکردن'}
              </button>
            </div>
            
            {/* Footer */}
            <div className="mt-5 sm:mt-8 pt-4 sm:pt-6 border-t border-border/30 text-center">
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                سیستەمی بەڕێوەبردنی داراییی و کۆگای جگەرە
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
