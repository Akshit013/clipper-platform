import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const required = [
  "src/app/api/admin/management/route.ts",
  "src/app/admin/manage/AdminManagementClient.tsx",
  "supabase/migrations/006_admin_operations.sql",
  "supabase/migrations/008_bonus_wallet_history_dashboard.sql",
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error("Project structure check failed; no existing source files changed.");
  console.error("Missing:", missing.join(", "));
  process.exit(1);
}
const migrationSource = path.join(root, "supabase/migrations/010_clip_earning_reversals.sql");
if (!fs.existsSync(migrationSource)) throw new Error("Missing migration 010_clip_earning_reversals.sql from the ZIP.");

function backup(file) {
  const destination = `${file}.backup-clip-financial-reversal-${stamp}`;
  fs.copyFileSync(file, destination);
  console.log(`Backup: ${path.relative(root, destination)}`);
}

const apiPath = path.join(root, "src/app/api/admin/management/route.ts");
let api = fs.readFileSync(apiPath, "utf8");
const viewStartNeedle = "      if (nextEligibleViews !== null) {";
const auditNeedle = '      await writeAudit(admin, user, { entityType: "clip", entityId: id, targetUserId: clip.user_id, action: "edit_clip"';
const viewStart = api.indexOf(viewStartNeedle);
const auditAt = viewStart >= 0 ? api.indexOf(auditNeedle, viewStart) : -1;
if (viewStart < 0 || auditAt < 0) {
  console.error("Could not safely locate the approved-views update block in admin/management/route.ts.");
  console.error("No existing source files changed. Check this project's admin-management patch version.");
  process.exit(1);
}
const viewBlock = `      if (nextEligibleViews !== null) {
        const { error: earningError } = await admin.rpc("admin_update_approved_clip_views", {
          p_clip_id: id,
          p_eligible_views: nextEligibleViews,
          p_admin_user_id: user.id,
          p_reason: reason,
        });
        if (earningError) {
          await admin.from("clips").update({ eligible_views: clip.eligible_views }).eq("id", id);
          throw new Error(` + "`Could not update eligible views and wallet ledger; the previous clip view count was restored. ${earningError.message}`" + `);
        }
      }
`;
api = api.slice(0, viewStart) + viewBlock + api.slice(auditAt);

const removalStartNeedle = '    if (action === "remove_clip" || action === "restore_clip") {';
const suspendNeedle = '    if (action === "suspend_clipper" || action === "restore_clipper") {';
const removalStart = api.indexOf(removalStartNeedle);
const suspendAt = removalStart >= 0 ? api.indexOf(suspendNeedle, removalStart) : -1;
if (removalStart < 0 || suspendAt < 0) {
  console.error("Could not safely locate the remove/restore clip block.");
  console.error("No existing source files changed. Check this project's admin-management patch version.");
  process.exit(1);
}
const removalBlock = `    if (action === "remove_clip" || action === "restore_clip") {
      const id = String(body.id ?? "").trim();
      const reason = readReason(body.reason);
      if (!id) throw new Error("Clip ID is required.");
      const removing = action === "remove_clip";
      const { data: result, error: transitionError } = await admin.rpc("admin_toggle_clip_removal", {
        p_clip_id: id,
        p_remove: removing,
        p_admin_user_id: user.id,
        p_reason: reason,
      });
      if (transitionError) throw new Error(transitionError.message);
      const resultObject = (result ?? {}) as Record<string, any>;
      return NextResponse.json({
        ok: true,
        message: resultObject.message || (removing ? "Clip removed and earning reversal recorded." : "Clip restored and earning recalculated."),
        ...resultObject,
      });
    }

`;
api = api.slice(0, removalStart) + removalBlock + api.slice(suspendAt);

const uiPath = path.join(root, "src/app/admin/manage/AdminManagementClient.tsx");
let ui = fs.readFileSync(uiPath, "utf8");
const oldPrompt = "This hides it from the clipper but preserves earning/payment history. Enter a reason:";
const newPrompt = "This removes the clip from the clipper. Any active clip earning will be reversed from their available wallet and recorded in the financial ledger. Payments already sent cannot be automatically clawed back. Enter a reason:";
const oldFootnote = "Remove is reversible and hides the clip from the clipper-facing pages. It intentionally preserves earnings and payout history. Correct verified eligible views separately if an earning adjustment is required; that adjustment is audited.";
const newFootnote = "Remove is reversible and hides the clip from the clipper-facing pages. Any linked earning is zeroed while its history remains, and the wallet trigger records the debit in the financial ledger. Restoring an approved clip recalculates its earning from the preserved eligible-view count and campaign rate. A payout already paid externally is not automatically clawed back.";
const oldEligibleNote = "Updating this recalculates the linked earning at the campaign rate. It does not reverse money already paid.";
const newEligibleNote = "Updating recalculates the linked earning at the campaign rate. Any amount change is recorded in the wallet ledger; a payout already paid externally is not automatically reclaimed.";
for (const [oldText, newText, label] of [
  [oldPrompt, newPrompt, "removal confirmation"],
  [oldFootnote, newFootnote, "removal footnote"],
  [oldEligibleNote, newEligibleNote, "eligible-views guidance"],
]) {
  if (!ui.includes(oldText)) {
    console.error(`Could not locate expected ${label} text.`);
    console.error("No source files will be written. The project may have a newer admin UI.");
    process.exit(1);
  }
}
ui = ui.replace(oldPrompt, newPrompt).replace(oldFootnote, newFootnote).replace(oldEligibleNote, newEligibleNote);

backup(apiPath);
backup(uiPath);
fs.writeFileSync(apiPath, api);
fs.writeFileSync(uiPath, ui);
console.log("Patched admin removal and eligible-view update endpoints.");
console.log("Admin removal now calls admin_toggle_clip_removal; eligible-view changes call admin_update_approved_clip_views.");
console.log("Financial debit/credit ledger entries are generated by the SQL trigger when the earning amount changes.");
console.log("Next: apply supabase/migrations/010_clip_earning_reversals.sql in Supabase SQL Editor, then run npm run build.");
