"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "./management.module.css";

type Row = Record<string, any>;
type Tab = "overview" | "clips" | "clippers" | "bonuses" | "payouts" | "audit";
type Dataset = { profiles: Row[]; clips: Row[]; campaigns: Row[]; payouts: Row[]; earnings: Row[]; bonusClaims: Row[]; accounts: Row[]; auditLogs: Row[] };
const emptyData: Dataset = { profiles: [], clips: [], campaigns: [], payouts: [], earnings: [], bonusClaims: [], accounts: [], auditLogs: [] };
const fmtInt = (v: unknown) => Number(v || 0).toLocaleString("en-IN");
const fmtMoney = (v: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(v || 0));
const fmtDate = (v: unknown) => v ? new Date(String(v)).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const label = (v: unknown) => String(v ?? "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()) || "—";

export default function AdminManagementClient({ adminName }: { adminName: string }) {
  const [data, setData] = useState<Dataset>(emptyData);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clipStatus, setClipStatus] = useState("all");
  const [clipperFilter, setClipperFilter] = useState("all");
  const [payoutStatus, setPayoutStatus] = useState("all");
  const [bonusStatus, setBonusStatus] = useState("all");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [editViews, setEditViews] = useState("0");
  const [editLikes, setEditLikes] = useState("0");
  const [editEligible, setEditEligible] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editReason, setEditReason] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/management", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not load admin data (${response.status}).`);
      setData({ ...emptyData, ...(body.data || {}) });
      setWarnings(body.warnings || []);
      setTruncated(Boolean(body.truncated));
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Could not load data." });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const peopleByUser = useMemo(() => new Map<string, Row>(data.profiles.map(p => [String(p.user_id), p])), [data.profiles]);
  const campaignsById = useMemo(() => new Map<string, Row>(data.campaigns.map(c => [String(c.id), c])), [data.campaigns]);
  const accountsById = useMemo(() => new Map<string, Row>(data.accounts.map(a => [String(a.id), a])), [data.accounts]);
  const earningsByClip = useMemo(() => new Map<string, Row>(data.earnings.map(e => [String(e.clip_id), e])), [data.earnings]);

  const filteredClips = useMemo(() => data.clips.filter(clip => {
    const p = peopleByUser.get(String(clip.user_id));
    const campaign = campaignsById.get(String(clip.campaign_id));
    const account = accountsById.get(String(clip.instagram_account_id));
    const statusMatches = clipStatus === "all"
      || (clipStatus === "removed" ? Boolean(clip.is_removed) : !clip.is_removed && clip.status === clipStatus);
    const clipperMatches = clipperFilter === "all" || String(clip.user_id) === clipperFilter;
    const text = [clip.instagram_url, clip.shortcode, p?.display_name, p?.user_id, campaign?.name, account?.handle, clip.id].join(" ").toLowerCase();
    return statusMatches && clipperMatches && text.includes(search.toLowerCase());
  }), [data.clips, peopleByUser, campaignsById, accountsById, clipStatus, clipperFilter, search]);

  const filteredClippers = useMemo(() => data.profiles.filter(p => p.role === "clipper" && [p.display_name, p.user_id].join(" ").toLowerCase().includes(search.toLowerCase())), [data.profiles, search]);
  const filteredPayouts = useMemo(() => data.payouts.filter(p => (payoutStatus === "all" || p.status === payoutStatus) && [peopleByUser.get(String(p.user_id))?.display_name, p.user_id, p.id, p.upi_id, p.payment_reference].join(" ").toLowerCase().includes(search.toLowerCase())), [data.payouts, peopleByUser, payoutStatus, search]);
  const filteredBonuses = useMemo(() => data.bonusClaims.filter(b => (bonusStatus === "all" || b.status === bonusStatus) && [peopleByUser.get(String(b.user_id))?.display_name, b.user_id, b.milestone].join(" ").toLowerCase().includes(search.toLowerCase())), [data.bonusClaims, peopleByUser, bonusStatus, search]);
  const filteredAudit = useMemo(() => data.auditLogs.filter(a => [a.action, a.entity_type, a.entity_id, a.reason, a.target_user_id].join(" ").toLowerCase().includes(search.toLowerCase())), [data.auditLogs, search]);

  const approved = data.clips.filter(c => c.status === "approved" && !c.is_removed);
  const pending = data.clips.filter(c => c.status === "pending" && !c.is_removed);
  const removed = data.clips.filter(c => c.is_removed);
  const suspended = data.profiles.filter(p => p.role === "clipper" && p.is_suspended);
  const totalEarned = data.earnings.reduce((s, e) => s + Number(e.amount || 0), 0);

  async function adminAction(payload: Row, busyKey: string) {
    setBusy(busyKey); setNotice(null);
    try {
      const response = await fetch("/api/admin/management", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Action failed (${response.status}).`);
      setNotice({ type: "success", text: body.message || "Saved." });
      await reload();
      return true;
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Action failed." });
      return false;
    } finally { setBusy(null); }
  }

  function beginEdit(clip: Row) {
    setEditing(clip);
    setEditUrl(String(clip.instagram_url || ""));
    setEditViews(String(clip.self_reported_views ?? 0));
    setEditLikes(String(clip.self_reported_likes ?? 0));
    setEditEligible(clip.status === "approved" ? String(clip.eligible_views ?? earningsByClip.get(String(clip.id))?.eligible_views ?? 0) : "");
    setEditNote(String(clip.review_note || ""));
    setEditReason("");
    setNotice(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const payload: Row = {
      action: "edit_clip", id: editing.id, instagramUrl: editUrl.trim(),
      selfReportedViews: Number(editViews), selfReportedLikes: Number(editLikes),
      reviewNote: editNote, reason: editReason.trim(),
    };
    if (editing.status === "approved" && editEligible.trim() !== "") payload.eligibleViews = Number(editEligible);
    const ok = await adminAction(payload, String(editing.id));
    if (ok) setEditing(null);
  }

  async function removeClip(clip: Row) {
    const reason = window.prompt(`Why are you removing this ${clip.status} Reel? This removes the clip from the clipper. Any active clip earning will be reversed from their available wallet and recorded in the financial ledger. Payments already sent cannot be automatically clawed back. Enter a reason:`);
    if (!reason || reason.trim().length < 3) return;
    await adminAction({ action: "remove_clip", id: clip.id, reason: reason.trim() }, String(clip.id));
  }

  async function restoreClip(clip: Row) {
    if (!window.confirm("Restore this clip to the clipper's visible history?")) return;
    const reason = window.prompt("Reason for restoring this clip:");
    if (!reason || reason.trim().length < 3) return;
    await adminAction({ action: "restore_clip", id: clip.id, reason: reason.trim() }, String(clip.id));
  }

  async function suspendClipper(person: Row) {
    const suspended = Boolean(person.is_suspended);
    const reason = window.prompt(suspended ? `Why are you restoring access for ${person.display_name || person.user_id}?` : `Why are you suspending ${person.display_name || person.user_id}? Their history will be retained.`);
    if (!reason || reason.trim().length < 3) return;
    const action = suspended ? "restore_clipper" : "suspend_clipper";
    await adminAction({ action, userId: person.user_id, reason: reason.trim() }, String(person.user_id));
  }

  async function reviewPending(clip: Row, decision: "approve" | "reject") {
    let eligibleViews: number | undefined;
    if (decision === "approve") {
      const value = window.prompt("Enter verified eligible views for earnings. Do not copy unverified self-reported views without checking.", String(clip.self_reported_views ?? 0));
      if (value === null) return;
      eligibleViews = Number(value);
      if (!Number.isSafeInteger(eligibleViews) || eligibleViews < 0 || eligibleViews > 1_000_000_000) {
        setNotice({ type: "error", text: "Eligible views must be a whole number from 0 to 1,000,000,000." }); return;
      }
    } else if (!window.confirm("Reject this pending clip?")) return;
    setBusy(String(clip.id)); setNotice(null);
    try {
      const response = await fetch(`/api/admin/clips/${encodeURIComponent(String(clip.id))}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(eligibleViews !== undefined ? { eligibleViews } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Could not ${decision} clip.`);
      setNotice({ type: "success", text: decision === "approve" ? "Clip approved successfully." : "Clip rejected successfully." });
      await reload();
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "Review action failed." });
    } finally { setBusy(null); }
  }

  function exportClips() {
    const rows = [["clip_id", "clipper", "user_id", "campaign", "instagram_url", "status", "removed", "reported_views", "reported_likes", "eligible_views", "submitted_at", "review_note"], ...filteredClips.map(c => [
      c.id, peopleByUser.get(String(c.user_id))?.display_name || "", c.user_id,
      campaignsById.get(String(c.campaign_id))?.name || "", c.instagram_url, c.status, c.is_removed ? "yes" : "no",
      c.self_reported_views ?? 0, c.self_reported_likes ?? 0, c.eligible_views ?? earningsByClip.get(String(c.id))?.eligible_views ?? 0,
      c.submitted_at, c.review_note || "",
    ])];
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `clipperplatform-clips-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function showClipperClips(person: Row) {
    setClipperFilter(String(person.user_id)); setClipStatus("all"); setSearch(""); setTab("clips");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" }, { id: "clips", label: "Clip management" },
    { id: "clippers", label: "Clipper accounts" }, { id: "bonuses", label: "Bonus claims" },
    { id: "payouts", label: "Payouts" }, { id: "audit", label: "Audit log" },
  ];

  return <div className={styles.shell}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>ADMIN OPERATIONS</p><h1>Control center</h1><p className={styles.subtitle}>Manage every submission, review a clipper's history, and keep a trace of important changes.</p></div>
      <div className={styles.headerRight}><span>Signed in as <strong>{adminName}</strong></span><button className={styles.secondaryButton} onClick={() => void reload()} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh data"}</button></div>
    </header>
    <nav className={styles.tabs} aria-label="Admin operations sections">{tabs.map(item => <button key={item.id} onClick={() => { setTab(item.id); setSearch(""); }} className={tab === item.id ? styles.activeTab : styles.tab}>{item.label}</button>)}</nav>

    {notice && <div className={notice.type === "success" ? styles.successNotice : styles.errorNotice} role="status">{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}
    {warnings.length > 0 && <div className={styles.warningNotice}><strong>Some information could not load.</strong><ul>{warnings.map((w, i) => <li key={`${i}-${w}`}>{w}</li>)}</ul><small>If the missing table is <code>admin_management_audit</code>, apply migration 006 before continuing.</small></div>}
    {truncated && <div className={styles.warningNotice}>The safety limit was reached (2,000 clips or 1,000 profiles). Narrow your list and contact support if you need deeper historical pagination.</div>}

    {tab === "overview" && <>
      <div className={styles.metricsGrid}>
        <Metric label="Total clippers" value={fmtInt(data.profiles.filter(p => p.role === "clipper").length)} note="Registered clipper profiles" />
        <Metric label="Pending review" value={fmtInt(pending.length)} note="Waiting for a decision" tone="amber" />
        <Metric label="Approved clips" value={fmtInt(approved.length)} note="Active, non-removed clips" tone="green" />
        <Metric label="Removed clips" value={fmtInt(removed.length)} note="Soft removed; can be restored" />
        <Metric label="Suspended accounts" value={fmtInt(suspended.length)} note="Login access suspended" tone="red" />
        <Metric label="Recorded earnings" value={fmtMoney(totalEarned)} note={`${fmtInt(data.earnings.length)} earning records`} />
      </div>
      <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Quick operations</h2><p>Jump straight to common admin tasks.</p></div></div><div className={styles.quickGrid}>
        <button onClick={() => { setTab("clips"); setClipStatus("approved"); setClipperFilter("all"); }}><strong>Review approved Reels</strong><span>Open and correct any approved clip.</span></button>
        <button onClick={() => { setTab("clips"); setClipStatus("pending"); setClipperFilter("all"); }}><strong>Review pending clips</strong><span>Approve or reject submissions with verified eligible views.</span></button>
        <button onClick={() => setTab("clippers")}><strong>Manage clippers</strong><span>Open one user's full clip history or suspend access.</span></button>
        <Link href="/admin/bonuses"><strong>Review bonus claims ↗</strong><span>Approve/reject and record bonus payments.</span></Link>
        <Link href="/admin"><strong>Original admin dashboard ↗</strong><span>Return to the existing control center.</span></Link>
        <Link href="/admin/campaigns"><strong>Campaigns ↗</strong><span>Manage campaign rates and availability.</span></Link>
      </div></section>
      <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Latest important changes</h2><p>Recent clip and account actions.</p></div><button className={styles.textButton} onClick={() => setTab("audit")}>View audit log →</button></div>
        <AuditRows logs={data.auditLogs.slice(0, 8)} />
      </section>
    </>}

    {tab === "clips" && <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Clip management</h2><p>Every loaded clip can be opened individually. Filter by approval status or jump to one clipper's full history.</p></div><button className={styles.primaryButton} onClick={exportClips}>↓ Export filtered CSV</button></div>
      <div className={styles.filterBar}>
        <label>Status<select value={clipStatus} onChange={e => setClipStatus(e.target.value)}><option value="all">All active statuses</option><option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="removed">Removed</option></select></label>
        <label>Clipper<select value={clipperFilter} onChange={e => setClipperFilter(e.target.value)}><option value="all">All clippers</option>{data.profiles.filter(p => p.role === "clipper").map(p => <option key={p.user_id} value={p.user_id}>{p.display_name || p.user_id}</option>)}</select></label>
        <label className={styles.searchLabel}>Search<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Clipper, URL, campaign, account, ID…" /></label>
      </div>
      <p className={styles.resultCount}>{fmtInt(filteredClips.length)} clips match your filters</p>
      <div className={styles.tableScroller}><table className={styles.table}><thead><tr><th>Reel</th><th>Clipper</th><th>Campaign / account</th><th>Metrics</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {filteredClips.map(clip => {
          const person = peopleByUser.get(String(clip.user_id)); const campaign = campaignsById.get(String(clip.campaign_id)); const account = accountsById.get(String(clip.instagram_account_id)); const earning = earningsByClip.get(String(clip.id));
          return <tr key={clip.id} className={clip.is_removed ? styles.removedRow : ""}>
            <td><a className={styles.reelLink} href={clip.instagram_url} target="_blank" rel="noreferrer">Open Reel ↗</a><small>{String(clip.shortcode || clip.id).slice(0, 22)}</small><code className={styles.idCode}>{String(clip.id).slice(0, 8)}…</code></td>
            <td><strong>{person?.display_name || "Unnamed clipper"}</strong><small>{String(clip.user_id).slice(0, 12)}…</small>{person?.is_suspended && <span className={`${styles.pill} ${styles.redPill}`}>Suspended</span>}<button className={styles.inlineLink} onClick={() => person && showClipperClips(person)}>View this clipper's clips →</button></td>
            <td><strong>{campaign?.name || "Unknown campaign"}</strong><small>{account?.handle ? `@${account.handle}` : "No account linked"}</small><small>{campaign?.is_active ? "Campaign active" : "Campaign inactive"}</small></td>
            <td><div className={styles.metricStack}><span>Reported views <b>{fmtInt(clip.self_reported_views)}</b></span><span>Reported likes <b>{fmtInt(clip.self_reported_likes)}</b></span><span>Eligible views <b>{fmtInt(earning?.eligible_views ?? clip.eligible_views)}</b></span><span>Earning <b>{fmtMoney(earning?.amount)}</b></span></div></td>
            <td>{fmtDate(clip.submitted_at)}</td>
            <td><span className={`${styles.pill} ${clip.is_removed ? styles.redPill : clip.status === "approved" ? styles.greenPill : (clip.status === "pending" || clip.status === "reviewing") ? styles.amberPill : styles.grayPill}`}>{clip.is_removed ? "Removed" : label(clip.status)}</span>{clip.review_note && <small className={styles.noteSmall}>{clip.review_note}</small>}{clip.is_removed && clip.removal_reason && <small className={styles.noteSmall}>Reason: {clip.removal_reason}</small>}</td>
            <td><div className={styles.actionStack}>
              {!clip.is_removed && <button className={styles.secondaryButton} disabled={busy === String(clip.id)} onClick={() => beginEdit(clip)}>Edit clip</button>}
              {!clip.is_removed && clip.status !== "reviewing" && <button className={styles.secondaryButton} disabled={busy === String(clip.id)} onClick={() => { const reason = window.prompt("Ask this clipper to update current views and likes? Enter a short reason:", "Please submit updated Reel views and likes for review."); if (reason && reason.trim().length >= 3) void adminAction({ action: "mark_reviewing", id: clip.id, reason: reason.trim() }, String(clip.id)); }}>Mark as Reviewing</button>}
              {!clip.is_removed && clip.status === "pending" && <><button className={styles.approveButton} disabled={busy === String(clip.id)} onClick={() => void reviewPending(clip, "approve")}>Approve</button><button className={styles.dangerButton} disabled={busy === String(clip.id)} onClick={() => void reviewPending(clip, "reject")}>Reject</button></>}
              {clip.is_removed ? <button className={styles.approveButton} disabled={busy === String(clip.id)} onClick={() => void restoreClip(clip)}>Restore</button> : <button className={styles.dangerButton} disabled={busy === String(clip.id)} onClick={() => void removeClip(clip)}>Remove</button>}
            </div></td>
          </tr>;
        })}
        {filteredClips.length === 0 && <tr><td colSpan={7} className={styles.emptyCell}>No clips match these filters.</td></tr>}
      </tbody></table></div>
      <p className={styles.footnote}>Remove is reversible and hides the clip from the clipper-facing pages. Any linked earning is zeroed while its history remains, and the wallet trigger records the debit in the financial ledger. Restoring an approved clip recalculates its earning from the preserved eligible-view count and campaign rate. A payout already paid externally is not automatically clawed back.</p>
    </section>}

    {tab === "clippers" && <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Clipper accounts</h2><p>Open all submissions from one clipper, review their counts, or suspend access without deleting financial history.</p></div><span className={styles.countBadge}>{fmtInt(filteredClippers.length)} accounts</span></div>
      <div className={styles.filterBar}><label className={styles.searchLabel}>Search clippers<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or user ID…" /></label></div>
      <div className={styles.tableScroller}><table className={styles.table}><thead><tr><th>Clipper</th><th>Joined</th><th>Submissions</th><th>Pending</th><th>Approved</th><th>Eligible views</th><th>Earnings</th><th>Account</th><th>Actions</th></tr></thead><tbody>
        {filteredClippers.map(person => {
          const pcs = data.clips.filter(c => String(c.user_id) === String(person.user_id));
          const activePcs = pcs.filter(c => !c.is_removed);
          const earned = data.earnings.filter(e => String(e.user_id) === String(person.user_id)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
          const views = activePcs.filter(c => c.status === "approved").reduce((sum, c) => sum + Number(earningsByClip.get(String(c.id))?.eligible_views ?? c.eligible_views ?? 0), 0);
          return <tr key={person.user_id}><td><strong>{person.display_name || "Unnamed clipper"}</strong><small className={styles.idCode}>{person.user_id}</small></td><td>{fmtDate(person.created_at)}</td><td>{fmtInt(pcs.length)}</td><td>{fmtInt(activePcs.filter(c => c.status === "pending").length)}</td><td>{fmtInt(activePcs.filter(c => c.status === "approved").length)}</td><td>{fmtInt(views)}</td><td>{fmtMoney(earned)}</td><td><span className={`${styles.pill} ${person.is_suspended ? styles.redPill : styles.greenPill}`}>{person.is_suspended ? "Suspended" : "Active"}</span>{person.is_suspended && person.suspension_reason && <small className={styles.noteSmall}>{person.suspension_reason}</small>}</td><td><div className={styles.actionStack}><button className={styles.secondaryButton} onClick={() => showClipperClips(person)}>View all clips</button><button className={person.is_suspended ? styles.approveButton : styles.dangerButton} disabled={busy === String(person.user_id)} onClick={() => void suspendClipper(person)}>{person.is_suspended ? "Restore access" : "Suspend access"}</button></div></td></tr>;
        })}
        {filteredClippers.length === 0 && <tr><td colSpan={9} className={styles.emptyCell}>No clippers found.</td></tr>}
      </tbody></table></div>
      <p className={styles.footnote}>Suspending bans sign-in using Supabase Auth and preserves the account, clips, bonus claims, earnings, and payment history. It is reversible; this screen does not hard-delete a clipper's records.</p>
    </section>}

    {tab === "bonuses" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Bonus claims snapshot</h2><p>Use the dedicated claims page for approve, reject, or mark-paid actions.</p></div><Link className={styles.primaryButton} href="/admin/bonuses">Open bonus manager ↗</Link></div><div className={styles.filterBar}><label>Status<select value={bonusStatus} onChange={e => setBonusStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select></label><label className={styles.searchLabel}>Search claims<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Clipper or milestone…" /></label></div><div className={styles.tableScroller}><table className={styles.table}><thead><tr><th>Clipper</th><th>Milestone</th><th>Claim amount</th><th>Count recorded</th><th>Requested</th><th>Status</th></tr></thead><tbody>{filteredBonuses.map(b => <tr key={b.id}><td><strong>{peopleByUser.get(String(b.user_id))?.display_name || "Unnamed clipper"}</strong><small>{String(b.user_id).slice(0, 12)}…</small></td><td>{b.milestone} approved clips</td><td>{fmtMoney(b.amount_inr)}</td><td>{fmtInt(b.approved_clip_count_at_claim)}</td><td>{fmtDate(b.requested_at)}</td><td><span className={`${styles.pill} ${b.status === "paid" ? styles.greenPill : b.status === "pending" ? styles.amberPill : styles.grayPill}`}>{label(b.status)}</span></td></tr>)}{filteredBonuses.length === 0 && <tr><td colSpan={6} className={styles.emptyCell}>No bonus claims match.</td></tr>}</tbody></table></div></section>}

    {tab === "payouts" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Payout queue snapshot</h2><p>Use the existing payout manager to change status or record real payment references.</p></div><Link className={styles.primaryButton} href="/admin/payouts">Open payout manager ↗</Link></div><div className={styles.filterBar}><label>Status<select value={payoutStatus} onChange={e => setPayoutStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="requested">Requested</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select></label><label className={styles.searchLabel}>Search payouts<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Clipper, UPI ID, payment ref…" /></label></div><div className={styles.tableScroller}><table className={styles.table}><thead><tr><th>Clipper</th><th>Requested</th><th>Amount</th><th>UPI ID</th><th>Status</th><th>Payment reference</th></tr></thead><tbody>{filteredPayouts.map(p => <tr key={p.id}><td><strong>{peopleByUser.get(String(p.user_id))?.display_name || "Unnamed clipper"}</strong><small>{String(p.user_id).slice(0, 12)}…</small></td><td>{fmtDate(p.requested_at)}</td><td>{fmtMoney(p.amount)}</td><td>{p.upi_id || "—"}</td><td><span className={`${styles.pill} ${p.status === "paid" ? styles.greenPill : ["pending", "requested", "approved"].includes(p.status) ? styles.amberPill : styles.grayPill}`}>{label(p.status)}</span></td><td>{p.payment_reference || "—"}</td></tr>)}{filteredPayouts.length === 0 && <tr><td colSpan={6} className={styles.emptyCell}>No payout records match.</td></tr>}</tbody></table></div></section>}

    {tab === "audit" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Admin audit log</h2><p>Recent edits, removals, restorations, and clipper access changes.</p></div><span className={styles.countBadge}>{fmtInt(filteredAudit.length)} events</span></div><div className={styles.filterBar}><label className={styles.searchLabel}>Search log<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Action, target, reason, ID…" /></label></div><AuditRows logs={filteredAudit} /></section>}

    {loading && <div className={styles.loadingOverlay}><span className={styles.spinner} />Loading latest data…</div>}

    {editing && <div className={styles.modalBackdrop} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-clip-title">
        <div className={styles.modalHeader}><div><p className={styles.eyebrow}>ADMIN EDIT</p><h2 id="edit-clip-title">Update clip details</h2><p>Changes are recorded in the admin audit log.</p></div><button className={styles.closeButton} onClick={() => setEditing(null)} aria-label="Close dialog">×</button></div>
        <form onSubmit={saveEdit} className={styles.editForm}>
          <label>Instagram Reel URL<input type="url" required value={editUrl} onChange={e => setEditUrl(e.target.value)} placeholder="https://www.instagram.com/reel/..." /></label>
          <div className={styles.twoCols}><label>Clipper-reported views<input type="number" min="0" max="1000000000" step="1" required value={editViews} onChange={e => setEditViews(e.target.value)} /></label><label>Clipper-reported likes<input type="number" min="0" max="1000000000" step="1" required value={editLikes} onChange={e => setEditLikes(e.target.value)} /></label></div>
          {editing.status === "approved" && <label>Verified eligible views <input type="number" min="0" max="1000000000" step="1" value={editEligible} onChange={e => setEditEligible(e.target.value)} /><small>Updating recalculates the linked earning at the campaign rate. Any amount change is recorded in the wallet ledger; a payout already paid externally is not automatically reclaimed.</small></label>}
          <label>Admin review note<textarea rows={3} maxLength={2000} value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Internal note for this clip…" /></label>
          <label>Reason for this change <textarea rows={2} minLength={3} maxLength={1000} required value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Why does this clip need correction? This is saved to the audit log." /></label>
          <div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy === String(editing.id)}>{busy === String(editing.id) ? "Saving…" : "Save clip changes"}</button></div>
        </form>
      </section>
    </div>}
  </div>;
}

function Metric({ label, value, note, tone = "blue" }: { label: string; value: string; note: string; tone?: "blue" | "amber" | "green" | "red" }) {
  return <div className={`${styles.metricCard} ${tone === "amber" ? styles.metricAmber : tone === "green" ? styles.metricGreen : tone === "red" ? styles.metricRed : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function AuditRows({ logs }: { logs: Row[] }) {
  if (!logs.length) return <div className={styles.emptyCell}>No admin operations have been recorded here yet.</div>;
  return <div className={styles.auditList}>{logs.map(log => <article className={styles.auditItem} key={log.id}><div className={styles.auditDot} /><div className={styles.auditContent}><div className={styles.auditTop}><strong>{label(log.action)}</strong><time>{fmtDate(log.created_at)}</time></div><p>{label(log.entity_type)} · <code>{String(log.entity_id || "").slice(0, 24)}</code>{log.target_user_id ? ` · clipper ${String(log.target_user_id).slice(0, 12)}…` : ""}</p>{log.reason && <small>Reason: {log.reason}</small>}{(log.previous_values || log.new_values) && <details><summary>View recorded values</summary><pre>{JSON.stringify({ before: log.previous_values, after: log.new_values }, null, 2)}</pre></details>}</div></article>)}</div>;
}
