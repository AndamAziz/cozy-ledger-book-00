import { Tv } from 'lucide-react';
import { useLogoFallback } from '@/lib/logoFallback';

interface Props {
  name: string;
  logo: string | null;
  className?: string;
  imageClassName?: string;
  placeholderClassName?: string;
}

/** Small square channel logo with automatic extension fallback + clean placeholder. */
export function ChannelLogo({ name, logo, className, imageClassName, placeholderClassName }: Props) {
  const img = useLogoFallback(logo);
  return (
    <span
      className={
        className ??
        'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/50'
      }
    >
      {img.src ? (
        <img
          key={img.src}
          src={img.src}
          alt={`${name} logo`}
          loading="lazy"
          className={imageClassName ?? 'h-full w-full object-contain p-0.5'}
          onError={img.onError}
        />
      ) : (
        <Tv className={placeholderClassName ?? 'h-4 w-4 text-muted-foreground'} aria-hidden="true" />
      )}
    </span>
  );
}
