import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const required = [
  'src/app/api/payouts/route.ts',
  'src/app/dashboard/payouts/PayoutsManager.tsx',
  'src/app/dashboard/bonuses/page.tsx',
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error(`Required project file not found: ${file}`);
    console.error('Run this installer from the root of your ClipperPlatform project. No changes made by this step.');
    process.exit(1);
  }
}

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const writeBackup = (rel, content) => {
  const dest = `${rel}.backup-wallet-dashboard-${stamp}`;
  fs.copyFileSync(path.join(root, rel), path.join(root, dest));
  console.log(`Backup: ${dest}`);
};
const replaceOnce = (text, from, to, label) => {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`Could not find expected section: ${label}. No changes made by the dashboard step.`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`Expected section appeared more than once: ${label}. No changes made by the dashboard step.`);
  return text.slice(0, first) + to + text.slice(first + from.length);
};

// Ensure the previous approved-bonus-to-wallet behavior is included even if the earlier
// separate patch has not yet been applied. Skip it when its changes are already present.
let api = read('src/app/api/payouts/route.ts');
let manager = read('src/app/dashboard/payouts/PayoutsManager.tsx');
let bonusPage = read('src/app/dashboard/bonuses/page.tsx');
const bonusAlreadyInstalled = api.includes('bonusClaimsResult') &&
  manager.includes('type BonusClaim');
if (!bonusAlreadyInstalled) {
  const script = path.join(root, 'scripts/install-bonus-wallet.mjs');
  if (!fs.existsSync(script)) throw new Error('Included bonus wallet installer is missing. Re-extract the complete ZIP and retry.');
  const result = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

api = read('src/app/api/payouts/route.ts');
manager = read('src/app/dashboard/payouts/PayoutsManager.tsx');
let apiNext = api;
let managerNext = manager;

if (!apiNext.includes('walletTransactionsResult')) {
  apiNext = replaceOnce(apiNext, 'export async function GET() {', 'export async function GET(request: Request) {', 'payout GET request');
  const anchor = '    const errors = [earningsResult.error, payoutsResult.error, bonusClaimsResult.error].filter(Boolean).map((e) => e!.message);';
  const insert = `    const requestUrl = new URL(request.url);\n    const parsedPage = Number(requestUrl.searchParams.get("transactionsPage") ?? "0");\n    const walletTransactionPage = Number.isInteger(parsedPage) && parsedPage >= 0 ? Math.min(parsedPage, 100000) : 0;\n    const walletTransactionPageSize = 100;\n    const [walletTransactionsResult, approvedClipsResult] = await Promise.all([\n      (supabase as any).from("wallet_transactions")\n        .select("*", { count: "exact" })\n        .eq("user_id", user.id).order("created_at", { ascending: false })\n        .range(walletTransactionPage * walletTransactionPageSize, (walletTransactionPage + 1) * walletTransactionPageSize - 1),\n      (supabase as any).from("clips")\n        .select("id", { count: "exact", head: true })\n        .eq("user_id", user.id).eq("status", "approved"),\n    ]);\n\n    const errors = [earningsResult.error, payoutsResult.error, bonusClaimsResult.error, walletTransactionsResult.error, approvedClipsResult.error].filter(Boolean).map((e) => e!.message);`;
  apiNext = replaceOnce(apiNext, anchor, insert, 'wallet transaction queries');
  const responseAnchor = '      bonusClaims,\n      summary: {';
  const responseInsert = '      bonusClaims,\n      walletTransactions: walletTransactionsResult.data ?? [],\n      walletTransactionCount: walletTransactionsResult.count ?? 0,\n      walletTransactionPage,\n      walletTransactionPageSize,\n      approvedClipCount: approvedClipsResult.count ?? 0,\n      summary: {';
  apiNext = replaceOnce(apiNext, responseAnchor, responseInsert, 'wallet transaction response');
}

if (!managerNext.includes('import WalletInsights from "./WalletInsights";')) {
  managerNext = replaceOnce(managerNext, 'import styles from "./payouts.module.css";', 'import styles from "./payouts.module.css";\nimport WalletInsights from "./WalletInsights";', 'wallet insights import');
}
if (!managerNext.includes('<WalletInsights />')) {
  const anchor = '    <div className={styles.contentGrid}>';
  managerNext = replaceOnce(managerNext, anchor, '    <WalletInsights />\n\n' + anchor, 'wallet insights dashboard placement');
}

// Validate the component exists before any writes.
const componentRel = 'src/app/dashboard/payouts/WalletInsights.tsx';
const cssRel = 'src/app/dashboard/payouts/wallet-insights.module.css';
if (!fs.existsSync(path.join(root, componentRel))) throw new Error(`Missing included component: ${componentRel}`);
if (!fs.existsSync(path.join(root, cssRel))) throw new Error(`Missing included stylesheet: ${cssRel}`);

if (apiNext !== api) writeBackup('src/app/api/payouts/route.ts', api);
if (managerNext !== manager) writeBackup('src/app/dashboard/payouts/PayoutsManager.tsx', manager);
fs.writeFileSync(path.join(root, 'src/app/api/payouts/route.ts'), apiNext);
fs.writeFileSync(path.join(root, 'src/app/dashboard/payouts/PayoutsManager.tsx'), managerNext);
console.log('Wallet transaction history and dashboard insights installed.');
console.log('Next: apply supabase/migrations/008_bonus_wallet_history_dashboard.sql in Supabase SQL Editor, then run npm run build.');
