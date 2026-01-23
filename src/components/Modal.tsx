import { ReactNode } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: 'primary' | 'danger' | 'info' | 'accent';
}

const variantStyles = {
  primary: {
    gradient: 'from-primary/20 via-primary/5 to-transparent',
    iconBg: 'from-primary to-emerald-400',
    glow: 'shadow-primary/20',
    border: 'border-primary/30',
  },
  danger: {
    gradient: 'from-destructive/20 via-destructive/5 to-transparent',
    iconBg: 'from-destructive to-rose-400',
    glow: 'shadow-destructive/20',
    border: 'border-destructive/30',
  },
  info: {
    gradient: 'from-info/20 via-info/5 to-transparent',
    iconBg: 'from-info to-blue-400',
    glow: 'shadow-info/20',
    border: 'border-info/30',
  },
  accent: {
    gradient: 'from-accent/20 via-accent/5 to-transparent',
    iconBg: 'from-accent to-amber-400',
    glow: 'shadow-accent/20',
    border: 'border-accent/30',
  },
};

export function Modal({ isOpen, onClose, title, children, icon, variant = 'primary' }: ModalProps) {
  const { t } = useLanguage();
  
  if (!isOpen) return null;

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-background/90 backdrop-blur-xl"
        onClick={onClose}
      />
      
      {/* Modal content */}
      <div 
        className="relative w-full sm:max-w-md max-h-[90dvh] sm:max-h-[85vh] sm:mx-4 animate-scale-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`glass-card rounded-t-3xl sm:rounded-3xl border ${styles.border} shadow-2xl ${styles.glow} overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[85vh]`}>
          {/* Decorative glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br from-primary/30 to-transparent blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-gradient-to-br from-info/20 to-transparent blur-3xl pointer-events-none" />
          
          {/* Header with gradient - fixed at top */}
          <div className={`relative bg-gradient-to-l ${styles.gradient} px-5 sm:px-6 py-4 sm:py-6 border-b border-white/10 flex-shrink-0`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                {icon && (
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br ${styles.iconBg} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    {icon}
                  </div>
                )}
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-foreground">
                    {title}
                  </h2>
                  <div className="flex items-center gap-1 mt-0.5 sm:mt-1 text-muted-foreground text-xs sm:text-sm">
                    <Sparkles className="h-3 w-3" />
                    <span>{t('fillForm')}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-destructive/20 hover:text-destructive hover:scale-110 active:scale-95 transition-all duration-200 flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          {/* Content - scrollable */}
          <div className="relative p-4 sm:p-6 md:p-7 overflow-y-auto flex-1 overscroll-contain">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
