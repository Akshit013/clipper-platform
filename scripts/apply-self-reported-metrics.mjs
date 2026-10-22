import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const targets = {
  form: 'src/app/dashboard/submit/SubmitClipForm.tsx',
  api: 'src/app/api/clips/route.ts',
  adminPage: 'src/app/admin/page.tsx',
  adminDashboard: 'src/app/admin/AdminDashboard.tsx',
};

for (const file of Object.values(targets)) {
  if (!existsSync(file)) {
    console.error(`Required file not found: ${file}`);
    console.error('Run this script from the root of the clipper-platform project. No files were changed.');
    process.exit(1);
  }
}

const contents = {};
for (const [key, file] of Object.entries(targets)) contents[key] = await readFile(file, 'utf8');
const changed = {};
function replaceOnce(key, oldText, newText, label) {
  const current = changed[key] ?? contents[key];
  if (current.includes(newText)) return; // idempotent rerun
  const count = current.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one matching code block in ${targets[key]}, found ${count}. No files were written.`);
  }
  changed[key] = current.replace(oldText, newText);
}

try {
  // Upload form: reveal the optional self-reported metrics fields using a button.
  replaceOnce('form',
    '  const [instagramUrl, setInstagramUrl] = useState("");',
    '  const [instagramUrl, setInstagramUrl] = useState("");\n  const [showCurrentMetrics, setShowCurrentMetrics] = useState(false);\n  const [currentViews, setCurrentViews] = useState("");\n  const [currentLikes, setCurrentLikes] = useState("");',
    'Add self-reported metric state');

  replaceOnce('form',
    'body: JSON.stringify({ campaignId, instagramAccountId: accountId, instagramUrl }),',
    'body: JSON.stringify({ campaignId, instagramAccountId: accountId, instagramUrl, selfReportedViews: showCurrentMetrics ? Number(currentViews) : 0, selfReportedLikes: showCurrentMetrics ? Number(currentLikes) : 0 }),',
    'Send self-reported metrics');

  replaceOnce('form',
    '      setInstagramUrl("");',
    '      setInstagramUrl("");\n      setCurrentViews("");\n      setCurrentLikes("");\n      setShowCurrentMetrics(false);',
    'Reset metrics after submission');

  const submitButton = '          <button className={styles.primaryButton} type="submit" disabled={busy || !accountId || !campaignId}>{busy ? "Submitting…" : "Submit Reel for review"}</button>';
  const metricsUI = `          <button className={styles.secondaryButton} type="button" aria-expanded={showCurrentMetrics} onClick={() => setShowCurrentMetrics((value) => !value)}>
            {showCurrentMetrics ? "Hide current views & likes" : "Add current views & likes"}
          </button>
          {showCurrentMetrics && <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <label className={styles.label}>Current views
              <input className={styles.input} type="number" inputMode="numeric" min="0" max="1000000000" step="1" required value={currentViews} onChange={(event) => setCurrentViews(event.target.value)} placeholder="e.g. 12500" />
            </label>
            <label className={styles.label}>Current likes
              <input className={styles.input} type="number" inputMode="numeric" min="0" max="1000000000" step="1" required value={currentLikes} onChange={(event) => setCurrentLikes(event.target.value)} placeholder="e.g. 850" />
            </label>
            <p className={styles.warning} style={{ gridColumn: "1 / -1", marginTop: 0 }}>These counts are self-reported by you at submission time. They are not fetched from Instagram and do not automatically count as verified eligible views or earnings.</p>
          </div>}
`;
  replaceOnce('form', submitButton, metricsUI + submitButton, 'Add views/likes button and inputs');

  // API validates input and saves it on the clip row. Keep them separate from verified metrics.
  replaceOnce('api',
    '  instagramUrl: z.string().trim().min(8).max(500),\n}).strict();',
    '  instagramUrl: z.string().trim().min(8).max(500),\n  selfReportedViews: z.number().int().min(0).max(1000000000).default(0),\n  selfReportedLikes: z.number().int().min(0).max(1000000000).default(0),\n}).strict();',
    'Validate self-reported metrics');

  replaceOnce('api',
    '      shortcode: parsedUrl.shortcode,\n      status: "pending",',
    '      shortcode: parsedUrl.shortcode,\n      self_reported_views: input.selfReportedViews,\n      self_reported_likes: input.selfReportedLikes,\n      status: "pending",',
    'Save self-reported metrics');

  replaceOnce('api',
    '.select("id,user_id,campaign_id,instagram_account_id,instagram_url,shortcode,status,submitted_at").single();',
    '.select("id,user_id,campaign_id,instagram_account_id,instagram_url,shortcode,self_reported_views,self_reported_likes,status,submitted_at").single();',
    'Return saved metrics');

  // Admin page fetches the new fields for review.
  replaceOnce('adminPage',
    '.select("id,user_id,campaign_id,instagram_account_id,instagram_url,shortcode,status,submitted_at,reviewed_at,reviewed_by")',
    '.select("id,user_id,campaign_id,instagram_account_id,instagram_url,shortcode,self_reported_views,self_reported_likes,status,submitted_at,reviewed_at,reviewed_by")',
    'Fetch self-reported metrics for admin');

  // Admin view labels counts as reported, not verified.
  replaceOnce('adminDashboard',
    'shortcode: string | null; status: "pending" | "approved" | "rejected";',
    'shortcode: string | null; self_reported_views: number; self_reported_likes: number; status: "pending" | "approved" | "rejected";',
    'Admin clip type');

  replaceOnce('adminDashboard',
    '<td><strong>{clip.last_observed_views == null ? "—" : integer(clip.last_observed_views)}</strong><small className={styles.subCell}>Eligible: {integer(clip.eligible_views)}</small></td>',
    '<td><strong>Reported: {integer(clip.self_reported_views)}</strong><small className={styles.subCell}>Likes: {integer(clip.self_reported_likes)}</small><small className={styles.subCell}>Eligible: {integer(clip.eligible_views)}</small></td>',
    'Display reported counts in admin clip review');

} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// Back up all affected files before changing any of them.
const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
try {
  for (const [key, file] of Object.entries(targets)) {
    if (changed[key] !== undefined) {
      await copyFile(file, `${file}.backup-self-reported-${stamp}`);
    }
  }
  for (const [key, updated] of Object.entries(changed)) {
    await writeFile(targets[key], updated, 'utf8');
  }
} catch (error) {
  console.error('Could not write all files. Check the backups generated in the project.');
  console.error(error);
  process.exit(1);
}

console.log('Self-reported views and likes UI/API changes applied.');
console.log('Backups created beside changed files.');
console.log('Next: apply supabase/migrations/004_self_reported_clip_metrics.sql in the Supabase SQL Editor, then run npm run build.');
