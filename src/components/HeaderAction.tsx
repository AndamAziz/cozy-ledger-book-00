import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export const HEADER_ACTION_CLASSES =
  'h-8 sm:h-9 px-2.5 sm:px-3 rounded-lg bg-info/15 hover:bg-info/25 border border-info/30 text-info transition-all duration-200 hover:scale-105 active:scale-95 flex items-center gap-1.5 sm:gap-2';

export const HEADER_ACTION_ICON_CLASSES = 'h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0';

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
