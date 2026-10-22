-- ClipperPlatform: first-to-goal prize races + opt-in, private leaderboards.
-- Uses existing approved clip records and wallet_transactions; no old earnings are rewritten.

CREATE TABLE IF NOT EXISTS public.prize_contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  description TEXT NOT NULL DEFAULT '',
  goal_approved_clips INTEGER NOT NULL CHECK (goal_approved_clips BETWEEN 1 AND 10000),
  prize_amount_inr NUMERIC(14,2) NOT NULL CHECK (prize_amount_inr > 0 AND prize_amount_inr <= 1000000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  winner_approved_clip_count INTEGER,
  winner_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_prize_contests_status_dates
  ON public.prize_contests(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_prize_contests_winner
  ON public.prize_contests(winner_user_id) WHERE winner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contest_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.prize_contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eligible_by_admin BOOLEAN NOT NULL DEFAULT false,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id),
  CHECK (NOT opted_in OR joined_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_contest_participants_user ON public.contest_participants(user_id, contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_participants_eligible ON public.contest_participants(contest_id, eligible_by_admin, opted_in);

-- Admin controls who is allowed to participate. Each user controls their own opt-in and visibility.
CREATE TABLE IF NOT EXISTS public.leaderboard_eligibility (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled_by_admin BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leaderboard_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  visibility_scope TEXT NOT NULL DEFAULT 'private' CHECK (visibility_scope IN ('private', 'participants', 'selected')),
  display_alias TEXT CHECK (display_alias IS NULL OR length(display_alias) <= 40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leaderboard_allowed_viewers (
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_user_id, viewer_user_id),
  CHECK (owner_user_id <> viewer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_allowed_viewers_viewer ON public.leaderboard_allowed_viewers(viewer_user_id, owner_user_id);

-- All access goes through authenticated server actions. There are intentionally no direct client
-- table policies; service-role access is only used after checking the signed-in user's role.
ALTER TABLE public.prize_contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_allowed_viewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prize_contests FROM anon, authenticated;
REVOKE ALL ON public.contest_participants FROM anon, authenticated;
REVOKE ALL ON public.leaderboard_eligibility FROM anon, authenticated;
REVOKE ALL ON public.leaderboard_preferences FROM anon, authenticated;
REVOKE ALL ON public.leaderboard_allowed_viewers FROM anon, authenticated;
GRANT ALL ON public.prize_contests TO service_role;
GRANT ALL ON public.contest_participants TO service_role;
GRANT ALL ON public.leaderboard_eligibility TO service_role;
GRANT ALL ON public.leaderboard_preferences TO service_role;
GRANT ALL ON public.leaderboard_allowed_viewers TO service_role;

-- Add a distinct ledger event for contest prizes without counting it as clip earnings or bonuses.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_event_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_event_type_check
  CHECK (event_type IN (
    'clip_earning', 'earning_adjustment', 'bonus_credit', 'bonus_reversal',
    'bonus_paid_direct', 'payout_reserved', 'payout_paid', 'payout_reversal',
    'manual_adjustment', 'contest_prize'
  ));
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_contest_prize_once
  ON public.wallet_transactions(source_table, source_id, event_type)
  WHERE source_table = 'prize_contests' AND event_type = 'contest_prize';

-- The first eligible user whose approved clip count reaches the target wins. The contest row is
-- locked while checking/awarding to prevent two concurrent approvals from paying two winners.
CREATE OR REPLACE FUNCTION public.award_prize_race_for_approved_clip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  race_row public.prize_contests%ROWTYPE;
  approved_count INTEGER;
  approval_time TIMESTAMPTZ;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  approval_time := COALESCE(NEW.reviewed_at, now());

  FOR race_row IN
    SELECT *
    FROM public.prize_contests pc
    WHERE pc.status = 'active'
      AND pc.winner_user_id IS NULL
      AND pc.starts_at <= approval_time
      AND (pc.ends_at IS NULL OR pc.ends_at >= approval_time)
    ORDER BY pc.created_at, pc.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.contest_participants cp
      WHERE cp.contest_id = race_row.id
        AND cp.user_id = NEW.user_id
        AND cp.eligible_by_admin = true
        AND cp.opted_in = true
        AND cp.joined_at IS NOT NULL
        AND cp.joined_at <= approval_time
    ) THEN
      SELECT COUNT(*)::INTEGER
      INTO approved_count
      FROM public.clips c
      JOIN public.contest_participants cp
        ON cp.contest_id = race_row.id
       AND cp.user_id = c.user_id
       AND cp.eligible_by_admin = true
       AND cp.opted_in = true
      WHERE c.user_id = NEW.user_id
        AND c.status = 'approved'
        AND c.reviewed_at >= GREATEST(race_row.starts_at, cp.joined_at)
        AND c.reviewed_at <= approval_time
        AND (race_row.ends_at IS NULL OR c.reviewed_at <= race_row.ends_at);

      IF approved_count >= race_row.goal_approved_clips THEN
        UPDATE public.prize_contests
        SET winner_user_id = NEW.user_id,
            winner_approved_clip_count = approved_count,
            winner_at = approval_time,
            status = 'completed',
            updated_at = now()
        WHERE id = race_row.id
          AND status = 'active'
          AND winner_user_id IS NULL;

        IF FOUND THEN
          INSERT INTO public.wallet_transactions
            (user_id, event_type, amount_inr, balance_delta, currency, source_table, source_id, description, metadata)
          VALUES
            (NEW.user_id, 'contest_prize', race_row.prize_amount_inr, race_row.prize_amount_inr,
             'INR', 'prize_contests', race_row.id,
             'Prize race won: ' || race_row.title,
             jsonb_build_object(
               'contest_id', race_row.id,
               'contest_title', race_row.title,
               'goal_approved_clips', race_row.goal_approved_clips,
               'approved_clips_at_award', approved_count,
               'trigger_clip_id', NEW.id,
               'awarded_at', approval_time
             ));
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clips_award_prize_race ON public.clips;
CREATE TRIGGER clips_award_prize_race
  AFTER UPDATE OF status ON public.clips
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.award_prize_race_for_approved_clip();

-- Keep the authenticated UPI payout RPC in sync with the prize credit so the newly awarded
-- prize can actually be withdrawn, with the same per-user advisory lock preventing double spend.
CREATE OR REPLACE FUNCTION public.request_clipper_payout(
  p_amount numeric,
  p_upi_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_clip_earnings numeric(14,2);
  v_approved_bonuses numeric(14,2);
  v_contest_prizes numeric(14,2);
  v_total_earned numeric(14,2);
  v_already_committed numeric(14,2);
  v_available numeric(14,2);
  v_payout public.payout_requests%ROWTYPE;
  v_upi text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION 'Enter a valid payout amount.';
  END IF;
  v_upi := lower(trim(coalesce(p_upi_id, '')));
  IF v_upi !~ '^[a-z0-9][a-z0-9._-]{0,100}@[a-z0-9][a-z0-9.-]{1,63}$' THEN
    RAISE EXCEPTION 'Enter a valid UPI ID, for example name@bank.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT coalesce(sum(e.amount), 0)::numeric(14,2)
    INTO v_clip_earnings FROM public.earnings e WHERE e.user_id = v_user_id;
  SELECT coalesce(sum(b.amount_inr), 0)::numeric(14,2)
    INTO v_approved_bonuses FROM public.bonus_claims b
    WHERE b.user_id = v_user_id AND b.status = 'approved';
  SELECT coalesce(sum(wt.balance_delta), 0)::numeric(14,2)
    INTO v_contest_prizes FROM public.wallet_transactions wt
    WHERE wt.user_id = v_user_id
      AND wt.event_type = 'contest_prize'
      AND wt.source_table = 'prize_contests';
  v_total_earned := v_clip_earnings + v_approved_bonuses + v_contest_prizes;

  SELECT coalesce(sum(p.amount), 0)::numeric(14,2)
    INTO v_already_committed FROM public.payout_requests p
    WHERE p.user_id = v_user_id AND p.status IN ('pending', 'approved', 'paid');
  v_available := greatest(0, v_total_earned - v_already_committed);
  IF round(p_amount, 2) > v_available THEN
    RAISE EXCEPTION 'Insufficient available balance. Available amount: % INR.', to_char(v_available, 'FM999999999990.00');
  END IF;

  INSERT INTO public.payout_requests (user_id, amount, status, upi_id)
    VALUES (v_user_id, round(p_amount, 2), 'pending', v_upi)
    RETURNING * INTO v_payout;
  RETURN jsonb_build_object(
    'id', v_payout.id, 'user_id', v_payout.user_id, 'amount', v_payout.amount,
    'status', v_payout.status, 'upi_id', v_payout.upi_id, 'requested_at', v_payout.requested_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.request_clipper_payout(numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_clipper_payout(numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_clipper_payout(numeric, text) TO authenticated;

-- Keep contest awards visible in the finance summary without folding them into clip earnings.
CREATE OR REPLACE VIEW public.admin_wallet_financial_summary AS
SELECT
  COUNT(*)::bigint AS transaction_count,
  COALESCE(SUM(amount_inr) FILTER (WHERE balance_delta > 0), 0)::numeric(14,2) AS gross_credits,
  COALESCE(SUM(amount_inr) FILTER (WHERE balance_delta < 0), 0)::numeric(14,2) AS gross_debits,
  COALESCE(SUM(balance_delta), 0)::numeric(14,2) AS net_wallet_liability,
  COALESCE(SUM(balance_delta) FILTER (WHERE event_type IN ('clip_earning','earning_adjustment')), 0)::numeric(14,2) AS net_clip_earnings,
  COALESCE(SUM(balance_delta) FILTER (WHERE event_type IN ('bonus_credit','bonus_reversal')), 0)::numeric(14,2) AS net_bonus_wallet_credits,
  COALESCE(SUM(amount_inr) FILTER (WHERE event_type = 'bonus_paid_direct'), 0)::numeric(14,2) AS bonuses_paid_direct,
  COALESCE(SUM(amount_inr) FILTER (WHERE event_type = 'payout_paid'), 0)::numeric(14,2) AS recorded_payout_payments,
  COALESCE(SUM(amount_inr) FILTER (WHERE event_type = 'payout_reserved'), 0)::numeric(14,2) AS payout_reservations_recorded,
  MAX(created_at) AS latest_transaction_at,
  COALESCE(SUM(balance_delta) FILTER (WHERE event_type = 'contest_prize'), 0)::numeric(14,2) AS net_contest_prizes
FROM public.wallet_transactions;
REVOKE ALL ON public.admin_wallet_financial_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_wallet_financial_summary TO service_role;

COMMENT ON TABLE public.prize_contests IS 'Admin-configured first-to-goal approved-clip prize contests.';
COMMENT ON TABLE public.leaderboard_eligibility IS 'Admin allowlist controlling which users may opt into the leaderboard.';
COMMENT ON TABLE public.leaderboard_preferences IS 'User-owned leaderboard opt-in, display name, and row visibility preference.';
COMMENT ON TABLE public.leaderboard_allowed_viewers IS 'Explicit viewers allowed to see a private leaderboard row when visibility_scope is selected.';
