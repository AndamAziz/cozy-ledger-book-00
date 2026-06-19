-- Corrected, candle-based outcome tracking for trading signals.
-- Adds explicit TP1/TP2 levels and a precise `outcome` so win-rate / P&L
-- reflect which level (TP1, TP2 or SL) was actually hit FIRST, not a
-- price-direction snapshot.

ALTER TABLE public.ai_signals
  ADD COLUMN IF NOT EXISTS tp2 numeric,
  ADD COLUMN IF NOT EXISTS tp2_pips numeric,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS resolved_by text;

COMMENT ON COLUMN public.ai_signals.tp2 IS 'Second take-profit level (3R). TP1 is stored in the existing tp column (1.5R).';
COMMENT ON COLUMN public.ai_signals.outcome IS 'Candle-based first-touch result: tp1 | tp2 | sl | expired | open.';
COMMENT ON COLUMN public.ai_signals.resolved_by IS 'How the outcome was determined: candle (high/low walk) | tick (legacy live-spot) | NULL.';

-- Backfill TP2 from the known risk model: TP1 = 1.5R, TP2 = 3R = entry + 2*(TP1-entry).
UPDATE public.ai_signals
SET tp2 = ROUND((entry + 2 * (tp - entry))::numeric, 5)
WHERE tp2 IS NULL AND entry IS NOT NULL AND tp IS NOT NULL;

-- Seed `outcome` for already-closed rows from their legacy status so reports
-- have a value until the candle-based resolver recomputes them.
UPDATE public.ai_signals
SET outcome = CASE
    WHEN status = 'target_hit' THEN 'tp1'
    WHEN status = 'stopped_out' THEN 'sl'
    WHEN status = 'open' THEN 'open'
    ELSE outcome
  END
WHERE outcome IS NULL;