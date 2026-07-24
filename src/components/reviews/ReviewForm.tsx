import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { StarRating } from './StarRating';
import { CheckCircle2, Star } from 'lucide-react';
import {
  sanitizeText,
  clampRating,
  REVIEW_COMMENT_MIN,
  REVIEW_COMMENT_MAX,
  REVIEWS_I18N,
  getReviewLang,
} from '@/lib/reviews';
import type { User } from '@supabase/supabase-js';

interface ReviewFormProps {
  user: User | null;
  reviewerName?: string | null;
  onSubmitted?: () => void;
}

export const ReviewForm = ({ user, reviewerName, onSubmitted }: ReviewFormProps) => {
  const { language } = useLanguage();
  const i18n = REVIEWS_I18N[getReviewLang(language)];
  const { toast } = useToast();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const charCount = comment.length;

  const resolvedName = (() => {
    const n = (reviewerName || '').trim();
    if (n) return n;
    const email = user?.email || '';
    return email ? email.split('@')[0] : 'User';
  })();

  const handleSubmit = async () => {
    if (!user) {
      toast({ title: i18n.loginRequired, variant: 'destructive' });
      return;
    }
    if (rating < 1) {
      toast({ title: i18n.selectRating, variant: 'destructive' });
      return;
    }
    const cleanComment = sanitizeText(comment);
    if (cleanComment.length < REVIEW_COMMENT_MIN || cleanComment.length > REVIEW_COMMENT_MAX) {
      toast({ title: i18n.tooShort, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('reviews').insert({
        user_id: user.id,
        reviewer_name: sanitizeText(resolvedName).slice(0, 100) || 'User',
        rating: clampRating(rating),
        comment: cleanComment,
      });

      if (error) {
        if (error.message?.includes('rate_limit')) {
          toast({ title: i18n.rateLimit, variant: 'destructive' });
        } else {
          toast({ title: i18n.errorGeneric, variant: 'destructive' });
        }
        return;
      }

      setDone(true);
      setRating(0);
      setComment('');
      toast({ title: i18n.thankYou });
      onSubmitted?.();
    } catch {
      toast({ title: i18n.errorGeneric, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="glass-card p-2.5 sm:p-3 text-center">
        <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-primary to-success flex items-center justify-center shadow-lg shadow-primary/30 mb-1.5">
          <CheckCircle2 className="w-5 h-5 text-background" />
        </div>
        <p className="text-sm text-foreground font-medium">{i18n.thankYou}</p>
        <Button variant="ghost" size="sm" className="mt-1.5 h-7" onClick={() => setDone(false)}>
          {i18n.writeReview}
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-card p-2.5 sm:p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-gold to-amber-500 flex items-center justify-center shadow-md shadow-gold/30">
          <Star className="w-3.5 h-3.5 text-background fill-background" />
        </div>
        <h3 className="font-bold text-foreground text-sm">{i18n.writeReview}</h3>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">{i18n.yourRating}</Label>
          <StarRating value={rating} onChange={setRating} size={20} ariaLabel={i18n.yourRating} />
        </div>

        <div>
          <Label htmlFor="review-comment" className="text-xs text-muted-foreground mb-1 block">
            {i18n.yourReview}
          </Label>
          <Textarea
            id="review-comment"
            value={comment}
            maxLength={REVIEW_COMMENT_MAX}
            onChange={(e) => setComment(e.target.value)}
            placeholder={i18n.commentPlaceholder}
            rows={2}
            className="resize-none bg-secondary/30 text-sm min-h-[48px]"
          />
          <div className="flex justify-end mt-0.5">
            <span
              className={`text-[11px] ${
                charCount < REVIEW_COMMENT_MIN || charCount > REVIEW_COMMENT_MAX
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }`}
            >
              {charCount}/{REVIEW_COMMENT_MAX}
            </span>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="btn-gradient-primary w-full h-8 rounded-xl font-bold text-sm"
        >
          {submitting ? i18n.submitting : i18n.submit}
        </Button>
      </div>
    </div>
  );
};
