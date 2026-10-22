-- Adds the Reviewing state for the clipper/admin metric update workflow.
-- Existing clips and financial records are preserved.
ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS self_reported_views BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_reported_likes BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_status_check;
ALTER TABLE public.clips ADD CONSTRAINT clips_status_check
  CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_clips_status_submitted_at
  ON public.clips(status, submitted_at DESC);

COMMENT ON COLUMN public.clips.self_reported_views IS 'Latest views self-reported by clipper; not verified for earnings automatically.';
COMMENT ON COLUMN public.clips.self_reported_likes IS 'Latest likes self-reported by clipper.';
NOTIFY pgrst, 'reload schema';
