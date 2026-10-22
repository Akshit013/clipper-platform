-- ============================================================
-- Clipper Platform — Database Functions
-- Migration 003: Transactional functions for atomic operations
-- ============================================================

-- ──────────────────────────────────────────────
-- Calculate available balance for a user
-- (total approved earnings - total paid/pending payouts)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_available_balance(p_user_id UUID)
RETURNS NUMERIC(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  total_earned NUMERIC(12,2);
  total_reserved NUMERIC(12,2);
BEGIN
  -- Sum all approved earnings
  SELECT COALESCE(SUM(amount), 0) INTO total_earned
  FROM public.earnings
  WHERE user_id = p_user_id;

  -- Sum all non-rejected payout requests (pending + approved + paid)
  SELECT COALESCE(SUM(amount), 0) INTO total_reserved
  FROM public.payout_requests
  WHERE user_id = p_user_id
  AND status != 'rejected';

  RETURN total_earned - total_reserved;
END;
$$;

-- ──────────────────────────────────────────────
-- Atomic clip approval + earnings calculation
-- Called by admin via service role
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_clip_with_earnings(
  p_clip_id UUID,
  p_eligible_views BIGINT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip RECORD;
  v_campaign RECORD;
  v_amount NUMERIC(12,2);
  v_earning_id UUID;
BEGIN
  -- Lock the clip row
  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clip not found: %', p_clip_id;
  END IF;

  IF v_clip.status != 'pending' THEN
    RAISE EXCEPTION 'Clip is already %', v_clip.status;
  END IF;

  -- Get campaign rate
  SELECT * INTO v_campaign
  FROM public.campaigns
  WHERE id = v_clip.campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', v_clip.campaign_id;
  END IF;

  -- Calculate earnings: eligible_views / 1000 * rate_per_1000
  v_amount := (p_eligible_views::NUMERIC / 1000.0) * v_campaign.rate_per_1000;

  -- Update clip status
  UPDATE public.clips
  SET status = 'approved',
      reviewed_at = now(),
      reviewed_by = p_admin_id
  WHERE id = p_clip_id;

  -- Insert metric snapshot
  INSERT INTO public.metric_snapshots (clip_id, eligible_views, source)
  VALUES (p_clip_id, p_eligible_views, 'admin_review');

  -- Insert earnings record
  INSERT INTO public.earnings (clip_id, user_id, campaign_id, eligible_views, rate_per_1000, amount)
  VALUES (p_clip_id, v_clip.user_id, v_clip.campaign_id, p_eligible_views, v_campaign.rate_per_1000, v_amount)
  RETURNING id INTO v_earning_id;

  -- Audit log
  INSERT INTO public.audit_logs (admin_id, action, target_table, target_id, new_values)
  VALUES (
    p_admin_id,
    'approve_clip',
    'clips',
    p_clip_id,
    jsonb_build_object(
      'eligible_views', p_eligible_views,
      'rate_per_1000', v_campaign.rate_per_1000,
      'earnings_amount', v_amount,
      'earning_id', v_earning_id
    )
  );

  RETURN jsonb_build_object(
    'clip_id', p_clip_id,
    'earning_id', v_earning_id,
    'amount', v_amount,
    'eligible_views', p_eligible_views,
    'rate_per_1000', v_campaign.rate_per_1000
  );
END;
$$;

-- ──────────────────────────────────────────────
-- Atomic reject clip
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_clip(
  p_clip_id UUID,
  p_admin_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip RECORD;
BEGIN
  SELECT * INTO v_clip
  FROM public.clips
  WHERE id = p_clip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clip not found: %', p_clip_id;
  END IF;

  IF v_clip.status != 'pending' THEN
    RAISE EXCEPTION 'Clip is already %', v_clip.status;
  END IF;

  UPDATE public.clips
  SET status = 'rejected',
      reviewed_at = now(),
      reviewed_by = p_admin_id
  WHERE id = p_clip_id;

  INSERT INTO public.audit_logs (admin_id, action, target_table, target_id, old_values)
  VALUES (
    p_admin_id,
    'reject_clip',
    'clips',
    p_clip_id,
    jsonb_build_object('previous_status', v_clip.status)
  );
END;
$$;

-- ──────────────────────────────────────────────
-- Atomic payout request with balance check
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_payout(
  p_user_id UUID,
  p_amount NUMERIC(12,2)
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available NUMERIC(12,2);
  v_request_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be positive';
  END IF;

  -- Get available balance (with implicit lock via the function's queries)
  v_available := public.get_available_balance(p_user_id);

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance. Available: %, Requested: %', v_available, p_amount;
  END IF;

  INSERT INTO public.payout_requests (user_id, amount, status)
  VALUES (p_user_id, p_amount, 'pending')
  RETURNING id INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- ──────────────────────────────────────────────
-- Admin: process payout (approve + record payment)
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_payout(
  p_request_id UUID,
  p_admin_id UUID,
  p_new_status TEXT,
  p_payment_reference TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  IF p_new_status NOT IN ('approved', 'paid', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT * INTO v_request
  FROM public.payout_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found: %', p_request_id;
  END IF;

  -- Validate state transitions
  IF v_request.status = 'paid' THEN
    RAISE EXCEPTION 'Payout already paid';
  END IF;

  IF v_request.status = 'rejected' THEN
    RAISE EXCEPTION 'Payout already rejected';
  END IF;

  IF p_new_status = 'paid' AND p_payment_reference IS NULL THEN
    RAISE EXCEPTION 'Payment reference required when marking as paid';
  END IF;

  UPDATE public.payout_requests
  SET status = p_new_status,
      payment_reference = COALESCE(p_payment_reference, payment_reference),
      processed_at = now(),
      processed_by = p_admin_id
  WHERE id = p_request_id;

  INSERT INTO public.audit_logs (admin_id, action, target_table, target_id, old_values, new_values)
  VALUES (
    p_admin_id,
    'process_payout',
    'payout_requests',
    p_request_id,
    jsonb_build_object('previous_status', v_request.status),
    jsonb_build_object(
      'new_status', p_new_status,
      'payment_reference', p_payment_reference,
      'amount', v_request.amount
    )
  );
END;
$$;
