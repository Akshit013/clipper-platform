import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["src/app", "src/components", "src/lib"].map((p) => path.join(root, p)).filter((p) => fs.existsSync(p));
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const backupRoot = path.join(root, `.backup-before-inr-${new Date().toISOString().replace(/[:.]/g, "-")}`);
let changed = 0;

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!["node_modules", ".next", ".git"].includes(item.name)) walk(full);
      continue;
    }
    if (!extensions.has(path.extname(item.name))) continue;
    const before = fs.readFileSync(full, "utf8");
    let after = before;

    // Currency code parameters and labels should consistently use INR/en-IN.
    after = after.replace(/(currency\s*:\s*)(["'])[A-Z]{3}\2/g, (_m, prefix) => `${prefix}"INR"`);
    after = after.replace(/(currency\s*:\s*)(?:[A-Za-z_$][\w$]*(?:\.[\w$]+)?)(\s*[,}])/g, (_m, prefix, tail) => `${prefix}"INR"${tail}`);
    after = after.replace(/new Intl\.NumberFormat\(\s*["']en-(?:US|GB)["']\s*,/g, 'new Intl.NumberFormat("en-IN",');
    after = after.replace(/\bUSD\b|US dollars?/gi, "INR");
    after = after.replace(/(["'])\$(\1)/g, "$1₹$2");
    after = after.replace(/>\s*\$(\s*<)/g, ">₹$1");
    // Literal-dollar prefix immediately followed by a template interpolation: `$${amount}` -> `₹${amount}`.
    after = after.replace(/\$\$\{/g, "₹${");
    // Plain hard-coded money samples such as $3.00 or $0.00.
    after = after.replace(/\$(?=\s?\d)/g, "₹");

    if (after !== before) {
      const rel = path.relative(root, full);
      const backup = path.join(backupRoot, rel);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(full, backup);
      fs.writeFileSync(full, after);
      changed++;
      process.stdout.write(`Updated ${rel}\n`);
    }
  }
}

for (const rootDir of scanRoots) walk(rootDir);
console.log(`INR UI pass complete. Updated ${changed} file(s).`);
if (changed) console.log(`Original versions backed up in ${path.relative(root, backupRoot)}.`);
else console.log("No obvious non-INR currency formatter or dollar marker was found. Review any remaining custom formatter manually.");
