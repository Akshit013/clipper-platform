import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const mustExist = [
  "src/app/admin/page.tsx",
  "src/lib/supabase/server.ts",
  "src/lib/supabase/admin.ts",
  "supabase/migrations/008_bonus_wallet_history_dashboard.sql",
];
const missing = mustExist.filter((p) => !fs.existsSync(path.join(root, p)));
if (missing.length) throw new Error(`Project structure check failed. Missing: ${missing.join(", ")}. Nothing was patched by this installer.`);

const backup = (file) => { const dest = `${file}.backup-financials-${stamp}`; fs.copyFileSync(file, dest); return path.relative(root, dest); };
console.log("Installing admin financial ledger integration…");

// The new ledger route/page/component files are supplied in this patch already.
const api = path.join(root, "src/app/api/admin/financial-transactions/route.ts");
const ledger = path.join(root, "src/app/admin/financials/AdminFinancialLedger.tsx");
const overviewSnapshot = path.join(root, "src/app/admin/financials/AdminFinancialSnapshot.tsx");
for (const file of [api, ledger, overviewSnapshot]) if (!fs.existsSync(file)) throw new Error(`Patch file missing: ${path.relative(root, file)}`);

// Add the summary component below the existing admin dashboard so bonus accounting is visible on /admin.
const pagePath = path.join(root, "src/app/admin/page.tsx");
let page = fs.readFileSync(pagePath, "utf8");
const importLine = 'import AdminFinancialSnapshot from "./financials/AdminFinancialSnapshot";';
if (!page.includes(importLine)) {
  const lines = page.split(/\r?\n/);
  let lastImport = -1;
  for (let i=0;i<lines.length;i++) if (/^import\s/.test(lines[i])) lastImport=i;
  if (lastImport < 0) throw new Error("Could not find import block in admin/page.tsx; no overview changes made.");
  lines.splice(lastImport+1, 0, importLine);
  page = lines.join("\n");
}
if (!page.includes("<AdminFinancialSnapshot")) {
  const start = page.indexOf("return <AdminDashboard");
  if (start < 0) throw new Error("Could not find `return <AdminDashboard` in admin/page.tsx. The new /admin/financials page is installed, but the overview snapshot must be added manually.");
  const closingMatch = page.slice(start).match(/\n[ \t]*\/>;/);
  if (!closingMatch || closingMatch.index === undefined) throw new Error("Could not locate AdminDashboard JSX closing tag. The new /admin/financials page is installed, but the overview snapshot must be added manually.");
  page = page.slice(0, start) + page.slice(start).replace("return <AdminDashboard", "return <>\n      <AdminDashboard");
  const adjustedClose = page.indexOf(closingMatch[0], start);
  if (adjustedClose < 0) throw new Error("Could not locate JSX closing tag after preparing the overview. No overview snapshot was inserted.");
  page = page.slice(0, adjustedClose) + "\n      />\n      <AdminFinancialSnapshot />\n    </>;" + page.slice(adjustedClose + closingMatch[0].length);
  const b = backup(pagePath);
  fs.writeFileSync(pagePath, page);
  console.log(`Added bonus-aware financial summary to /admin. Backup: ${b}`);
} else {
  console.log("Financial summary already present on /admin; skipped.");
}

// Add a link to the ledger in the known ClipperToolsNav component if its admin nav block is identifiable.
const navPath = path.join(root, "src/components/ClipperToolsNav.tsx");
if (fs.existsSync(navPath)) {
  let nav = fs.readFileSync(navPath, "utf8");
  if (!nav.includes('href="/admin/financials"')) {
    const anchor = '<Link href="/admin/bonuses"';
    const at = nav.indexOf(anchor);
    if (at >= 0) {
      const b = backup(navPath);
      const link = '<Link href="/admin/financials" className={pathname.startsWith("/admin/financials") ? styles.active : styles.link}>Financial ledger</Link>\n        ';
      nav = nav.slice(0, at) + link + nav.slice(at);
      fs.writeFileSync(navPath, nav);
      console.log(`Added financial ledger navigation. Backup: ${b}`);
    } else console.warn("Could not safely find admin navigation insertion point; use /admin/financials directly.");
  }
} else console.warn("ClipperToolsNav.tsx not found; use /admin/financials directly. Snapshot still links there.");

console.log("Admin financial ledger files are installed. Apply supabase/migrations/009_admin_financial_reporting.sql in Supabase SQL Editor, then run npm run build.");
