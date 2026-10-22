import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const navPath = path.join(root, "src/components/ClipperToolsNav.tsx");
const bonusClaimPath = path.join(root, "src/app/api/bonuses/claim/route.ts");
const bonusPagePath = path.join(root, "src/app/dashboard/bonuses/page.tsx");
const adminPagePath = path.join(root, "src/app/admin/page.tsx");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = (file) => {
  const backupPath = `${file}.backup-admin-ops-${stamp}`;
  fs.copyFileSync(file, backupPath);
  return backupPath;
};

console.log("Installing admin operations helper changes…");

if (fs.existsSync(navPath)) {
  let nav = fs.readFileSync(navPath, "utf8");
  if (!nav.includes('href="/admin/manage"')) {
    const expected = `      {pathname.startsWith("/admin") && (\n        <Link href="/admin/bonuses" className={pathname.startsWith("/admin/bonuses") ? styles.active : styles.link}>\n          Review bonus claims\n        </Link>\n      )}`;
    if (!nav.includes(expected)) {
      throw new Error(`Could not find the expected admin navigation block in ${navPath}. No nav edits were made; share the file's admin-link section for a safe patch.`);
    }
    const replacement = `      {pathname.startsWith("/admin") && (\n        <>\n          <Link href="/admin/manage" className={pathname.startsWith("/admin/manage") ? styles.active : styles.link}>\n            Admin operations\n          </Link>\n          <Link href="/admin/bonuses" className={pathname.startsWith("/admin/bonuses") ? styles.active : styles.link}>\n            Review bonus claims\n          </Link>\n        </>\n      )}`;
    const b = backup(navPath);
    nav = nav.replace(expected, replacement);
    fs.writeFileSync(navPath, nav);
    console.log(`Added Admin operations navigation link. Backup: ${path.relative(root, b)}`);
  } else {
    console.log("Admin operations navigation already exists; skipped.");
  }
} else {
  console.warn("ClipperToolsNav.tsx not found; open /admin/manage directly after installation.");
}

if (fs.existsSync(bonusClaimPath)) {
  let route = fs.readFileSync(bonusClaimPath, "utf8");
  if (!route.includes('.eq("is_removed", false)')) {
    const fromIndex = route.indexOf('.from("clips")');
    const approvedIndex = route.indexOf('.eq("status", "approved");', fromIndex);
    if (fromIndex < 0 || approvedIndex < 0) {
      console.warn("Could not find the approved-count query in the bonus-claim endpoint. Review it manually so soft-removed clips no longer count toward bonuses.");
    } else {
      const b = backup(bonusClaimPath);
      route = route.slice(0, approvedIndex) + '.eq("status", "approved")\n      .eq("is_removed", false);' + route.slice(approvedIndex + '.eq("status", "approved");'.length);
      fs.writeFileSync(bonusClaimPath, route);
      console.log(`Updated bonus eligibility to exclude soft-removed clips. Backup: ${path.relative(root, b)}`);
    }
  } else {
    console.log("Bonus-claim endpoint already excludes removed clips; skipped.");
  }
} else {
  console.warn("Bonus-claim endpoint not found; the bonus count filter was not changed.");
}

// Keep the bonus page's displayed approved count consistent with the claim endpoint.
if (fs.existsSync(bonusPagePath)) {
  let bonusPage = fs.readFileSync(bonusPagePath, "utf8");
  if (!bonusPage.includes('.eq("is_removed", false)')) {
    const fromIndex = bonusPage.indexOf('admin.from("clips")');
    const approvedIndex = bonusPage.indexOf('.eq("status", "approved")', fromIndex);
    if (fromIndex >= 0 && approvedIndex >= 0) {
      const b = backup(bonusPagePath);
      const needle = '.eq("status", "approved")';
      bonusPage = bonusPage.slice(0, approvedIndex) + needle + '.eq("is_removed", false)' + bonusPage.slice(approvedIndex + needle.length);
      fs.writeFileSync(bonusPagePath, bonusPage);
      console.log(`Updated displayed bonus count to exclude removed clips. Backup: ${path.relative(root, b)}`);
    } else {
      console.warn("Could not find the approved-count query in the bonus page; manually verify its count excludes removed clips.");
    }
  } else {
    console.log("Bonus page already excludes removed clips; skipped.");
  }
} else {
  console.warn("Bonus page not found; displayed bonus count was not changed.");
}

// Keep removed clips out of the existing main dashboard list; they remain available in /admin/manage.
if (fs.existsSync(adminPagePath)) {
  let adminPage = fs.readFileSync(adminPagePath, "utf8");
  if (!adminPage.includes('.eq("is_removed", false)')) {
    const fromIndex = adminPage.indexOf('supabase.from("clips")');
    const orderIndex = adminPage.indexOf('.order("submitted_at"', fromIndex);
    if (fromIndex >= 0 && orderIndex >= 0) {
      const b = backup(adminPagePath);
      adminPage = adminPage.slice(0, orderIndex) + '.eq("is_removed", false)' + adminPage.slice(orderIndex);
      fs.writeFileSync(adminPagePath, adminPage);
      console.log(`Filtered soft-removed clips from the original dashboard. Backup: ${path.relative(root, b)}`);
    } else {
      console.warn("Could not find the clips query on src/app/admin/page.tsx; the original dashboard may show removed clips.");
    }
  } else {
    console.log("Original admin dashboard already filters removed clips; skipped.");
  }
} else {
  console.warn("Original admin page not found; skipped filtering removed clips from it.");
}

const required = [
  "src/app/admin/manage/page.tsx",
  "src/app/admin/manage/AdminManagementClient.tsx",
  "src/app/admin/manage/management.module.css",
  "src/app/api/admin/management/route.ts",
  "supabase/migrations/006_admin_operations.sql",
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Some patch files are missing: ${missing.join(", ")}`);
console.log("Admin operations patch ready.");
console.log("Next: apply migration 006 in Supabase SQL Editor, run npm run build, then deploy only if the build succeeds.");
