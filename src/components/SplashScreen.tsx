import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { RefreshCw, WifiOff } from 'lucide-react';

interface SplashScreenProps {
  /** When true, shows an error message with a retry button instead of the spinner. */
  timedOut?: boolean;
  /** Called when the user taps the retry button. Defaults to a full page reload. */
  onRetry?: () => void;
}

export const SplashScreen = ({ timedOut = false, onRetry }: SplashScreenProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [showText, setShowText] = useState(false);
  const [showSubtext, setShowSubtext] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    // Stagger the animations
    const textTimer = setTimeout(() => setShowText(true), 400);
    const subtextTimer = setTimeout(() => setShowSubtext(true), 800);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(subtextTimer);
    };
  }, []);

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Animated gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '3s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-success/10 rounded-full blur-3xl animate-pulse" 
             style={{ animationDuration: '4s', animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-primary/5 to-success/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 text-center px-6">
        {/* Logo Container with animation */}
        <div className="relative mb-8">
          {/* Outer glow ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-primary/20 to-success/20 animate-ping" 
                 style={{ animationDuration: '2s' }} />
          </div>
          
          {/* Middle ring */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full border-2 border-primary/30 animate-spin"
                 style={{ animationDuration: '8s' }} />
          </div>

          {/* Logo */}
          <div className="relative w-24 h-24 sm:w-32 sm:h-32 mx-auto animate-scale-in">
            <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary via-primary to-success shadow-2xl shadow-primary/40 animate-pulse"
                 style={{ animationDuration: '2s' }} />
            <div className="absolute inset-1 rounded-xl sm:rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center overflow-hidden">
              <img 
                src="/app-icon.svg" 
                alt="City Taxperts Logo" 
                className="w-16 h-16 sm:w-24 sm:h-24 object-contain drop-shadow-lg"
              />
            </div>
          </div>
        </div>

        {/* App Title with staggered animation */}
        <div className={`transition-all duration-700 ease-out ${showText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent mb-2">
            City Taxperts
          </h1>
        </div>

        {/* Subtitle with delayed animation */}
        <div className={`transition-all duration-700 ease-out delay-200 ${showSubtext ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-sm sm:text-base text-muted-foreground mb-8">
            {t('splashSubtitle')}
          </p>
        </div>

        {/* Loading indicator OR timeout error */}
        {timedOut ? (
          <div className="transition-all duration-500 opacity-100 max-w-sm mx-auto">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <WifiOff className="h-6 w-6 text-destructive" />
              </div>
            </div>
            <p className="text-sm sm:text-base font-semibold text-foreground mb-2">
              {t('loadingTakingLong')}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mb-5">
              {t('loadingTakingLongMsg')}
            </p>
            <Button onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              {t('retry')}
            </Button>
          </div>
        ) : (
          <div className={`transition-all duration-500 ${showSubtext ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-center gap-2">
              {/* Animated dots */}
              <div className="flex gap-1.5">
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-primary animate-bounce" 
                     style={{ animationDelay: '0ms', animationDuration: '1s' }} />
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-primary/80 animate-bounce" 
                     style={{ animationDelay: '150ms', animationDuration: '1s' }} />
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-primary/60 animate-bounce" 
                     style={{ animationDelay: '300ms', animationDuration: '1s' }} />
              </div>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground/70 mt-4">
              {t('loading')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
