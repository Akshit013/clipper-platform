-- ============================================================
-- Clipper Platform — Row Level Security Policies
-- Migration 002: RLS for all tables
-- ============================================================

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
$$;

-- ════════════════════════════════════════════════
-- PROFILES
-- ════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- Users can update their own display_name and instagram_handle only
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
  );

-- No public insert (handled by trigger)
-- No public delete

-- ════════════════════════════════════════════════
-- CAMPAIGNS
-- ════════════════════════════════════════════════
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active campaigns
CREATE POLICY "campaigns_select_active" ON public.campaigns
  FOR SELECT USING (is_active = true);

-- Admins can read all campaigns (including inactive)
CREATE POLICY "campaigns_select_admin" ON public.campaigns
  FOR SELECT USING (public.is_admin());

-- Only admins can insert campaigns
CREATE POLICY "campaigns_insert_admin" ON public.campaigns
  FOR INSERT WITH CHECK (public.is_admin());

-- Only admins can update campaigns
CREATE POLICY "campaigns_update_admin" ON public.campaigns
  FOR UPDATE USING (public.is_admin());

-- Only admins can delete campaigns
CREATE POLICY "campaigns_delete_admin" ON public.campaigns
  FOR DELETE USING (public.is_admin());

-- ════════════════════════════════════════════════
-- CLIPS
-- ════════════════════════════════════════════════
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

-- Clippers can read their own clips
CREATE POLICY "clips_select_own" ON public.clips
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all clips
CREATE POLICY "clips_select_admin" ON public.clips
  FOR SELECT USING (public.is_admin());

-- Clippers can insert their own clips (status must be pending)
CREATE POLICY "clips_insert_own" ON public.clips
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- Only admins can update clips (approve/reject, set reviewed_by/reviewed_at)
CREATE POLICY "clips_update_admin" ON public.clips
  FOR UPDATE USING (public.is_admin());

-- ════════════════════════════════════════════════
-- METRIC_SNAPSHOTS
-- ════════════════════════════════════════════════
ALTER TABLE public.metric_snapshots ENABLE ROW LEVEL SECURITY;

-- Clippers can read snapshots for their own clips
CREATE POLICY "metrics_select_own" ON public.metric_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clips
      WHERE clips.id = metric_snapshots.clip_id
      AND clips.user_id = auth.uid()
    )
  );

-- Admins can read all snapshots
CREATE POLICY "metrics_select_admin" ON public.metric_snapshots
  FOR SELECT USING (public.is_admin());

-- Only admins can insert/update metric snapshots
CREATE POLICY "metrics_insert_admin" ON public.metric_snapshots
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "metrics_update_admin" ON public.metric_snapshots
  FOR UPDATE USING (public.is_admin());

-- ════════════════════════════════════════════════
-- EARNINGS
-- ════════════════════════════════════════════════
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;

-- Clippers can read their own earnings
CREATE POLICY "earnings_select_own" ON public.earnings
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all earnings
CREATE POLICY "earnings_select_admin" ON public.earnings
  FOR SELECT USING (public.is_admin());

-- Only admins can insert/update earnings (via server action with service role)
CREATE POLICY "earnings_insert_admin" ON public.earnings
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "earnings_update_admin" ON public.earnings
  FOR UPDATE USING (public.is_admin());

-- ════════════════════════════════════════════════
-- PAYOUT_REQUESTS
-- ════════════════════════════════════════════════
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- Clippers can read their own payout requests
CREATE POLICY "payouts_select_own" ON public.payout_requests
  FOR SELECT USING (user_id = auth.uid());

-- Admins can read all payout requests
CREATE POLICY "payouts_select_admin" ON public.payout_requests
  FOR SELECT USING (public.is_admin());

-- Clippers can insert payout requests for themselves (status must be pending)
CREATE POLICY "payouts_insert_own" ON public.payout_requests
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- Only admins can update payout requests (approve/reject/pay)
CREATE POLICY "payouts_update_admin" ON public.payout_requests
  FOR UPDATE USING (public.is_admin());

-- ════════════════════════════════════════════════
-- AUDIT_LOGS
-- ════════════════════════════════════════════════
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "audit_select_admin" ON public.audit_logs
  FOR SELECT USING (public.is_admin());

-- Only admins can insert audit logs (typically via service role)
CREATE POLICY "audit_insert_admin" ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_admin());

-- No updates or deletes on audit logs (immutable)
