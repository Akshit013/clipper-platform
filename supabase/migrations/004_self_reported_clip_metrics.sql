-- Optional clipper-entered counts captured at submission time.
-- These are self-reported and must NOT be treated as verified or eligible views for earnings.

ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS self_reported_views BIGINT NOT NULL DEFAULT 0
    CHECK (self_reported_views >= 0 AND self_reported_views <= 1000000000),
  ADD COLUMN IF NOT EXISTS self_reported_likes BIGINT NOT NULL DEFAULT 0
    CHECK (self_reported_likes >= 0 AND self_reported_likes <= 1000000000);

COMMENT ON COLUMN public.clips.self_reported_views IS
  'Views entered by the clipper at submission time. Unverified; do not use for payout calculations.';
COMMENT ON COLUMN public.clips.self_reported_likes IS
  'Likes entered by the clipper at submission time. Unverified; not an automatic Instagram metric.';

NOTIFY pgrst, 'reload schema';
