import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const HEADER_ACTION_CLASSES =
  'h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-secondary/50 hover:bg-secondary/80 border border-border/50 text-foreground/90 hover:text-foreground shadow-sm transition-all duration-200 hover:scale-[1.03] active:scale-95 flex items-center gap-1.5 sm:gap-2 font-medium';

export const HEADER_ACTION_ICON_CLASSES = 'h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 text-primary';

/** Shared label typography so every header pill reads the same. */
export const HEADER_ACTION_LABEL_CLASSES =
  'text-xs sm:text-sm font-medium tracking-tight tabular-nums whitespace-nowrap';

export const HeaderAction = ({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) => (
  <Button
    variant="outline"
    size="sm"
    className={cn(HEADER_ACTION_CLASSES, className)}
    {...props}
  >
    {children}
  </Button>
);
