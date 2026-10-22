# Admin financial reporting features

Open `/admin/financials` to view the full wallet ledger. Each row includes the timestamp in IST (with original UTC timestamp beneath), clipper display name and user ID, event type, amount, signed wallet impact, description, source table/source ID, and transaction ID.

The overview dashboard includes a ledger-derived snapshot of net clip earnings, net bonus credits, directly paid bonuses, recorded payouts, net wallet liability and ledger-entry count. Use CSV for Excel-compatible reconciliation and PDF for a report you can share internally.

All endpoints use the existing server-side Supabase session plus admin-role check and the service-role client. Client-side direct database access is not used for the ledger.
