import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutPath = path.join(root, "src/app/layout.tsx");
if (!fs.existsSync(layoutPath)) {
  console.error("Could not find src/app/layout.tsx. Run this script from your clipper-platform project root.");
  process.exit(1);
}
let source = fs.readFileSync(layoutPath, "utf8");
const importLine = 'import ClipperToolsNav from "@/components/ClipperToolsNav";';
const marker = "<ClipperToolsNav />";
if (source.includes(marker)) {
  console.log("Clipper tools navigation already installed; no layout changes needed.");
  process.exit(0);
}
const bodyMatch = source.match(/<body\b[^>]*>/);
if (!bodyMatch || bodyMatch.index === undefined) {
  console.error("Could not safely find the <body> opening tag in src/app/layout.tsx. No layout changes made.");
  process.exit(1);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(path.dirname(layoutPath), `layout.tsx.backup-streamer-bonus-${stamp}`);
fs.writeFileSync(backupPath, source);
const bodyEnd = bodyMatch.index + bodyMatch[0].length;
source = source.slice(0, bodyEnd) + "\n      " + marker + source.slice(bodyEnd);
if (!source.includes(importLine)) {
  source = importLine + "\n" + source;
}
fs.writeFileSync(layoutPath, source);
console.log("Installed Clipper tools navigation in src/app/layout.tsx.");
console.log(`Layout backup: ${path.relative(root, backupPath)}`);
