-- Open-to-all prize races, plus admin-curated performance-stat spotlight.
-- Users must still opt into leaderboard participation; all display privacy rules remain enforced.

ALTER TABLE public.prize_contests
  ADD COLUMN IF NOT EXISTS entry_mode TEXT NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'prize_contests_entry_mode_check'
      AND conrelid = 'public.prize_contests'::regclass
  ) THEN
    ALTER TABLE public.prize_contests
      ADD CONSTRAINT prize_contests_entry_mode_check
      CHECK (entry_mode IN ('open', 'selected'));
  END IF;
END $$;

ALTER TABLE public.leaderboard_eligibility
  ADD COLUMN IF NOT EXISTS featured_on_site BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leaderboard_eligibility_featured
  ON public.leaderboard_eligibility(user_id)
  WHERE featured_on_site = TRUE;

-- Aggregated stats stay server-side. Server actions only expose stats for users who are
-- opted in and whose visibility rules allow the current viewer to see them.
CREATE OR REPLACE FUNCTION public.admin_clipper_stats()
RETURNS TABLE(user_id UUID, approved_clips BIGINT, eligible_views BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH clip_counts AS (
    SELECT c.user_id, COUNT(*) FILTER (WHERE c.status = 'approved')::BIGINT AS approved_clips
    FROM public.clips c
    GROUP BY c.user_id
  ), earning_counts AS (
    SELECT e.user_id, COALESCE(SUM(e.eligible_views), 0)::BIGINT AS eligible_views
    FROM public.earnings e
    GROUP BY e.user_id
  )
  SELECT
    p.user_id,
    COALESCE(cc.approved_clips, 0)::BIGINT AS approved_clips,
    COALESCE(ec.eligible_views, 0)::BIGINT AS eligible_views
  FROM public.profiles p
  LEFT JOIN clip_counts cc ON cc.user_id = p.user_id
  LEFT JOIN earning_counts ec ON ec.user_id = p.user_id
  WHERE p.role = 'clipper';
$$;

REVOKE ALL ON FUNCTION public.admin_clipper_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clipper_stats() TO service_role;

COMMENT ON COLUMN public.prize_contests.entry_mode IS
  'open allows any clipper to see and opt into the race; selected limits visibility to admin-selected participants.';
COMMENT ON COLUMN public.leaderboard_eligibility.featured_on_site IS
  'Admin-curated stats spotlight flag. Display still requires user opt-in and respects user visibility scope.';

NOTIFY pgrst, 'reload schema';
