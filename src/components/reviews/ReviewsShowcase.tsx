import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { StarRating } from './StarRating';
import { ReviewCard } from './ReviewCard';
import { MessageSquareQuote, ArrowRight } from 'lucide-react';
import { REVIEWS_I18N, getReviewLang, type Review } from '@/lib/reviews';

interface ReviewsShowcaseProps {
  /** Max number of review cards to preview */
  limit?: number;
  className?: string;
}

export const ReviewsShowcase = ({ limit = 3, className }: ReviewsShowcaseProps) => {
  const { language, dir } = useLanguage();
  const lang = getReviewLang(language);
  const i18n = REVIEWS_I18N[lang];
  const navigate = useNavigate();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [count, setCount] = useState(0);
  const [avg, setAvg] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Aggregate from approved reviews (anon-readable)
      const { data, error } = await supabase
        .from('reviews')
        .select('id, user_id, reviewer_name, rating, comment, is_approved, created_at')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });

      if (!active) return;
      if (!error && data) {
        const all = data as Review[];
        setCount(all.length);
        setAvg(all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0);
        setReviews(all.slice(0, limit));
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [limit]);

  const ArrowIcon = dir === 'rtl' ? ArrowRight : ArrowRight;

  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-3 justify-center">
        <MessageSquareQuote className="w-5 h-5 text-gold" />
        <h2 className="text-lg font-bold text-foreground">{i18n.customerReviews}</h2>
      </div>

      {!loading && count > 0 ? (
        <>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl font-bold text-foreground">{avg.toFixed(1)}</span>
            <div className="flex flex-col">
              <StarRating value={avg} size={16} />
              <span className="text-[11px] text-muted-foreground mt-0.5">{i18n.basedOn(count)}</span>
            </div>
          </div>

          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} lang={lang} />
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => navigate('/reviews')}
            className="w-full mt-4 rounded-xl border-gold/40 text-foreground hover:bg-gold/10"
          >
            {i18n.seeAll}
            <ArrowIcon className={`w-4 h-4 ${dir === 'rtl' ? 'me-1 rotate-180' : 'ms-1'}`} />
          </Button>
        </>
      ) : (
        <div className="glass-card p-6 text-center">
          <p className="text-sm font-medium text-foreground">{i18n.noReviews}</p>
          <p className="text-xs text-muted-foreground mt-1">{i18n.beFirst}</p>
        </div>
      )}
    </section>
  );
};
