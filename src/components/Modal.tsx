import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-md"
        onClick={onClose}
      />
      
      {/* Modal content */}
      <div 
        className="relative w-full max-w-md animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-card rounded-2xl border border-primary/20 shadow-2xl shadow-primary/10 overflow-hidden">
          {/* Header with gradient */}
          <div className="bg-gradient-to-l from-primary/10 via-transparent to-transparent px-6 py-5 border-b border-border/50">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-destructive/20 hover:text-destructive transition-all duration-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
