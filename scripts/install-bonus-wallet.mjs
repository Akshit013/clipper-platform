import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = (file) => {
  const b = `${file}.backup-bonus-wallet-${stamp}`;
  fs.copyFileSync(file, b);
  console.log(`Backup: ${path.relative(root, b)}`);
};
const read = (relative) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Required file not found: ${relative}`);
  return { file, text: fs.readFileSync(file, 'utf8') };
};
const replaceOnce = (text, from, to, label) => {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`Could not find expected section (${label}); no files have been edited yet.`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`Expected section (${label}) occurred more than once; no files have been edited yet.`);
  return text.slice(0, i) + to + text.slice(i + from.length);
};

const payout = read('src/app/api/payouts/route.ts');
const payoutManager = read('src/app/dashboard/payouts/PayoutsManager.tsx');
const bonusPage = read('src/app/dashboard/bonuses/page.tsx');
let api = payout.text;
let ui = payoutManager.text;
let bp = bonusPage.text;

// Extend GET data query to fetch claims belonging to the authenticated user.
api = replaceOnce(api,
`    const [earningsResult, payoutsResult] = await Promise.all([\n      supabase.from("earnings")\n        .select("id,clip_id,campaign_id,eligible_views,rate_per_1000,amount,calculated_at")\n        .eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(2000),\n      supabase.from("payout_requests")\n        .select("*")\n        .eq("user_id", user.id).order("requested_at", { ascending: false }).limit(2000),\n    ]);`,
`    const [earningsResult, payoutsResult, bonusClaimsResult] = await Promise.all([\n      supabase.from("earnings")\n        .select("id,clip_id,campaign_id,eligible_views,rate_per_1000,amount,calculated_at")\n        .eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(2000),\n      supabase.from("payout_requests")\n        .select("*")\n        .eq("user_id", user.id).order("requested_at", { ascending: false }).limit(2000),\n      supabase.from("bonus_claims")\n        .select("id,milestone,amount_inr,status,requested_at,processed_at,payment_reference,admin_note")\n        .eq("user_id", user.id).order("requested_at", { ascending: false }).limit(2000),\n    ]);`, 'payout GET queries');

api = replaceOnce(api,
`    const errors = [earningsResult.error, payoutsResult.error].filter(Boolean).map((e) => e!.message);`,
`    const errors = [earningsResult.error, payoutsResult.error, bonusClaimsResult.error].filter(Boolean).map((e) => e!.message);`,
'wallet query error handling');

const summaryStart = api.indexOf('    const earnings = earningsResult.data ?? [];');
const returnStart = api.indexOf('    return NextResponse.json({', summaryStart);
if (summaryStart < 0 || returnStart < 0) throw new Error('Could not locate payout GET summary block; no files have been edited.');
const summaryBlock = `    const earnings = earningsResult.data ?? [];\n    const payouts = payoutsResult.data ?? [];\n    const bonusClaims = bonusClaimsResult.data ?? [];\n\n    const clipEarningsTotal = earnings.reduce((sum, row) => sum + Number(row.amount || 0), 0);\n    const approvedBonusTotal = bonusClaims.filter((row) => row.status === "approved")\n      .reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);\n    const paidBonusTotal = bonusClaims.filter((row) => row.status === "paid")\n      .reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);\n    const totalEarned = clipEarningsTotal + approvedBonusTotal + paidBonusTotal;\n    const totalPaid = payouts.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount || 0), 0) + paidBonusTotal;\n    const reserved = payouts.filter((row) => row.status === "pending" || row.status === "approved")\n      .reduce((sum, row) => sum + Number(row.amount || 0), 0);\n    const committed = payouts.filter((row) => ["pending", "approved", "paid"].includes(row.status))\n      .reduce((sum, row) => sum + Number(row.amount || 0), 0);\n    // Only currently approved bonus claims are spendable. Paid bonuses were sent directly.\n    const available = Math.max(0, clipEarningsTotal + approvedBonusTotal - committed);\n\n`;
api = api.slice(0, summaryStart) + summaryBlock + api.slice(returnStart);
api = replaceOnce(api,
`    return NextResponse.json({\n      earnings,\n      payouts,\n      summary: {\n        totalEarned: Math.round(totalEarned * 100) / 100,\n        totalPaid: Math.round(totalPaid * 100) / 100,\n        reserved: Math.round(reserved * 100) / 100,\n        available: Math.round(Math.max(0, totalEarned - committed) * 100) / 100,\n      },\n    });`,
`    return NextResponse.json({\n      earnings,\n      payouts,\n      bonusClaims,\n      summary: {\n        totalEarned: Math.round(totalEarned * 100) / 100,\n        totalPaid: Math.round(totalPaid * 100) / 100,\n        reserved: Math.round(reserved * 100) / 100,\n        available: Math.round(available * 100) / 100,\n      },\n    });`, 'payout GET response');

// The payment history type includes bonus claims, and bonus credits are shown as activity.
ui = replaceOnce(ui,
`type Payout = { id: string; amount: number | string; status: "pending" | "approved" | "paid" | "rejected"; upi_id: string | null; payment_reference: string | null; requested_at: string; processed_at: string | null };\ntype Data = { earnings: Earning[]; payouts: Payout[]; summary: { totalEarned: number; totalPaid: number; reserved: number; available: number } };\ntype Activity = { key: string; date: string; type: "earning" | "payout"; label: string; amount: number; status: string; note: string };`,
`type Payout = { id: string; amount: number | string; status: "pending" | "approved" | "paid" | "rejected"; upi_id: string | null; payment_reference: string | null; requested_at: string; processed_at: string | null };\ntype BonusClaim = { id: string; milestone: number; amount_inr: number | string; status: "pending" | "approved" | "paid" | "rejected"; requested_at: string; processed_at: string | null; payment_reference: string | null; admin_note: string | null };\ntype Data = { earnings: Earning[]; payouts: Payout[]; bonusClaims: BonusClaim[]; summary: { totalEarned: number; totalPaid: number; reserved: number; available: number } };\ntype Activity = { key: string; date: string; type: "earning" | "bonus" | "payout"; label: string; amount: number; status: string; note: string };`, 'payout manager types');
ui = replaceOnce(ui,
`    return [...earnings, ...payouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());`,
`    const bonuses: Activity[] = data.bonusClaims.map((row) => ({\n      key: \`bonus-\${row.id}\`,\n      date: row.requested_at,\n      type: "bonus",\n      label: \`\${row.milestone}-clip milestone bonus\`,\n      amount: Number(row.amount_inr || 0),\n      status: row.status === "approved" ? "Added to wallet" : row.status === "paid" ? "Paid directly by admin" : row.status === "pending" ? "Pending admin approval — not credited" : "Rejected — not credited",\n      note: row.status === "approved" ? "Credited to available wallet; can be requested as a payout" : row.status === "paid" ? \`Direct payment recorded\${row.payment_reference ? \` · Ref: \${row.payment_reference}\` : ""}\` : row.admin_note || "Bonus claim status",\n    }));\n    return [...earnings, ...bonuses, ...payouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());`, 'activity combined list');
ui = replaceOnce(ui,
`<small>All earning records from approved clips</small>`,
`<small>Clip earnings plus approved and directly paid bonuses</small>`, 'total earnings subtitle');
ui = replaceOnce(ui,
`<span className={row.type === "earning" ? styles.earningTag : styles.payoutTag}>{row.type === "earning" ? "Earning" : "Payout"}</span><strong className={styles.activityTitle}>{row.label}</strong>`,
`<span className={row.type === "earning" ? styles.earningTag : row.type === "bonus" ? styles.earningTag : styles.payoutTag}>{row.type === "earning" ? "Earning" : row.type === "bonus" ? "Bonus" : "Payout"}</span><strong className={styles.activityTitle}>{row.label}</strong>`, 'activity type label');
ui = replaceOnce(ui,
`<td className={row.type === "earning" ? styles.positiveAmount : styles.normalAmount}>{row.type === "earning" ? "+" : ""}{formatINR(row.amount)}</td>`,
`<td className={(row.type === "earning" || (row.type === "bonus" && row.status === "Added to wallet")) ? styles.positiveAmount : styles.normalAmount}>{(row.type === "earning" || (row.type === "bonus" && row.status === "Added to wallet")) ? "+" : ""}{formatINR(row.amount)}</td>`, 'activity amount presentation');
ui = replaceOnce(ui,
`<p className={styles.subtitle}>Every recorded clip earning and payout request in one place, with your available balance calculated from the full history.</p>`,
`<p className={styles.subtitle}>Your available balance includes approved bonus credits. Pending and rejected bonuses are not spendable; bonuses marked paid directly by admin have already been transferred.</p>`, 'wallet description');

bp = replaceOnce(bp,
`<p className={styles.note}>Each milestone can be claimed once. At 100 approved clips, you can claim all three milestones (₹800 total), if you have not already claimed the lower milestones. Claiming records a request for admin review; it does not automatically transfer money or change your normal payout balance.</p>`,
`<p className={styles.note}>Each milestone can be claimed once. At 100 approved clips, you can claim all three milestones (₹800 total), if you have not already claimed the lower milestones. Pending claims are not credited. Once an admin approves a claim, its amount is added to your available wallet balance and can be included in a payout request. If an admin marks a bonus as paid directly, it is recorded as paid and is not added to the available wallet again.</p>`, 'bonus page wallet explanation');

// All target strings were validated before this point, so now write backups and files.
for (const item of [payout, payoutManager, bonusPage]) backup(item.file);
fs.writeFileSync(payout.file, api);
fs.writeFileSync(payoutManager.file, ui);
fs.writeFileSync(bonusPage.file, bp);
console.log('Bonus wallet integration applied to payout API, wallet activity history, and bonus explanation.');
console.log('The combined upgrade migration is supabase/migrations/008_bonus_wallet_history_dashboard.sql; apply it in Supabase SQL Editor before building.');
