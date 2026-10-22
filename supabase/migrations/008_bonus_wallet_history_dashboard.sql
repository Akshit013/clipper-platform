-- ClipperPlatform: bonus wallet balance + timestamped wallet ledger.
-- Safe to re-run: table/index/policies/triggers are recreated idempotently and legacy backfill
-- uses NOT EXISTS checks. Apply in Supabase SQL Editor before deploying the UI.

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'clip_earning', 'earning_adjustment', 'bonus_credit', 'bonus_reversal',
    'bonus_paid_direct', 'payout_reserved', 'payout_paid', 'payout_reversal', 'manual_adjustment'
  )),
  amount_inr NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_inr >= 0),
  balance_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  source_table TEXT,
  source_id UUID,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_source
  ON public.wallet_transactions(source_table, source_id);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_transactions_select_own ON public.wallet_transactions;
CREATE POLICY wallet_transactions_select_own
  ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM anon, authenticated;
GRANT SELECT ON public.wallet_transactions TO authenticated;

-- Record every new earning; adjustments append a separate row instead of rewriting history.
CREATE OR REPLACE FUNCTION public.capture_earning_wallet_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delta NUMERIC(14,2);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.wallet_transactions
      (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
    VALUES
      (NEW.user_id, 'clip_earning', abs(coalesce(NEW.amount, 0)), coalesce(NEW.amount, 0),
       'earnings', NEW.id, 'Clip earning added to wallet',
       jsonb_build_object('clip_id', NEW.clip_id, 'campaign_id', NEW.campaign_id,
                          'eligible_views', NEW.eligible_views, 'rate_per_1000', NEW.rate_per_1000));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.wallet_transactions
      (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
    VALUES
      (OLD.user_id, 'earning_adjustment', abs(coalesce(OLD.amount, 0)), -coalesce(OLD.amount, 0),
       'earnings', OLD.id, 'Clip earning removed from wallet history',
       jsonb_build_object('clip_id', OLD.clip_id, 'campaign_id', OLD.campaign_id, 'change_reason', 'earning row deleted'));
    RETURN OLD;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (OLD.user_id, 'earning_adjustment', abs(coalesce(OLD.amount, 0)), -coalesce(OLD.amount, 0),
         'earnings', OLD.id, 'Clip earning moved away from account',
         jsonb_build_object('clip_id', OLD.clip_id, 'change_reason', 'earning owner changed')),
        (NEW.user_id, 'earning_adjustment', abs(coalesce(NEW.amount, 0)), coalesce(NEW.amount, 0),
         'earnings', NEW.id, 'Clip earning moved into account',
         jsonb_build_object('clip_id', NEW.clip_id, 'change_reason', 'earning owner changed'));
    ELSE
      v_delta := coalesce(NEW.amount, 0) - coalesce(OLD.amount, 0);
      IF v_delta <> 0 THEN
        INSERT INTO public.wallet_transactions
          (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
        VALUES
          (NEW.user_id, 'earning_adjustment', abs(v_delta), v_delta,
           'earnings', NEW.id,
           CASE WHEN v_delta > 0 THEN 'Clip earning increased' ELSE 'Clip earning reduced' END,
           jsonb_build_object('clip_id', NEW.clip_id, 'old_amount', OLD.amount, 'new_amount', NEW.amount));
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS wallet_capture_earning_transaction ON public.earnings;
CREATE TRIGGER wallet_capture_earning_transaction
  AFTER INSERT OR UPDATE OR DELETE ON public.earnings
  FOR EACH ROW EXECUTE FUNCTION public.capture_earning_wallet_transaction();

-- Approved bonuses create wallet credits. If an approved bonus is later changed to rejected
-- or marked paid directly, append a reversal so the same bonus cannot be counted twice.
CREATE OR REPLACE FUNCTION public.capture_bonus_wallet_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'bonus_credit', NEW.amount_inr, NEW.amount_inr, 'bonus_claims', NEW.id,
         NEW.milestone::text || '-clip bonus approved and added to wallet',
         jsonb_build_object('milestone', NEW.milestone, 'processed_at', NEW.processed_at));
    ELSIF NEW.status = 'paid' THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'bonus_paid_direct', NEW.amount_inr, 0, 'bonus_claims', NEW.id,
         NEW.milestone::text || '-clip bonus paid directly by admin (not a wallet credit)',
         jsonb_build_object('milestone', NEW.milestone, 'payment_reference', NEW.payment_reference));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      IF OLD.status = 'paid' THEN
        RAISE EXCEPTION 'A bonus already marked paid directly cannot be re-approved.';
      END IF;
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'bonus_credit', NEW.amount_inr, NEW.amount_inr, 'bonus_claims', NEW.id,
         NEW.milestone::text || '-clip bonus approved and added to wallet',
         jsonb_build_object('milestone', NEW.milestone, 'previous_status', OLD.status, 'new_status', NEW.status));
    ELSIF OLD.status = 'approved' AND NEW.status IN ('rejected', 'pending', 'paid') THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (OLD.user_id, 'bonus_reversal', OLD.amount_inr, -OLD.amount_inr, 'bonus_claims', OLD.id,
         OLD.milestone::text || '-clip bonus wallet credit reversed',
         jsonb_build_object('previous_status', OLD.status, 'new_status', NEW.status, 'payment_reference', NEW.payment_reference));
      IF NEW.status = 'paid' THEN
        INSERT INTO public.wallet_transactions
          (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
        VALUES
          (NEW.user_id, 'bonus_paid_direct', NEW.amount_inr, 0, 'bonus_claims', NEW.id,
           NEW.milestone::text || '-clip bonus paid directly by admin (not a wallet credit)',
           jsonb_build_object('milestone', NEW.milestone, 'payment_reference', NEW.payment_reference));
      END IF;
    ELSIF NEW.status = 'paid' THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'bonus_paid_direct', NEW.amount_inr, 0, 'bonus_claims', NEW.id,
         NEW.milestone::text || '-clip bonus paid directly by admin (not a wallet credit)',
         jsonb_build_object('milestone', NEW.milestone, 'payment_reference', NEW.payment_reference));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_capture_bonus_transaction ON public.bonus_claims;
CREATE TRIGGER wallet_capture_bonus_transaction
  AFTER INSERT OR UPDATE ON public.bonus_claims
  FOR EACH ROW EXECUTE FUNCTION public.capture_bonus_wallet_transaction();

-- Record withdrawals when an admin marks a payout paid. A rejected payout releases its
-- reservation, so append a positive reversal if a previously paid row is explicitly rejected.
CREATE OR REPLACE FUNCTION public.capture_payout_wallet_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('pending', 'approved') THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'payout_reserved', abs(coalesce(NEW.amount, 0)), -coalesce(NEW.amount, 0), 'payout_requests', NEW.id,
         'Payout request submitted · funds reserved',
         jsonb_build_object('upi_id', NEW.upi_id));
    ELSIF NEW.status = 'paid' THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'payout_paid', abs(coalesce(NEW.amount, 0)), -coalesce(NEW.amount, 0), 'payout_requests', NEW.id,
         'Payout created and marked paid',
         jsonb_build_object('upi_id', NEW.upi_id, 'payment_reference', NEW.payment_reference));
    END IF;
    RETURN NEW;
  END IF;

  -- If a rejected request is reopened, reserve its amount again.
  IF OLD.status = 'rejected' AND NEW.status IN ('pending', 'approved', 'paid') THEN
    INSERT INTO public.wallet_transactions
      (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
    VALUES
      (NEW.user_id, 'payout_reserved', abs(coalesce(NEW.amount, 0)), -coalesce(NEW.amount, 0), 'payout_requests', NEW.id,
       'Payout request reopened · funds reserved again',
       jsonb_build_object('previous_status', OLD.status, 'new_status', NEW.status, 'upi_id', NEW.upi_id));
  END IF;

  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    -- Active requests were already reserved; payment changes the request state, not
    -- the spendable balance a second time. Reopened requests have just been re-reserved above.
    IF OLD.status IN ('pending', 'approved') THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'payout_paid', abs(coalesce(NEW.amount, 0)), 0, 'payout_requests', NEW.id,
         'Reserved payout marked as paid by admin',
         jsonb_build_object('upi_id', NEW.upi_id, 'payment_reference', NEW.payment_reference));
    ELSIF OLD.status = 'rejected' THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (NEW.user_id, 'payout_paid', abs(coalesce(NEW.amount, 0)), 0, 'payout_requests', NEW.id,
         'Reopened payout marked as paid by admin',
         jsonb_build_object('upi_id', NEW.upi_id, 'payment_reference', NEW.payment_reference));
    END IF;
  ELSIF NEW.status = 'rejected' AND OLD.status IN ('pending', 'approved', 'paid')
    AND EXISTS (SELECT 1 FROM public.wallet_transactions wt
                WHERE wt.event_type = 'payout_reserved' AND wt.source_table = 'payout_requests' AND wt.source_id = NEW.id) THEN
    INSERT INTO public.wallet_transactions
      (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
    VALUES
      (NEW.user_id, 'payout_reversal', abs(coalesce(NEW.amount, 0)), coalesce(NEW.amount, 0), 'payout_requests', NEW.id,
       'Payout rejected · reserved funds released back to available balance',
       jsonb_build_object('payment_reference', NEW.payment_reference));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_capture_payout_transaction ON public.payout_requests;
CREATE TRIGGER wallet_capture_payout_transaction
  AFTER INSERT OR UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.capture_payout_wallet_transaction();

-- Backfill existing records using the best timestamp already available. Inserts are
-- idempotent and do not duplicate current ledger rows when this migration is re-run.
INSERT INTO public.wallet_transactions
  (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, created_at, metadata)
SELECT e.user_id, 'clip_earning', abs(coalesce(e.amount, 0)), coalesce(e.amount, 0),
       'earnings', e.id, 'Existing clip earning · imported from earnings history',
       coalesce(e.calculated_at, now()),
       jsonb_build_object('legacy_backfill', true, 'clip_id', e.clip_id, 'campaign_id', e.campaign_id,
                          'eligible_views', e.eligible_views, 'rate_per_1000', e.rate_per_1000)
FROM public.earnings e
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallet_transactions wt
  WHERE wt.event_type = 'clip_earning' AND wt.source_table = 'earnings' AND wt.source_id = e.id
);

INSERT INTO public.wallet_transactions
  (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, created_at, metadata)
SELECT b.user_id, 'bonus_credit', b.amount_inr, b.amount_inr,
       'bonus_claims', b.id, b.milestone::text || '-clip bonus already approved · imported to wallet history',
       coalesce(b.processed_at, b.requested_at, now()),
       jsonb_build_object('legacy_backfill', true, 'milestone', b.milestone,
                          'timestamp_note', CASE WHEN b.processed_at IS NULL THEN 'Approval timestamp unavailable; using claim request time' ELSE 'Using processed_at' END)
FROM public.bonus_claims b
WHERE b.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.event_type = 'bonus_credit' AND wt.source_table = 'bonus_claims' AND wt.source_id = b.id
  );

INSERT INTO public.wallet_transactions
  (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, created_at, metadata)
SELECT b.user_id, 'bonus_paid_direct', b.amount_inr, 0,
       'bonus_claims', b.id, b.milestone::text || '-clip bonus already marked paid directly by admin',
       coalesce(b.processed_at, b.requested_at, now()),
       jsonb_build_object('legacy_backfill', true, 'milestone', b.milestone, 'payment_reference', b.payment_reference,
                          'timestamp_note', CASE WHEN b.processed_at IS NULL THEN 'Payment timestamp unavailable; using claim request time' ELSE 'Using processed_at' END)
FROM public.bonus_claims b
WHERE b.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.event_type = 'bonus_paid_direct' AND wt.source_table = 'bonus_claims' AND wt.source_id = b.id
  );

INSERT INTO public.wallet_transactions
  (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, created_at, metadata)
SELECT p.user_id, 'payout_reserved', abs(coalesce(p.amount, 0)), -coalesce(p.amount, 0),
       'payout_requests', p.id, 'Existing payout request · funds reserved from wallet history',
       coalesce(p.requested_at, now()),
       jsonb_build_object('legacy_backfill', true, 'upi_id', p.upi_id,
                          'timestamp_note', CASE WHEN p.requested_at IS NULL THEN 'Request timestamp unavailable; using migration time' ELSE 'Using requested_at' END)
FROM public.payout_requests p
WHERE p.status IN ('pending', 'approved', 'paid')
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.event_type = 'payout_reserved' AND wt.source_table = 'payout_requests' AND wt.source_id = p.id
  );

INSERT INTO public.wallet_transactions
  (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, created_at, metadata)
SELECT p.user_id, 'payout_paid', abs(coalesce(p.amount, 0)), 0,
       'payout_requests', p.id, 'Existing payout marked as paid · imported from payout history',
       coalesce(p.processed_at, p.requested_at, now()),
       jsonb_build_object('legacy_backfill', true, 'upi_id', p.upi_id, 'payment_reference', p.payment_reference,
                          'timestamp_note', CASE WHEN p.processed_at IS NULL THEN 'Paid timestamp unavailable; using request time' ELSE 'Using processed_at' END)
FROM public.payout_requests p
WHERE p.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.event_type = 'payout_paid' AND wt.source_table = 'payout_requests' AND wt.source_id = p.id
  );

-- Keep the spendable balance and payout RPC in agreement: clip earnings + approved bonuses,
-- minus pending/approved/paid payout requests. A bonus marked paid directly is never double-counted.
CREATE OR REPLACE FUNCTION public.request_clipper_payout(
  p_amount numeric,
  p_upi_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_clip_earnings numeric(14,2);
  v_approved_bonuses numeric(14,2);
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
  v_total_earned := v_clip_earnings + v_approved_bonuses;

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
