import { cn } from '@/lib/utils';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}

export function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-3 md:p-4 rounded-xl border-2 border-transparent font-semibold transition-all duration-300',
        'flex flex-col items-center gap-1 md:gap-2 text-foreground',
        'bg-secondary/50 hover:bg-secondary',
        active && 'tab-active'
      )}
    >
      <span className="text-xl md:text-2xl">{icon}</span>
      <span className="text-xs md:text-sm">{label}</span>
    </button>
  );
}
