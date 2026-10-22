import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "src/app/dashboard/how-to-edit/page.tsx",
  "src/app/dashboard/how-to-edit/how-to-edit.module.css",
  "public/tutorials/clipping-editing-walkthrough.mp4",
];
const missing = required.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error(`Missing patch files: ${missing.join(", ")}`);
  console.error("Extract the full ZIP into the project root, then rerun the installer.");
  process.exit(1);
}

const navRel = "src/components/ClipperToolsNav.tsx";
const navPath = path.join(root, navRel);
if (!fs.existsSync(navPath)) {
  console.warn(`Navigation file ${navRel} was not found. The page will still be available at /dashboard/how-to-edit.`);
} else {
  let nav = fs.readFileSync(navPath, "utf8");
  if (!nav.includes('href: "/dashboard/how-to-edit"')) {
    const patterns = [
      /\{ href: "\/dashboard\/samples", label: "Sample clips" \},/,
      /\{ href: '\/dashboard\/samples', label: 'Sample clips' \},/,
    ];
    let found = false;
    for (const re of patterns) {
      if (re.test(nav)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backup = `${navPath}.backup-how-to-edit-${stamp}`;
        fs.copyFileSync(navPath, backup);
        nav = nav.replace(re, (match) => `${match}\n    { href: "/dashboard/how-to-edit", label: "How to edit clips" },`);
        fs.writeFileSync(navPath, nav);
        console.log(`Added How to edit clips navigation link. Backup: ${backup}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.warn("Could not safely locate the Sample clips navigation entry. No navigation changes made.");
      console.warn("Open /dashboard/how-to-edit directly; share the navigation snippet if you want me to integrate it manually.");
    }
  } else {
    console.log("How to edit clips navigation link already exists; skipped.");
  }
}

console.log("How to Edit section installed. The video is served from public/tutorials.");
console.log("Next: run npm run build. If it succeeds, deploy with npx vercel --prod.");
