-- ClipperPlatform clip-removal financial reversals and editable approved views.
-- Requires migrations 006_admin_operations.sql and 008_bonus_wallet_history_dashboard.sql.
-- Keeps historical earning rows and appends wallet_transactions adjustments; no hard deletes.

-- Enrich the existing earning trigger so wallet ledger entries explain the adjustment.
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
                          'eligible_views', NEW.eligible_views, 'rate_per_1000', NEW.rate_per_1000,
                          'calculation_note', NEW.calculation_note));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.wallet_transactions
      (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
    VALUES
      (OLD.user_id, 'earning_adjustment', abs(coalesce(OLD.amount, 0)), -coalesce(OLD.amount, 0),
       'earnings', OLD.id, 'Clip earning removed from wallet history',
       jsonb_build_object('clip_id', OLD.clip_id, 'campaign_id', OLD.campaign_id,
                          'old_amount', OLD.amount, 'change_reason', 'earning row deleted',
                          'calculation_note', OLD.calculation_note));
    RETURN OLD;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      INSERT INTO public.wallet_transactions
        (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
      VALUES
        (OLD.user_id, 'earning_adjustment', abs(coalesce(OLD.amount, 0)), -coalesce(OLD.amount, 0),
         'earnings', OLD.id, 'Clip earning moved away from account',
         jsonb_build_object('clip_id', OLD.clip_id, 'change_reason', 'earning owner changed',
                            'old_amount', OLD.amount, 'new_amount', 0)),
        (NEW.user_id, 'earning_adjustment', abs(coalesce(NEW.amount, 0)), coalesce(NEW.amount, 0),
         'earnings', NEW.id, 'Clip earning moved into account',
         jsonb_build_object('clip_id', NEW.clip_id, 'change_reason', 'earning owner changed',
                            'old_amount', 0, 'new_amount', NEW.amount));
    ELSE
      v_delta := coalesce(NEW.amount, 0) - coalesce(OLD.amount, 0);
      IF v_delta <> 0 THEN
        INSERT INTO public.wallet_transactions
          (user_id, event_type, amount_inr, balance_delta, source_table, source_id, description, metadata)
        VALUES
          (NEW.user_id, 'earning_adjustment', abs(v_delta), v_delta,
           'earnings', NEW.id,
           CASE
             WHEN v_delta < 0 AND coalesce(NEW.amount, 0) = 0 THEN 'Clip earning reversed after clip removal'
             WHEN v_delta > 0 AND coalesce(OLD.amount, 0) = 0 THEN 'Clip earning restored or recalculated'
             WHEN v_delta > 0 THEN 'Clip earning increased after admin correction'
             ELSE 'Clip earning reduced after admin correction'
           END,
           jsonb_build_object('clip_id', NEW.clip_id, 'campaign_id', NEW.campaign_id,
                              'old_amount', OLD.amount, 'new_amount', NEW.amount,
                              'old_eligible_views', OLD.eligible_views,
                              'new_eligible_views', NEW.eligible_views,
                              'change_reason', CASE WHEN NEW.amount = 0 THEN 'clip removal or zero eligible amount' ELSE 'admin correction' END,
                              'calculation_note', NEW.calculation_note));
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

-- Admin-only atomic action. Removing a clip zeros its active earning (trigger writes negative ledger entry).
-- Restoring an approved clip recalculates from the clip's preserved eligible_views and campaign rate.
CREATE OR REPLACE FUNCTION public.admin_toggle_clip_removal(
  p_clip_id uuid,
  p_remove boolean,
  p_admin_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clip public.clips%ROWTYPE;
  v_earning public.earnings%ROWTYPE;
  v_has_earning boolean := false;
  v_before_amount numeric(14,2) := 0;
  v_after_amount numeric(14,2) := 0;
  v_rate numeric(12,4);
  v_views bigint;
  v_amount numeric(14,2);
BEGIN
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = p_admin_user_id AND p.role = 'admin'
  ) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF p_remove IS NULL THEN RAISE EXCEPTION 'Removal state is required.'; END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required.'; END IF;

  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clip not found.'; END IF;
  IF coalesce(v_clip.is_removed, false) = p_remove THEN
    IF p_remove THEN
      RAISE EXCEPTION 'This clip is already removed.';
    ELSE
      RAISE EXCEPTION 'This clip is not removed.';
    END IF;
  END IF;

  SELECT * INTO v_earning FROM public.earnings WHERE clip_id = v_clip.id FOR UPDATE;
  v_has_earning := FOUND;
  IF v_has_earning THEN v_before_amount := coalesce(v_earning.amount, 0); END IF;

  IF p_remove THEN
    UPDATE public.clips
      SET is_removed = true, removed_at = now(), removed_by = p_admin_user_id,
          removal_reason = trim(p_reason)
      WHERE id = v_clip.id RETURNING * INTO v_clip;

    IF v_has_earning AND (coalesce(v_earning.amount, 0) <> 0 OR coalesce(v_earning.eligible_views, 0) <> 0) THEN
      UPDATE public.earnings
        SET amount = 0, eligible_views = 0, calculated_at = now(),
            calculation_note = concat_ws(E'\n', nullif(calculation_note, ''), 'Admin clip removal reversal: ' || trim(p_reason))
        WHERE id = v_earning.id;
    END IF;
  ELSE
    UPDATE public.clips
      SET is_removed = false, removed_at = null, removed_by = null, removal_reason = null
      WHERE id = v_clip.id RETURNING * INTO v_clip;

    IF v_clip.status::text = 'approved' THEN
      SELECT c.rate_per_1000 INTO v_rate FROM public.campaigns c WHERE c.id = v_clip.campaign_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found; clip cannot be restored safely.'; END IF;
      v_views := greatest(0, coalesce(v_clip.eligible_views, 0));
      v_amount := round((v_views::numeric / 1000) * v_rate, 2);
      IF v_has_earning THEN
        UPDATE public.earnings
          SET eligible_views = v_views, rate_per_1000 = v_rate, amount = v_amount,
              calculated_at = now(),
              calculation_note = concat_ws(E'\n', nullif(calculation_note, ''), 'Admin restored clip: ' || trim(p_reason))
          WHERE id = v_earning.id;
      ELSIF v_views > 0 THEN
        INSERT INTO public.earnings
          (clip_id, user_id, campaign_id, eligible_views, rate_per_1000, amount, currency, calculated_at, calculation_note)
        VALUES
          (v_clip.id, v_clip.user_id, v_clip.campaign_id, v_views, v_rate, v_amount, 'INR', now(), 'Admin restored clip: ' || trim(p_reason));
      END IF;
    END IF;
  END IF;

  SELECT coalesce(e.amount, 0) INTO v_after_amount FROM public.earnings e WHERE e.clip_id = v_clip.id;
  IF NOT FOUND THEN v_after_amount := 0; END IF;

  INSERT INTO public.admin_management_audit
    (admin_user_id, target_user_id, entity_type, entity_id, action, reason, previous_values, new_values)
  VALUES
    (p_admin_user_id, v_clip.user_id, 'clip', v_clip.id::text,
     CASE WHEN p_remove THEN 'remove_clip_and_reverse_earning' ELSE 'restore_clip_and_recalculate_earning' END,
     trim(p_reason),
     jsonb_build_object('is_removed', NOT p_remove, 'status', v_clip.status::text,
                        'earning_amount', v_before_amount,
                        'eligible_views', CASE WHEN v_has_earning THEN v_earning.eligible_views ELSE null END),
     jsonb_build_object('is_removed', p_remove, 'status', v_clip.status::text,
                        'earning_amount', v_after_amount,
                        'wallet_balance_delta', v_after_amount - v_before_amount,
                        'eligible_views_preserved_on_clip', v_clip.eligible_views));

  RETURN jsonb_build_object(
    'ok', true,
    'message', CASE WHEN p_remove
      THEN CASE WHEN v_before_amount > 0 THEN 'Clip removed. Its unpaid clip earning was reversed and recorded in the wallet ledger.' ELSE 'Clip removed. No positive earning existed to reverse; the action was recorded in the audit log.' END
      ELSE 'Clip restored. Its approved earning was recalculated and any wallet adjustment was recorded.' END,
    'clip', to_jsonb(v_clip),
    'earning_amount_before', v_before_amount,
    'earning_amount_after', v_after_amount,
    'wallet_balance_delta', v_after_amount - v_before_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_clip_removal(uuid, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_clip_removal(uuid, boolean, uuid, text) TO service_role;

-- Recalculate eligible views and earning as one DB operation. The existing earnings trigger
-- writes a positive/negative wallet_transactions adjustment only when money actually changes.
CREATE OR REPLACE FUNCTION public.admin_update_approved_clip_views(
  p_clip_id uuid,
  p_eligible_views bigint,
  p_admin_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clip public.clips%ROWTYPE;
  v_earning public.earnings%ROWTYPE;
  v_has_earning boolean := false;
  v_before_amount numeric(14,2) := 0;
  v_after_amount numeric(14,2) := 0;
  v_rate numeric(12,4);
BEGIN
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = p_admin_user_id AND p.role = 'admin'
  ) THEN RAISE EXCEPTION 'Admin access required.'; END IF;
  IF p_eligible_views IS NULL OR p_eligible_views < 0 OR p_eligible_views > 1000000000 THEN
    RAISE EXCEPTION 'Verified eligible views must be a whole number from 0 to 1,000,000,000.';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reason of at least 3 characters is required.'; END IF;

  SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clip not found.'; END IF;
  IF v_clip.status::text <> 'approved' THEN RAISE EXCEPTION 'Eligible views can only be edited for an approved clip.'; END IF;
  IF coalesce(v_clip.is_removed, false) THEN RAISE EXCEPTION 'Restore this clip before editing its eligible views.'; END IF;

  SELECT c.rate_per_1000 INTO v_rate FROM public.campaigns c WHERE c.id = v_clip.campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found; eligible views were not changed.'; END IF;
  SELECT * INTO v_earning FROM public.earnings WHERE clip_id = v_clip.id FOR UPDATE;
  v_has_earning := FOUND;
  IF v_has_earning THEN v_before_amount := coalesce(v_earning.amount, 0); END IF;

  UPDATE public.clips SET eligible_views = p_eligible_views WHERE id = v_clip.id RETURNING * INTO v_clip;
  v_after_amount := round((p_eligible_views::numeric / 1000) * v_rate, 2);
  IF v_has_earning THEN
    UPDATE public.earnings
      SET eligible_views = p_eligible_views, rate_per_1000 = v_rate, amount = v_after_amount,
          calculated_at = now(),
          calculation_note = concat_ws(E'\n', nullif(calculation_note, ''), 'Admin eligible-view correction: ' || trim(p_reason))
      WHERE id = v_earning.id;
  ELSIF p_eligible_views > 0 THEN
    INSERT INTO public.earnings
      (clip_id, user_id, campaign_id, eligible_views, rate_per_1000, amount, currency, calculated_at, calculation_note)
    VALUES
      (v_clip.id, v_clip.user_id, v_clip.campaign_id, p_eligible_views, v_rate, v_after_amount, 'INR', now(), 'Admin eligible-view correction: ' || trim(p_reason));
  END IF;

  RETURN jsonb_build_object('ok', true, 'eligible_views', p_eligible_views,
    'earning_amount_before', v_before_amount, 'earning_amount_after', v_after_amount,
    'wallet_balance_delta', v_after_amount - v_before_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_approved_clip_views(uuid, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_approved_clip_views(uuid, bigint, uuid, text) TO service_role;

-- Backfill removals performed before this patch: reverse any still-active earnings for soft-removed clips.
-- The earning trigger appends a negative ledger adjustment; the rows themselves remain for audit/history.
UPDATE public.earnings e
SET amount = 0,
    eligible_views = 0,
    calculated_at = now(),
    calculation_note = concat_ws(E'\n', nullif(e.calculation_note, ''), 'Backfilled reversal: clip had already been soft-removed before financial reversal patch.')
FROM public.clips c
WHERE c.id = e.clip_id
  AND coalesce(c.is_removed, false) = true
  AND (coalesce(e.amount, 0) <> 0 OR coalesce(e.eligible_views, 0) <> 0);

NOTIFY pgrst, 'reload schema';
