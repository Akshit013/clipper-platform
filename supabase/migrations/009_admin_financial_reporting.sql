-- ClipperPlatform admin financial ledger/reporting support.
-- Requires 008_bonus_wallet_history_dashboard.sql to have been applied first.
-- Idempotent: creates indexes and an aggregate view only; it does not rewrite or delete financial records.

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_type
  ON public.wallet_transactions (created_at DESC, event_type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_type_created
  ON public.wallet_transactions (user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_direction_created
  ON public.wallet_transactions (balance_delta, created_at DESC);

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
  MAX(created_at) AS latest_transaction_at
FROM public.wallet_transactions;

REVOKE ALL ON public.admin_wallet_financial_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_wallet_financial_summary TO service_role;
