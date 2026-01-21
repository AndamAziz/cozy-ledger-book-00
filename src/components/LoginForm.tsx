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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-primary/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-success/20 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-info/10 blur-[120px]" />
      </div>
      
      {/* Floating elements */}
      <div className="absolute top-20 right-20 w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
        <span className="text-2xl">💰</span>
      </div>
      <div className="absolute bottom-32 left-16 w-14 h-14 rounded-xl bg-gradient-to-br from-success/20 to-transparent border border-success/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>
        <span className="text-xl">📊</span>
      </div>
      <div className="absolute top-1/3 left-20 w-12 h-12 rounded-lg bg-gradient-to-br from-accent/20 to-transparent border border-accent/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1s' }}>
        <span className="text-lg">📈</span>
      </div>
      
      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-primary/10">
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-l from-primary via-success to-info" />
          
          <div className="p-8 md:p-10">
            {/* Logo & Title */}
            <div className="text-center mb-10">
              <div className="relative inline-block mb-6">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary via-primary to-success mx-auto flex items-center justify-center shadow-2xl shadow-primary/40">
                  <Wallet className="h-12 w-12 text-primary-foreground" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-success flex items-center justify-center shadow-lg animate-pulse">
                  <Sparkles className="h-4 w-4 text-success-foreground" />
                </div>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary via-success to-foreground bg-clip-text text-transparent mb-3">
                بەڕێوەبردنی داراییی
              </h1>
              <p className="text-muted-foreground text-sm md:text-base">
                {isSignupMode ? 'هەژمارەی نوێ دروست بکە' : 'بچۆ ژوورەوە بۆ بەڕێوەبردنی حسابەکانت'}
              </p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {isSignupMode && (
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-primary" />
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
                      className="bg-secondary/30 border-border/50 rounded-xl py-6 pr-4 focus:border-primary/50 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-primary" />
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
                    className="bg-secondary/30 border-border/50 rounded-xl py-6 pr-4 focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4 text-primary" />
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
                    className="bg-secondary/30 border-border/50 rounded-xl py-6 pr-4 focus:border-primary/50 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full btn-gradient-primary py-7 text-lg font-bold rounded-xl shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] transition-all duration-300 mt-4"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    چاوەڕوانبە...
                  </div>
                ) : isSignupMode ? (
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5" />
                    تۆمارکردن
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="h-5 w-5" />
                    چوونەژوورەوە
                  </div>
                )}
              </Button>
            </form>
            
            {/* Toggle signup/login */}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setIsSignupMode(!isSignupMode)}
                className="text-primary hover:underline text-sm transition-colors"
                disabled={isLoading}
              >
                {isSignupMode ? 'هەژمارم هەیە، چوونەژوورەوە' : 'هەژمارم نییە، تۆمارکردن'}
              </button>
            </div>
            
            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-border/30 text-center">
              <p className="text-xs text-muted-foreground">
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
