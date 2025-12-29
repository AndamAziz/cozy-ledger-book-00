import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface LoginFormProps {
  onLogin: (email: string, password: string) => { success: boolean; error?: string };
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    setTimeout(() => {
      const result = onLogin(email, password);
      if (!result.success) {
        toast({
          title: 'هەڵە',
          description: result.error,
          variant: 'destructive',
        });
      }
      setIsLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-card p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-success mx-auto mb-4 flex items-center justify-center text-4xl">
              💰
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">بەڕێوەبردنی داراییی</h1>
            <p className="text-muted-foreground">بچۆ ژوورەوە بۆ بەڕێوەبردنی حسابەکانت</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground">ئیمەیڵ</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ئیمەیڵ بنووسە"
                required
                className="bg-secondary/50 border-border focus:border-primary"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground">وشەی نهێنی</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="وشەی نهێنی بنووسە"
                required
                className="bg-secondary/50 border-border focus:border-primary"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full btn-gradient-primary py-6 text-lg"
              disabled={isLoading}
            >
              {isLoading ? 'چاوەڕوانبە...' : 'چوونەژوورەوە'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
