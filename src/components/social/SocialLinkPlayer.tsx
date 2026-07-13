import { useState, useCallback } from 'react';
import { PlayCircle, ExternalLink, Loader2, X, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  getSocialI18n,
  isShortLink,
  normalizeUrl,
  parseSocialUrl,
  type SocialEmbed,
} from '@/lib/socialEmbed';

type Status = 'idle' | 'resolving' | 'ready' | 'error';

/**
 * Paste-and-play link input: paste any full or short YouTube / TikTok /
 * Facebook / Instagram link and it renders an embedded player. Short links
 * (vm.tiktok.com, vt.tiktok.com, fb.watch) are resolved server-side first.
 */
export function SocialLinkPlayer() {
  const { language } = useLanguage();
  const i18n = getSocialI18n(language);

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [embed, setEmbed] = useState<SocialEmbed | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setEmbed(null);
    setFallbackUrl(null);
  }, []);

  const handlePlay = useCallback(async () => {
    const raw = input.trim();
    if (!raw) return;

    let workingUrl = normalizeUrl(raw);
    setFallbackUrl(workingUrl);
    setEmbed(null);

    // 1) Resolve short links server-side (cached in the backend).
    if (isShortLink(workingUrl)) {
      setStatus('resolving');
      try {
        const { data, error } = await supabase.functions.invoke('resolve-short-link', {
          body: { url: workingUrl },
        });
        if (error || !data?.resolvedUrl) {
          setStatus('error');
          return;
        }
        workingUrl = data.resolvedUrl;
        setFallbackUrl(workingUrl);
      } catch {
        setStatus('error');
        return;
      }
    }

    // 2) Feed the (resolved) URL through the shared platform parser.
    const parsed = parseSocialUrl(workingUrl);
    if (!parsed.embedUrl) {
      setStatus('error');
      return;
    }
    setEmbed(parsed);
    setStatus('ready');
  }, [input]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/25 p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/30 flex-shrink-0">
          <Link2 className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-foreground text-sm leading-tight">{i18n.title}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{i18n.desc}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (status !== 'idle') reset();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handlePlay();
          }}
          placeholder={i18n.placeholder}
          inputMode="url"
          autoComplete="off"
          className="flex-1 bg-background/60"
          aria-label={i18n.placeholder}
        />
        <div className="flex gap-2">
          <Button
            onClick={handlePlay}
            disabled={!input.trim() || status === 'resolving'}
            className="flex-1 sm:flex-none gap-1.5"
          >
            {status === 'resolving' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {status === 'resolving' ? i18n.resolving : i18n.play}
          </Button>
          {(input || status !== 'idle') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setInput('');
                reset();
              }}
              aria-label={i18n.clear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Player */}
      {status === 'ready' && embed?.embedUrl && (
        <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black">
          <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
            <iframe
              key={embed.embedUrl}
              src={embed.embedUrl}
              title={`${embed.platform} player`}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      )}

      {/* Fallback for dead / private / unsupported links */}
      {status === 'error' && (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-center">
          <p className="text-xs text-foreground mb-2">
            {fallbackUrl ? i18n.failed : i18n.invalid}
          </p>
          {fallbackUrl && (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-4 w-4" />
                {i18n.openDirect}
              </Button>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
