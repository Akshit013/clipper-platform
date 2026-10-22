-- ============================================================
-- Clipper Platform — Database Schema
-- Migration 001: Core tables
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────
-- profiles: extends Supabase auth.users
-- ──────────────────────────────────────────────
CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'clipper' CHECK (role IN ('clipper', 'admin')),
  display_name  TEXT,
  instagram_handle TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase Auth. Role is clipper by default.';
COMMENT ON COLUMN public.profiles.role IS 'User role: clipper or admin. Admin must be set manually via DB or service-role API.';

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ──────────────────────────────────────────────
-- campaigns: managed by admins
-- ──────────────────────────────────────────────
CREATE TABLE public.campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  rate_per_1000 NUMERIC(10,2) NOT NULL CHECK (rate_per_1000 > 0),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.campaigns IS 'Campaigns with fixed rate per 1000 eligible views.';

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ──────────────────────────────────────────────
-- clips: submitted by clippers
-- ──────────────────────────────────────────────
CREATE TABLE public.clips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES public.campaigns(id),
  instagram_url TEXT NOT NULL,
  shortcode     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ,
  reviewed_by   UUID REFERENCES public.profiles(user_id)
);

COMMENT ON TABLE public.clips IS 'Instagram Reel clips submitted by clippers for campaigns.';

CREATE INDEX idx_clips_user_id ON public.clips(user_id);
CREATE INDEX idx_clips_campaign_id ON public.clips(campaign_id);
CREATE INDEX idx_clips_status ON public.clips(status);

-- ──────────────────────────────────────────────
-- metric_snapshots: timestamped view data
-- ──────────────────────────────────────────────
CREATE TABLE public.metric_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id         UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  observed_views  BIGINT,
  eligible_views  BIGINT,
  source          TEXT NOT NULL DEFAULT 'manual',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.metric_snapshots IS 'Timestamped metric snapshots for clips. Source indicates data origin.';

CREATE INDEX idx_metric_snapshots_clip_id ON public.metric_snapshots(clip_id);

-- ──────────────────────────────────────────────
-- earnings: calculated when clip is approved
-- ──────────────────────────────────────────────
CREATE TABLE public.earnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id         UUID UNIQUE NOT NULL REFERENCES public.clips(id),
  user_id         UUID NOT NULL REFERENCES public.profiles(user_id),
  campaign_id     UUID NOT NULL REFERENCES public.campaigns(id),
  eligible_views  BIGINT NOT NULL DEFAULT 0,
  rate_per_1000   NUMERIC(10,2) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.earnings IS 'Earnings records. amount = eligible_views / 1000 * rate_per_1000.';

CREATE INDEX idx_earnings_user_id ON public.earnings(user_id);
CREATE INDEX idx_earnings_campaign_id ON public.earnings(campaign_id);

-- ──────────────────────────────────────────────
-- payout_requests: clippers request payouts
-- ──────────────────────────────────────────────
CREATE TABLE public.payout_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(user_id),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  payment_reference TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at      TIMESTAMPTZ,
  processed_by      UUID REFERENCES public.profiles(user_id)
);

COMMENT ON TABLE public.payout_requests IS 'Payout requests from clippers. Must have sufficient available balance.';

CREATE INDEX idx_payout_requests_user_id ON public.payout_requests(user_id);
CREATE INDEX idx_payout_requests_status ON public.payout_requests(status);

-- ──────────────────────────────────────────────
-- audit_logs: track admin actions
-- ──────────────────────────────────────────────
CREATE TABLE public.audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES public.profiles(user_id),
  action        TEXT NOT NULL,
  target_table  TEXT NOT NULL,
  target_id     UUID,
  old_values    JSONB,
  new_values    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS 'Immutable audit trail for admin actions.';

CREATE INDEX idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target_table, target_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
