-- Admin operations upgrade: reversible clip removal, clipper suspension metadata, audit trail.
-- This migration preserves clip and financial records; it does not hard-delete users or earnings.

ALTER TABLE public.clips
  ADD COLUMN IF NOT EXISTS is_removed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS removal_reason text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS suspension_reason text;

CREATE INDEX IF NOT EXISTS clips_admin_management_filter_idx
  ON public.clips (is_removed, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS clips_admin_management_user_idx
  ON public.clips (user_id, is_removed, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS profiles_admin_suspended_idx
  ON public.profiles (is_suspended, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_management_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  entity_type text NOT NULL CHECK (entity_type IN ('clip', 'clipper', 'campaign', 'payout', 'bonus')),
  entity_id text NOT NULL,
  action text NOT NULL,
  reason text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_management_audit_created_idx
  ON public.admin_management_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_management_audit_entity_idx
  ON public.admin_management_audit (entity_type, entity_id, created_at DESC);

ALTER TABLE public.admin_management_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_management_audit FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_management_audit TO service_role;

-- Replace the original owner/admin SELECT policy so soft-removed submissions are hidden
-- from clippers but remain visible to admins for auditing and possible restoration.
-- Remove SELECT-only policies so an older permissive owner policy cannot expose removed clips.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.clips'::regclass AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clips', policy_row.polname);
  END LOOP;
END;
$$;
CREATE POLICY "clipper reads visible own clips admin reads all"
  ON public.clips FOR SELECT TO authenticated
  USING (
    (user_id = (SELECT auth.uid()) AND COALESCE(is_removed, false) = false)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'admin'
    )
  );

-- A restrictive rule prevents currently suspended accounts from submitting clips,
-- even if another permissive INSERT policy already exists.
DROP POLICY IF EXISTS "active accounts can submit clips" ON public.clips;
CREATE POLICY "active accounts can submit clips"
  ON public.clips AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid()) AND COALESCE(p.is_suspended, false) = true
    )
  );

COMMENT ON COLUMN public.clips.is_removed IS
  'Soft removal from clipper-facing views. Original clip and earning records are retained for audit/history.';
COMMENT ON COLUMN public.profiles.is_suspended IS
  'Admin-managed account suspension indicator; login access is also banned through Supabase Auth Admin API.';
NOTIFY pgrst, 'reload schema';
