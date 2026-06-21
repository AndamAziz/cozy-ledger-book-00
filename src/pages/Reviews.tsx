import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { StarRating } from '@/components/reviews/StarRating';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { ChevronLeft, ChevronRight, ArrowLeft, MessageSquareQuote } from 'lucide-react';
import {
  REVIEWS_I18N,
  getReviewLang,
  REVIEWS_PER_PAGE,
  type Review,
} from '@/lib/reviews';

const Reviews = () => {
  const { language, dir } = useLanguage();
  const lang = getReviewLang(language);
  const i18n = REVIEWS_I18N[lang];
  const navigate = useNavigate();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, reviewer_name, rating, comment, is_approved, created_at')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (!error && data) setReviews(data as Review[]);
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const count = reviews.length;
  const avg = useMemo(
    () => (count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0),
    [reviews, count]
  );
  const totalPages = Math.max(1, Math.ceil(count / REVIEWS_PER_PAGE));
  const current = reviews.slice((page - 1) * REVIEWS_PER_PAGE, page * REVIEWS_PER_PAGE);

  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <>
      <Helmet>
        <title>{i18n.allReviews} - Central Tech Platform</title>
        <meta name="description" content={i18n.subtitle} />
      </Helmet>

      <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-background via-background to-primary/5 safe-area-inset">
        <div className="max-w-2xl mx-auto px-4 py-5 sm:py-8">
          <div className="flex items-center gap-2 mb-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className={`w-4 h-4 ${dir === 'rtl' ? 'rotate-180 ms-1' : 'me-1'}`} />
              {i18n.back}
            </Button>
          </div>

          <div className="text-center mb-6">
            <div className="flex items-center gap-2 justify-center mb-2">
              <MessageSquareQuote className="w-6 h-6 text-gold" />
              <h1 className="text-2xl font-bold text-foreground">{i18n.allReviews}</h1>
            </div>
            {count > 0 && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-3xl font-bold text-foreground">{avg.toFixed(1)}</span>
                <div className="flex flex-col items-start">
                  <StarRating value={avg} size={16} />
                  <span className="text-[11px] text-muted-foreground mt-0.5">{i18n.basedOn(count)}</span>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card p-5 animate-pulse h-24" />
              ))}
            </div>
          ) : count === 0 ? (
            <div className="glass-card p-8 text-center">
              <p className="text-sm font-medium text-foreground">{i18n.noReviews}</p>
              <p className="text-xs text-muted-foreground mt-1">{i18n.beFirst}</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {current.map((r) => (
                  <ReviewCard key={r.id} review={r} lang={lang} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl"
                  >
                    <PrevIcon className="w-4 h-4 me-1" />
                    {i18n.prev}
                  </Button>
                  <span className="text-xs text-muted-foreground">{i18n.page(page, totalPages)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded-xl"
                  >
                    {i18n.next}
                    <NextIcon className="w-4 h-4 ms-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default Reviews;
