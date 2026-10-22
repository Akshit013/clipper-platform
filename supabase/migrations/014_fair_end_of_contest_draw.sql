-- ClipperPlatform: change first-to-hit prize races into end-of-contest fair draws.
-- Eligibility uses clips submitted during the entry window and approved by finalization time.
-- Admin must finish reviewing all contest-window submissions before the draw can be locked.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = extensions, public;

ALTER TABLE public.prize_contests
  ADD COLUMN IF NOT EXISTS draw_seed_commitment TEXT,
  ADD COLUMN IF NOT EXISTS draw_seed_revealed TEXT,
  ADD COLUMN IF NOT EXISTS draw_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draw_eligible_count INTEGER,
  ADD COLUMN IF NOT EXISTS draw_proof JSONB;

CREATE TABLE IF NOT EXISTS public.prize_contest_draw_secrets (
  contest_id UUID PRIMARY KEY REFERENCES public.prize_contests(id) ON DELETE CASCADE,
  draw_seed TEXT NOT NULL CHECK (draw_seed ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prize_contest_draw_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prize_contest_draw_secrets FROM anon, authenticated;
GRANT ALL ON public.prize_contest_draw_secrets TO service_role;

CREATE TABLE IF NOT EXISTS public.prize_contest_draw_audits (
  contest_id UUID PRIMARY KEY REFERENCES public.prize_contests(id) ON DELETE CASCADE,
  candidate_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_index INTEGER,
  selected_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  draw_proof JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.prize_contest_draw_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prize_contest_draw_audits FROM anon, authenticated;
GRANT ALL ON public.prize_contest_draw_audits TO service_role;

-- Legacy active/paused contests without a seed commitment were launched before their draw
-- could be precommitted. Cancel them rather than silently converting them into a draw whose
-- seed was generated after users may already have joined; admins can recreate them fairly.
UPDATE public.prize_contests
SET status = 'cancelled', updated_at = now()
WHERE status IN ('active', 'paused') AND draw_seed_commitment IS NULL;

-- Precommit seeds for existing draft contests only. Drafts are not visible to clippers yet.
-- New contests are seeded by the server action before users are able to enter. Never expose
-- the secret table to clients.
DO $$
DECLARE
  contest_row RECORD;
  seed_value TEXT;
BEGIN
  FOR contest_row IN
    SELECT id FROM public.prize_contests
    WHERE draw_seed_commitment IS NULL AND status = 'draft'
  LOOP
    seed_value := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.prize_contest_draw_secrets (contest_id, draw_seed)
    VALUES (contest_row.id, seed_value)
    ON CONFLICT (contest_id) DO NOTHING;

    SELECT draw_seed INTO seed_value
    FROM public.prize_contest_draw_secrets
    WHERE contest_id = contest_row.id;

    UPDATE public.prize_contests
    SET draw_seed_commitment = encode(digest(decode(seed_value, 'hex'), 'sha256'), 'hex')
    WHERE id = contest_row.id AND draw_seed_commitment IS NULL;
  END LOOP;
END $$;

-- Update only the exact old default copy; preserve any admin-written contest rules.
UPDATE public.prize_contests
SET description = 'Join before the deadline, reach the approved-clip target, and enter the random draw after all contest-period submissions have been reviewed.'
WHERE status IN ('draft', 'active', 'paused')
  AND lower(trim(description)) IN (
    'be the first eligible clipper to get the target number of reels approved during your entry window.',
    'be the first eligible user to get the target number of reels approved during your entry window.'
  );

-- Stop legacy first-approved-wins behaviour. New contests are drawn only after the deadline.
DROP TRIGGER IF EXISTS clips_award_prize_race ON public.clips;

CREATE OR REPLACE FUNCTION public.admin_prize_contest_pool(p_contest_id UUID)
RETURNS TABLE(user_id UUID, approved_clip_count BIGINT, unresolved_clip_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT
    cp.user_id,
    COUNT(c.id) FILTER (WHERE c.status = 'approved')::BIGINT AS approved_clip_count,
    COUNT(c.id) FILTER (WHERE c.status IN ('pending', 'reviewing'))::BIGINT AS unresolved_clip_count
  FROM public.prize_contests pc
  JOIN public.contest_participants cp
    ON cp.contest_id = pc.id
   AND cp.eligible_by_admin = TRUE
   AND cp.opted_in = TRUE
   AND cp.joined_at IS NOT NULL
   AND cp.joined_at >= pc.starts_at
   AND pc.ends_at IS NOT NULL
   AND cp.joined_at <= pc.ends_at
  LEFT JOIN public.clips c
    ON c.user_id = cp.user_id
   AND c.created_at >= GREATEST(pc.starts_at, cp.joined_at)
   AND c.created_at <= pc.ends_at
  WHERE pc.id = p_contest_id
  GROUP BY cp.user_id;
$$;
REVOKE ALL ON FUNCTION public.admin_prize_contest_pool(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_prize_contest_pool(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_finalize_prize_contest_draw(
  p_contest_id UUID,
  p_candidate_rows JSONB,
  p_draw_index INTEGER,
  p_draw_proof JSONB,
  p_seed_revealed TEXT,
  p_finalized_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  contest_row public.prize_contests%ROWTYPE;
  stored_seed TEXT;
  candidate_count INTEGER;
  unresolved_count BIGINT;
  actual_candidates JSONB;
  supplied_candidates JSONB;
  expected_tokens TEXT[];
  supplied_tokens TEXT[];
  expected_entries JSONB;
  hash_hex TEXT;
  hash_value NUMERIC := 0;
  hash_limit NUMERIC;
  universe NUMERIC := power(2::numeric, 256);
  counter_value INTEGER;
  counter_check INTEGER;
  candidate_hash_hex TEXT;
  candidate_hash_value NUMERIC;
  token_sequence TEXT;
  i INTEGER;
  winner_user UUID;
  winner_clip_count INTEGER;
BEGIN
  IF jsonb_typeof(p_candidate_rows) <> 'array' THEN
    RAISE EXCEPTION 'Candidate snapshot must be a JSON array.';
  END IF;

  SELECT * INTO contest_row
  FROM public.prize_contests
  WHERE id = p_contest_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contest not found.'; END IF;
  IF contest_row.winner_user_id IS NOT NULL OR contest_row.status = 'completed' OR contest_row.status = 'cancelled' THEN
    RAISE EXCEPTION 'This contest has already been finalized.';
  END IF;
  IF contest_row.status NOT IN ('active', 'paused') THEN RAISE EXCEPTION 'Only an active or paused contest can be drawn.'; END IF;
  IF contest_row.ends_at IS NULL OR contest_row.ends_at > now() THEN RAISE EXCEPTION 'The contest end time has not been reached.'; END IF;
  IF p_seed_revealed IS NULL OR p_seed_revealed !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid draw seed.'; END IF;

  SELECT draw_seed INTO stored_seed
  FROM public.prize_contest_draw_secrets
  WHERE contest_id = p_contest_id;
  IF stored_seed IS NULL OR stored_seed <> p_seed_revealed THEN RAISE EXCEPTION 'Draw seed does not match the stored precommitment.'; END IF;
  IF encode(digest(decode(stored_seed, 'hex'), 'sha256'), 'hex') <> contest_row.draw_seed_commitment THEN
    RAISE EXCEPTION 'Draw seed commitment check failed.';
  END IF;

  SELECT COALESCE(SUM(pool.unresolved_clip_count), 0)
  INTO unresolved_count
  FROM public.admin_prize_contest_pool(p_contest_id) AS pool;
  IF unresolved_count > 0 THEN
    RAISE EXCEPTION '% contest-period clip(s) are still pending or reviewing. Complete review before drawing.', unresolved_count;
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('user_id', pool.user_id, 'approved_clips', pool.approved_clip_count) ORDER BY pool.user_id),
    '[]'::jsonb
  ) INTO actual_candidates
  FROM public.admin_prize_contest_pool(p_contest_id) AS pool
  WHERE pool.approved_clip_count >= contest_row.goal_approved_clips;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('user_id', supplied.user_id, 'approved_clips', supplied.approved_clips) ORDER BY supplied.user_id),
    '[]'::jsonb
  ) INTO supplied_candidates
  FROM jsonb_to_recordset(p_candidate_rows) AS supplied(user_id UUID, approved_clips INTEGER, token TEXT);
  IF supplied_candidates IS DISTINCT FROM actual_candidates THEN
    RAISE EXCEPTION 'The eligible pool changed. Refresh the contest and draw again.';
  END IF;

  -- Validate each token and that the supplied candidate order is canonical (sorted by token).
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_candidate_rows) AS supplied(user_id UUID, approved_clips INTEGER, token TEXT)
    WHERE supplied.token IS DISTINCT FROM encode(digest(convert_to(stored_seed || ':' || p_contest_id::text || ':' || supplied.user_id::text, 'UTF8'), 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'Candidate token verification failed.';
  END IF;
  SELECT array_agg(supplied.token ORDER BY supplied.token COLLATE "C")
  INTO expected_tokens
  FROM jsonb_to_recordset(p_candidate_rows) AS supplied(user_id UUID, approved_clips INTEGER, token TEXT);
  SELECT array_agg(entry.value->>'token' ORDER BY entry.ordinality)
  INTO supplied_tokens
  FROM jsonb_array_elements(p_candidate_rows) WITH ORDINALITY AS entry(value, ordinality);
  IF expected_tokens IS DISTINCT FROM supplied_tokens THEN
    RAISE EXCEPTION 'Candidate ordering verification failed.';
  END IF;

  candidate_count := jsonb_array_length(p_candidate_rows);
  IF COALESCE((p_draw_proof->>'eligible_count')::INTEGER, -1) <> candidate_count THEN
    RAISE EXCEPTION 'Draw proof count does not match the eligible pool.';
  END IF;
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('token', entry.value->>'token', 'approved_clips', (entry.value->>'approved_clips')::INTEGER) ORDER BY entry.ordinality),
    '[]'::jsonb
  ) INTO expected_entries
  FROM jsonb_array_elements(p_candidate_rows) WITH ORDINALITY AS entry(value, ordinality);
  IF (p_draw_proof->'entries') IS DISTINCT FROM expected_entries THEN
    RAISE EXCEPTION 'Public draw proof does not match the locked candidate pool.';
  END IF;

  winner_user := NULL;
  winner_clip_count := NULL;
  IF candidate_count = 0 THEN
    IF p_draw_index IS NOT NULL OR (p_draw_proof->>'selection_hash') IS NOT NULL OR (p_draw_proof->>'selected_index') IS NOT NULL OR (p_draw_proof->>'winner_token') IS NOT NULL THEN
      RAISE EXCEPTION 'An empty pool cannot have a selected index, winner token, or draw hash.';
    END IF;
  ELSE
    IF p_draw_index IS NULL OR p_draw_index < 0 OR p_draw_index >= candidate_count THEN
      RAISE EXCEPTION 'Draw index is outside the candidate pool.';
    END IF;
    IF COALESCE((p_draw_proof->>'selected_index')::INTEGER, -1) <> p_draw_index THEN
      RAISE EXCEPTION 'Selected index does not match the proof.';
    END IF;
    SELECT (p_candidate_rows->p_draw_index->>'user_id')::UUID,
           (p_candidate_rows->p_draw_index->>'approved_clips')::INTEGER
    INTO winner_user, winner_clip_count;
    IF (p_draw_proof->>'winner_token') IS DISTINCT FROM (p_candidate_rows->p_draw_index->>'token') THEN
      RAISE EXCEPTION 'Winner token does not match the selected entry.';
    END IF;

    counter_value := COALESCE((p_draw_proof->>'rejection_counter')::INTEGER, -1);
    IF counter_value < 0 OR counter_value > 999 THEN RAISE EXCEPTION 'Invalid rejection counter.'; END IF;
    SELECT string_agg(entry.value->>'token', '|' ORDER BY entry.ordinality)
    INTO token_sequence
    FROM jsonb_array_elements(p_candidate_rows) WITH ORDINALITY AS entry(value, ordinality);
    hash_hex := encode(digest(convert_to(stored_seed || '|' || p_contest_id::text || '|' || token_sequence || '|' || counter_value::text, 'UTF8'), 'sha256'), 'hex');
    IF hash_hex IS DISTINCT FROM (p_draw_proof->>'selection_hash') THEN
      RAISE EXCEPTION 'Selection hash does not match the published proof.';
    END IF;
    hash_value := 0;
    FOR i IN 1..length(hash_hex) LOOP
      hash_value := hash_value * 16 + strpos('0123456789abcdef', substr(hash_hex, i, 1)) - 1;
    END LOOP;
    hash_limit := universe - mod(universe, candidate_count);
    IF hash_value >= hash_limit THEN RAISE EXCEPTION 'Draw proof used a rejected hash; retry with the next counter.'; END IF;
    IF mod(hash_value, candidate_count)::INTEGER <> p_draw_index THEN RAISE EXCEPTION 'Selected index is not reproducible from the published proof.'; END IF;
    IF counter_value > 0 THEN
      FOR counter_check IN 0..(counter_value - 1) LOOP
        candidate_hash_hex := encode(digest(convert_to(stored_seed || '|' || p_contest_id::text || '|' || token_sequence || '|' || counter_check::text, 'UTF8'), 'sha256'), 'hex');
        candidate_hash_value := 0;
        FOR i IN 1..length(candidate_hash_hex) LOOP
          candidate_hash_value := candidate_hash_value * 16 + strpos('0123456789abcdef', substr(candidate_hash_hex, i, 1)) - 1;
        END LOOP;
        IF candidate_hash_value < hash_limit THEN
          RAISE EXCEPTION 'Rejection counter is not the first acceptable hash.';
        END IF;
      END LOOP;
    END IF;
  END IF;

  UPDATE public.prize_contests
  SET status = 'completed',
      winner_user_id = winner_user,
      winner_approved_clip_count = winner_clip_count,
      winner_at = CASE WHEN winner_user IS NOT NULL THEN now() ELSE NULL END,
      draw_seed_revealed = stored_seed,
      draw_at = now(),
      draw_eligible_count = candidate_count,
      draw_proof = p_draw_proof,
      updated_at = now()
  WHERE id = p_contest_id;

  INSERT INTO public.prize_contest_draw_audits
    (contest_id, candidate_snapshot, selected_index, selected_user_id, finalized_by, finalized_at, draw_proof)
  VALUES
    (p_contest_id, p_candidate_rows, p_draw_index, winner_user, p_finalized_by, now(), p_draw_proof)
  ON CONFLICT (contest_id) DO NOTHING;

  IF winner_user IS NOT NULL THEN
    INSERT INTO public.wallet_transactions
      (user_id, event_type, amount_inr, balance_delta, currency, source_table, source_id, description, metadata)
    VALUES
      (winner_user, 'contest_prize', contest_row.prize_amount_inr, contest_row.prize_amount_inr,
       'INR', 'prize_contests', contest_row.id,
       'Prize draw won: ' || contest_row.title,
       jsonb_build_object(
         'contest_id', contest_row.id,
         'contest_title', contest_row.title,
         'goal_approved_clips', contest_row.goal_approved_clips,
         'approved_clips_at_draw', winner_clip_count,
         'eligible_participants', candidate_count,
         'draw_at', now(),
         'draw_seed_commitment', contest_row.draw_seed_commitment,
         'draw_proof', p_draw_proof
       ));
  END IF;

  RETURN jsonb_build_object(
    'contest_id', p_contest_id,
    'winner_user_id', winner_user,
    'eligible_count', candidate_count,
    'status', 'completed'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finalize_prize_contest_draw(UUID, JSONB, INTEGER, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finalize_prize_contest_draw(UUID, JSONB, INTEGER, JSONB, TEXT, UUID) TO service_role;

COMMENT ON COLUMN public.prize_contests.draw_seed_commitment IS 'SHA-256 commitment to a secret draw seed created before entry closes.';
COMMENT ON COLUMN public.prize_contests.draw_seed_revealed IS 'Secret draw seed revealed after finalization to allow public proof verification.';
COMMENT ON COLUMN public.prize_contests.draw_proof IS 'Public, privacy-preserving proof entries contain candidate hashes and qualifying clip counts, not user IDs.';
COMMENT ON TABLE public.prize_contest_draw_audits IS 'Private server-side audit snapshot of all eligible draw entries and selected winner.';

RESET search_path;
NOTIFY pgrst, 'reload schema';
