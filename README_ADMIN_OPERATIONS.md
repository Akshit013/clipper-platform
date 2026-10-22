# ClipperPlatform Admin Operations Upgrade

This is an additive patch for the existing Next.js + Supabase project. It does not overwrite the main `/admin` page, existing campaign pages, payout tools, bonus claims page, or `.env.local`.

## What it adds

- A new protected `/admin/manage` operations center linked from the existing admin resource navigation.
- A searchable and filterable clip table covering pending, approved, rejected, and removed clips, including per-clipper drill-down, reported views/likes, eligible views, earnings, campaign, and Instagram account.
- Admin editing of Reel URL, self-reported views/likes, review note, and (for approved clips) verified eligible views. Correcting verified eligible views recalculates the linked earning at the campaign rate. The correction and reason are written to the audit log.
- Reversible **soft removal** with a required reason. Removed clips are hidden from clipper-facing reads, but their original clip/earning/payment history remains for accounting and audit purposes. Admins can restore them.
- Clipper-account suspension/restoration using Supabase Auth bans and profile metadata, preserving the person's clips, bonus claims, earnings, and payouts. Permanent deletion is deliberately not included because cascading deletion can destroy financial history.
- Bonus and payout snapshots with links to existing managers, CSV export of the filtered clip list, overview metrics, and a dedicated audit log.
- Migration 006 adds removal/suspension metadata and the admin audit table. The installer also updates the bonus claim endpoint so removed clips do not count toward bonus milestones.

## Important financial behavior

- The clippers' reported views/likes are unverified and are never copied into earnings automatically.
- Only an admin can change verified eligible views for an already-approved clip. This recalculates the associated earning; already-paid transfers are not reversed automatically.
- Removing a clip hides it from the clipper but keeps its earning record untouched. If an unearned amount must be corrected, edit verified eligible views with a reason so the change is explicit and audited.
- Removing a clipper from active use is implemented as suspension rather than hard deletion. This safely preserves transaction and audit history.
- Admin mutations use a server-only Supabase service-role client **only after checking the authenticated session and confirming the profile role is `admin`**. Never expose the service-role key in client code.

## Install

1. Stop `npm run dev` with `Control + C`.
2. Extract this ZIP at the root of your project (the same folder that contains `package.json`).
3. Run the installer from the project root:

   ```bash
   node scripts/install-admin-operations.mjs
   ```

   It backs up the navigation and bonus-claim source files before editing them. It does not modify `.env.local`.

4. Apply `supabase/migrations/006_admin_operations.sql` in Supabase Dashboard → SQL Editor → New query. To copy it on macOS, run this command in Terminal (not inside SQL Editor):

   ```bash
   pbcopy < supabase/migrations/006_admin_operations.sql
   ```

   Then paste into the Supabase SQL Editor and click Run. Verify that Supabase reports Success.

5. Build locally:

   ```bash
   npm run build
   ```

6. Only if the build succeeds, deploy:

   ```bash
   npx vercel --prod
   ```

## Routes

- `/admin/manage` — new operations center.
- `/admin/bonuses` — existing bonus-claim manager.
- `/admin/payouts` — existing payout manager.
- `/admin/campaigns` — existing campaign manager.

## Safety notes

- Always review the diff/backup if the installer reports an unexpected navigation structure.
- Keep the Supabase service-role key secret. It must remain in Vercel server environment variables and `.env.local` only.
- Kick links elsewhere in the project may still be candidate/unverified links.
