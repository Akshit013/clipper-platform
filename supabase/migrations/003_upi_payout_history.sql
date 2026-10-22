-- Per-request UPI destination and safe payout reservation.
-- Earnings and payouts are denominated in INR in this application.

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS upi_id text;

COMMENT ON COLUMN public.payout_requests.upi_id IS
  'UPI ID supplied by the clipper for this payout request; kept as a snapshot for the payment record.';

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
  v_total_earned numeric(14,2);
  v_already_committed numeric(14,2);
  v_available numeric(14,2);
  v_payout public.payout_requests%ROWTYPE;
  v_upi text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN
    RAISE EXCEPTION 'Enter a valid payout amount.';
  END IF;

  v_upi := lower(trim(coalesce(p_upi_id, '')));
  IF v_upi !~ '^[a-z0-9][a-z0-9._-]{0,100}@[a-z0-9][a-z0-9.-]{1,63}$' THEN
    RAISE EXCEPTION 'Enter a valid UPI ID, for example name@bank.';
  END IF;

  -- Serialize requests for a single clipper so two simultaneous requests cannot
  -- reserve the same available earnings twice.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT coalesce(sum(e.amount), 0)::numeric(14,2)
    INTO v_total_earned
    FROM public.earnings e
    WHERE e.user_id = v_user_id;

  -- Pending and approved amounts are reserved; paid amounts remain deducted.
  -- Rejected amounts are released back to the available balance.
  SELECT coalesce(sum(p.amount), 0)::numeric(14,2)
    INTO v_already_committed
    FROM public.payout_requests p
    WHERE p.user_id = v_user_id
      AND p.status IN ('pending', 'approved', 'paid');

  v_available := greatest(0, v_total_earned - v_already_committed);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Insufficient available balance. Available amount: % INR.', to_char(v_available, 'FM999999999990.00');
  END IF;

  INSERT INTO public.payout_requests (user_id, amount, status, upi_id)
    VALUES (v_user_id, round(p_amount, 2), 'pending', v_upi)
    RETURNING * INTO v_payout;

  RETURN jsonb_build_object(
    'id', v_payout.id,
    'user_id', v_payout.user_id,
    'amount', v_payout.amount,
    'status', v_payout.status,
    'upi_id', v_payout.upi_id,
    'requested_at', v_payout.requested_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_clipper_payout(numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_clipper_payout(numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_clipper_payout(numeric, text) TO authenticated;
