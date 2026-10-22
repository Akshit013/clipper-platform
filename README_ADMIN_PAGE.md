# ClipperHub admin page patch

This patch adds `/admin` to the existing ClipperHub Next.js + Supabase starter and adds admin-only campaign creation/activation API routes. It also provides the UI for reviewing submitted clips and managing payout statuses.

## Install on your existing Mac project

1. Download `Clipper_Admin_Page_Patch.zip`.
2. Open Terminal and run:

   ```bash
   cd "/Users/akshitsingla/.gemini/antigravity/scratch/clipper-platform"
   unzip -o ~/Downloads/Clipper_Admin_Page_Patch.zip
   ```

3. Restart Next.js (`Control+C`, then `npm run dev`).
4. Open `http://localhost:3000/admin` while signed in with your admin account.

The patch intentionally does not include or overwrite `.env.local`.

## Notes

- The page and API routes verify the signed-in user's `profiles.role` server-side.
- Campaigns can be created and activated/deactivated; campaigns with historical clips are not deleted.
- Clip approvals record the eligible-view count and create/update the earnings row using the existing API route. The current starter's clip + earning writes are not yet a single database transaction; reconcile data before production payouts.
- Payout approval does not send money. Transfer money separately, then mark it paid with the actual bank/UPI reference.
- Instagram metrics remain unavailable until a compliant, authorized metrics provider is configured.
