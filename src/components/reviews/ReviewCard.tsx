import { StarRating } from './StarRating';
import { relativeTime, type Review, type ReviewLang } from '@/lib/reviews';

interface ReviewCardProps {
  review: Review;
  lang: ReviewLang;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ReviewCard = ({ review, lang }: ReviewCardProps) => {
  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary to-success flex items-center justify-center text-background font-bold text-sm shadow-md shadow-primary/30">
          {initials(review.reviewer_name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm truncate">{review.reviewer_name}</p>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {relativeTime(review.created_at, lang)}
            </span>
          </div>
          <StarRating value={review.rating} size={14} className="mt-1" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
        {review.comment}
      </p>
    </div>
  );
};
