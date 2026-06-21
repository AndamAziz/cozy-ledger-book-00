import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { StarRating } from '@/components/reviews/StarRating';
import { Check, X, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { REVIEWS_I18N, getReviewLang, relativeTime, type Review } from '@/lib/reviews';

export const ReviewModeration = () => {
  const { language } = useLanguage();
  const lang = getReviewLang(language);
  const i18n = REVIEWS_I18N[lang];
  const { toast } = useToast();

  const [pending, setPending] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('id, reviewer_name, rating, comment, is_approved, created_at')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });
    if (!error && data) setPending(data as Review[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const approve = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from('reviews').update({ is_approved: true }).eq('id', id);
    if (error) {
      toast({ title: i18n.errorGeneric, variant: 'destructive' });
    } else {
      toast({ title: i18n.approved });
      setPending((p) => p.filter((r) => r.id !== id));
    }
    setBusyId(null);
  };

  const reject = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.from('reviews').delete().eq('id', id);
    if (error) {
      toast({ title: i18n.errorGeneric, variant: 'destructive' });
    } else {
      toast({ title: i18n.rejected });
      setPending((p) => p.filter((r) => r.id !== id));
    }
    setBusyId(null);
  };

  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gold to-amber-500 flex items-center justify-center shadow-md shadow-gold/30">
            <MessageSquareWarning className="w-5 h-5 text-background" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">{i18n.pendingReviews}</h3>
            <p className="text-[11px] text-muted-foreground">{i18n.pending}: {pending.length}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchPending} disabled={loading} className="rounded-full">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-secondary/30 animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{i18n.noPending}</p>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-secondary/20 p-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold text-foreground text-sm">{r.reviewer_name}</span>
                <span className="text-[11px] text-muted-foreground">{relativeTime(r.created_at, lang)}</span>
              </div>
              <StarRating value={r.rating} size={14} className="mt-1" />
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {r.comment}
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => approve(r.id)}
                  disabled={busyId === r.id}
                  className="flex-1 bg-success/20 text-success hover:bg-success/30 border border-success/40 rounded-lg"
                >
                  <Check className="w-4 h-4 me-1" />
                  {i18n.approve}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => reject(r.id)}
                  disabled={busyId === r.id}
                  className="flex-1 bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/40 rounded-lg"
                >
                  <X className="w-4 h-4 me-1" />
                  {i18n.reject}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
