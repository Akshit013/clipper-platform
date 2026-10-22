-- ClipperPlatform bonus milestone claims. Additive migration; does not alter clip or payout records.
CREATE TABLE IF NOT EXISTS public.bonus_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone INTEGER NOT NULL CHECK (milestone IN (25, 50, 100)),
  amount_inr INTEGER NOT NULL CHECK (
    (milestone = 25 AND amount_inr = 100) OR
    (milestone = 50 AND amount_inr = 200) OR
    (milestone = 100 AND amount_inr = 500)
  ),
  approved_clip_count_at_claim INTEGER NOT NULL CHECK (approved_clip_count_at_claim >= milestone),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES auth.users(id),
  payment_reference TEXT,
  admin_note TEXT,
  CONSTRAINT bonus_claims_user_milestone_unique UNIQUE (user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_bonus_claims_status_requested
  ON public.bonus_claims(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonus_claims_user
  ON public.bonus_claims(user_id, requested_at DESC);

ALTER TABLE public.bonus_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own bonus claims" ON public.bonus_claims;
CREATE POLICY "Users can view their own bonus claims"
  ON public.bonus_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Intentionally no user INSERT/UPDATE policy: claims are created only by the server endpoint,
-- which checks the signed-in user and counts approved clips using server-only credentials.
