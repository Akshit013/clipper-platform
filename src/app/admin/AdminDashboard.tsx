"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { signOut } from "@/actions/admin-auth";
import styles from "./AdminDashboard.module.css";

export type AdminProfile = { id: string; user_id: string; display_name: string | null; role: "admin" | "clipper"; created_at: string };
export type AdminCampaign = { id: string; name: string; description: string | null; rate_per_1000: number | string; currency: string; is_active: boolean; start_date: string; end_date: string; created_at: string };
export type AdminClip = { id: string; user_id: string; campaign_id: string; instagram_account_id?: string | null; instagram_account_handle?: string | null; instagram_url: string; shortcode: string | null; self_reported_views: number; self_reported_likes: number; status: "pending" | "approved" | "rejected"; submitted_at: string; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null; eligible_views: number; last_observed_views: number | null; last_metric_at: string | null };
export type AdminPayout = { id: string; user_id: string; amount: number | string; currency: string; status: "requested" | "approved" | "paid" | "rejected"; requested_at: string; reviewed_at: string | null; paid_at: string | null; payment_reference: string | null; upi_id: string | null; admin_note: string | null };
export type AdminEarning = { id: string; clip_id: string; user_id: string; campaign_id: string; eligible_views: number; rate_per_1000: number | string; amount: number | string; currency: string; calculated_at: string };
type Tab = "overview" | "clips" | "campaigns" | "payouts" | "clippers";

const currencyAmount = (amount: number | string, _currency = "INR") => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(amount || 0));
const integer = (n: number | null | undefined) => Number(n || 0).toLocaleString("en-IN");
const shortDate = (value?: string | null) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const dateInputValue = (daysFromToday = 0) => { const d = new Date(); d.setDate(d.getDate() + daysFromToday); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const labelize = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AdminDashboard({ adminName, initialError, profiles, campaigns, clips, payouts, earnings }: {
  adminName: string; initialError: string | null; profiles: AdminProfile[]; campaigns: AdminCampaign[]; clips: AdminClip[]; payouts: AdminPayout[]; earnings: AdminEarning[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [clipFilter, setClipFilter] = useState("pending");
  const [payoutFilter, setPayoutFilter] = useState("all");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(initialError ? { kind: "error", text: `Some data could not be loaded: ${initialError}` } : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const campaignById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const clipperCount = profiles.filter((p) => p.role === "clipper").length;
  const pendingClips = clips.filter((c) => c.status === "pending");
  const payoutQueue = payouts.filter((p) => p.status === "requested" || p.status === "approved");
  const totalApprovedViews = clips.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.eligible_views || 0), 0);
  const totalEarnings = earnings.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalQueuedPayouts = payoutQueue.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const filteredClips = clips.filter((clip) => {
    const statusMatches = clipFilter === "all" || clip.status === clipFilter;
    const haystack = `${clip.instagram_url} ${profileById.get(clip.user_id)?.display_name ?? ""} ${campaignById.get(clip.campaign_id)?.name ?? ""}`.toLowerCase();
    return statusMatches && haystack.includes(search.toLowerCase());
  });
  const filteredPayouts = payouts.filter((p) => (payoutFilter === "all" || p.status === payoutFilter) && `${profileById.get(p.user_id)?.display_name ?? ""} ${p.id} ${p.payment_reference ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const filteredCampaigns = campaigns.filter((c) => `${c.name} ${c.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const filteredProfiles = profiles.filter((p) => p.role === "clipper" && `${p.display_name ?? ""} ${p.user_id}`.toLowerCase().includes(search.toLowerCase()));

  async function postJson(url: string, payload: unknown, id: string) {
    setBusyId(id); setNotice(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setNotice({ kind: "success", text: "Saved successfully. Refreshing the latest data…" });
      window.location.reload();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong. Please try again." });
    } finally { setBusyId(null); }
  }

  async function patchJson(url: string, payload: unknown, id: string) {
    setBusyId(id); setNotice(null);
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      window.location.reload();
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong. Please try again." });
    } finally { setBusyId(null); }
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreatingCampaign(true); setNotice(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      ratePer1000: Number(formData.get("rate_per_1000")),
      startDate: String(formData.get("start_date") || ""),
      endDate: String(formData.get("end_date") || ""),
      isActive: formData.get("is_active") === "on",
    };
    try {
      const response = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      window.location.reload();
    } catch (e) { setNotice({ kind: "error", text: e instanceof Error ? e.message : "Could not create campaign." }); }
    finally { setCreatingCampaign(false); }
  }

  function reviewClip(clip: AdminClip, decision: "approve" | "reject") {
    let eligibleViews: number | undefined;
    if (decision === "approve") {
      const raw = window.prompt("Enter the verified eligible views for this Reel:", String(clip.last_observed_views ?? clip.eligible_views ?? 0));
      if (raw === null) return;
      eligibleViews = Number(raw);
      if (!Number.isSafeInteger(eligibleViews) || eligibleViews < 0) { setNotice({ kind: "error", text: "Enter a valid non-negative whole number of eligible views." }); return; }
    }
    if (decision === "reject" && !window.confirm("Reject this Reel submission?")) return;
    void postJson(`/api/admin/clips/${clip.id}/approve`, { decision, ...(eligibleViews === undefined ? {} : { eligibleViews }) }, clip.id);
  }

  function updatePayout(payout: AdminPayout, decision: "approve" | "reject" | "mark_paid") {
    let paymentReference: string | undefined;
    if (decision === "mark_paid") {
      const reference = window.prompt("Enter the real bank/UPI transfer reference. Only do this after sending the payment:");
      if (reference === null) return;
      if (!reference.trim()) { setNotice({ kind: "error", text: "A payment reference is required to mark a payout as paid." }); return; }
      paymentReference = reference.trim();
    }
    if (decision !== "mark_paid" && !window.confirm(decision === "approve" ? "Approve this payout request?" : "Reject this payout request?")) return;
    void postJson(`/api/admin/payouts/${payout.id}`, { decision, ...(paymentReference ? { paymentReference } : {}) }, payout.id);
  }

  const navItems: { id: Tab; label: string; icon: string; count?: number }[] = [
    { id: "overview", label: "Overview", icon: "▦" },
    { id: "clips", label: "Clip review", icon: "▷", count: pendingClips.length },
    { id: "campaigns", label: "Campaigns", icon: "◈" },
    { id: "payouts", label: "Payouts", icon: "₹", count: payoutQueue.length },
    { id: "clippers", label: "Clippers", icon: "♙" },
  ];

  return <div className={styles.appShell}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><div className={styles.brandMark}>C</div><div><strong>ClipperHub</strong><span>OPERATIONS</span></div></div>
      <div className={styles.workspaceLabel}>WORKSPACE</div>
      <nav className={styles.nav} aria-label="Admin sections">
        {navItems.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setSearch(""); }} className={`${styles.navItem} ${tab === item.id ? styles.navActive : ""}`}>
          <span className={styles.navIcon}>{item.icon}</span><span>{item.label}</span>{item.count ? <span className={styles.navCount}>{item.count}</span> : null}
        </button>)}
      </nav>
      <div className={styles.sidebarBottom}><div className={styles.secureNote}><span className={styles.greenDot} /> Admin access enabled <small>Protected operations workspace</small></div><div className={styles.userCard}><div className={styles.avatar}>{adminName.slice(0, 1).toUpperCase()}</div><div className={styles.userDetails}><strong>{adminName}</strong><span>Administrator</span></div><form action={signOut}><button className={styles.signOut} title="Sign out" aria-label="Sign out">↗</button></form></div></div>
    </aside>

    <main className={styles.mainArea}>
      <header className={styles.topbar}><div><div className={styles.breadcrumb}>Workspace <span>/</span> <strong>{navItems.find((n) => n.id === tab)?.label}</strong></div><div className={styles.mobileBrand}>ClipperHub <span>ADMIN</span></div></div><div className={styles.topbarRight}><span className={styles.livePill}><span /> Live workspace</span><div className={styles.topAvatar}>{adminName.slice(0, 1).toUpperCase()}</div></div></header>
      <div className={styles.content}>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>ADMIN CONTROL CENTER</p><h1>{tab === "overview" ? "Good to see you, " + adminName : navItems.find((n) => n.id === tab)?.label}</h1><p className={styles.subheading}>{tab === "overview" ? "Here’s what’s happening across your clipping operation." : sectionDescription(tab)}</p></div><div className={styles.headingDate}>{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div></div>

        {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : styles.noticeSuccess}`} role="status"><span>{notice.kind === "error" ? "!" : "✓"}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}

        {tab === "overview" && <>
          <section className={styles.statsGrid}>
            <StatCard label="Total clippers" value={integer(clipperCount)} icon="♙" tone="violet" foot={`${profiles.length} total accounts`} />
            <StatCard label="Active campaigns" value={integer(campaigns.filter((c) => c.is_active).length)} icon="◈" tone="blue" foot={`${campaigns.length} campaigns created`} />
            <StatCard label="Clips awaiting review" value={integer(pendingClips.length)} icon="▷" tone="amber" foot={pendingClips.length ? "Review queue needs attention" : "You’re all caught up"} />
            <StatCard label="Payouts in queue" value={currencyAmount(totalQueuedPayouts)} icon="₹" tone="green" foot={`${payoutQueue.length} requests awaiting action`} />
          </section>

          <section className={styles.insightGrid}>
            <div className={styles.panel}><div className={styles.panelHeader}><div><h2>Review activity</h2><p>Moderation overview</p></div><button className={styles.textLink} onClick={() => setTab("clips")}>Open review queue →</button></div>
              <div className={styles.reviewSummary}><div className={styles.reviewNumber}><strong>{integer(pendingClips.length)}</strong><span>Pending review</span></div><div className={styles.progressTrack}><div style={{ width: `${clips.length ? Math.min(100, (clips.filter((c) => c.status !== "pending").length / clips.length) * 100) : 0}%` }} /></div><div className={styles.reviewStats}><span><i className={styles.dotBlue} /> {integer(clips.filter((c) => c.status === "approved").length)} approved</span><span><i className={styles.dotRed} /> {integer(clips.filter((c) => c.status === "rejected").length)} rejected</span></div></div>
              <div className={styles.miniList}>{pendingClips.slice(0, 4).map((clip) => <div className={styles.miniRow} key={clip.id}><div className={styles.miniIcon}>▷</div><div className={styles.miniMain}><strong>{profileById.get(clip.user_id)?.display_name || "Unnamed clipper"}</strong><span>{campaignById.get(clip.campaign_id)?.name || "Unknown campaign"} · {shortDate(clip.submitted_at)}</span></div><button className={styles.smallAction} onClick={() => setTab("clips")}>Review</button></div>)}{pendingClips.length === 0 && <EmptyState title="No clips waiting" text="New submissions will appear here." />}</div>
            </div>
            <div className={styles.panel}><div className={styles.panelHeader}><div><h2>Financial snapshot</h2><p>Recorded figures to date</p></div><span className={styles.currencyLabel}>Indian rupees (INR) only</span></div><div className={styles.financeBlock}><span>Total recorded earnings</span><strong>{currencyAmount(totalEarnings)}</strong><small>From {earnings.length} approved clip earning record{earnings.length === 1 ? "" : "s"}</small></div><div className={styles.financeRow}><span>Approved eligible views</span><strong>{integer(totalApprovedViews)}</strong></div><div className={styles.financeRow}><span>Paid out</span><strong>{currencyAmount(payouts.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0))}</strong></div><div className={styles.financeRow}><span>Awaiting action</span><strong className={styles.warningText}>{integer(payoutQueue.length)} payout requests</strong></div><button className={styles.secondaryFull} onClick={() => setTab("payouts")}>Manage payouts <span>→</span></button></div>
          </section>

          <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Latest clip submissions</h2><p>Most recently submitted Reels</p></div><button className={styles.textLink} onClick={() => setTab("clips")}>View all clips →</button></div><ClipTable clips={clips.slice(0, 6)} profileById={profileById} campaignById={campaignById} busyId={busyId} onReview={reviewClip} compact /></section>
        </>}

        {tab === "clips" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Clip review queue</h2><p>Review submitted Instagram Reels and record eligible views.</p></div><span className={styles.countPill}>{integer(filteredClips.length)} clips</span></div><div className={styles.filters}><select value={clipFilter} onChange={(e) => setClipFilter(e.target.value)} aria-label="Filter clip status"><option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select><SearchInput value={search} onChange={setSearch} placeholder="Search clippers, campaigns, links…" /></div><ClipTable clips={filteredClips} profileById={profileById} campaignById={campaignById} busyId={busyId} onReview={reviewClip} /></section>}

        {tab === "campaigns" && <div className={styles.campaignLayout}><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Create a campaign</h2><p>Set the rate that determines clipper earnings.</p></div><span className={styles.formIcon}>＋</span></div><form className={styles.campaignForm} onSubmit={createCampaign}><label>Campaign name<input name="name" required maxLength={120} placeholder="e.g. Creator launch — October" /></label><label>Description<textarea name="description" rows={3} maxLength={1000} placeholder="Brief campaign instructions for clippers" /></label><div className={styles.formTwoCol}><label>Rate per 1,000 eligible views (INR)<input name="rate_per_1000" required type="number" min="0.01" step="0.01" placeholder="100" /></label><label>Start date<input name="start_date" type="date" required defaultValue={dateInputValue(0)} /></label></div><label>End date<input name="end_date" type="date" required min={dateInputValue(0)} defaultValue={dateInputValue(30)} /></label><label className={styles.checkboxLabel}><input name="is_active" type="checkbox" defaultChecked /> Publish as active campaign</label><button className={styles.primaryButton} disabled={creatingCampaign}>{creatingCampaign ? "Creating…" : "＋ Create campaign"}</button></form></section><section className={styles.panel}><div className={styles.panelHeader}><div><h2>Your campaigns</h2><p>Manage availability for new clip submissions.</p></div><span className={styles.countPill}>{campaigns.length} total</span></div><div className={styles.filters}><SearchInput value={search} onChange={setSearch} placeholder="Search campaigns…" /></div><div className={styles.campaignList}>{filteredCampaigns.map((campaign) => <div className={styles.campaignItem} key={campaign.id}><div className={styles.campaignSymbol}>◈</div><div className={styles.campaignInfo}><strong>{campaign.name}</strong><span>{campaign.description || "No description provided"}</span><small>{currencyAmount(campaign.rate_per_1000, "INR")} / 1,000 views · {shortDate(campaign.start_date)} – {shortDate(campaign.end_date)}</small></div><div className={styles.campaignControls}><StatusBadge status={campaign.is_active ? "active" : "inactive"} /><button className={campaign.is_active ? styles.outlineButton : styles.smallAction} disabled={busyId === campaign.id} onClick={() => void patchJson(`/api/admin/campaigns/${campaign.id}`, { isActive: !campaign.is_active }, campaign.id)}>{campaign.is_active ? "Pause" : "Activate"}</button></div></div>)}{filteredCampaigns.length === 0 && <EmptyState title="No campaigns yet" text="Create your first campaign with the form." />}</div></section></div>}

        {tab === "payouts" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Payout management</h2><p>Approve requests, reject invalid requests, and record transfers after payment is sent.</p></div><span className={styles.countPill}>{payouts.length} records</span></div><div className={styles.payoutSummary}><div><span>Requested</span><strong>{integer(payouts.filter((p) => p.status === "requested").length)}</strong></div><div><span>Approved, not paid</span><strong>{integer(payouts.filter((p) => p.status === "approved").length)}</strong></div><div><span>Marked paid</span><strong>{integer(payouts.filter((p) => p.status === "paid").length)}</strong></div><div><span>Queue amount</span><strong>{currencyAmount(totalQueuedPayouts)}</strong></div></div><div className={styles.filters}><select value={payoutFilter} onChange={(e) => setPayoutFilter(e.target.value)} aria-label="Filter payout status"><option value="all">All statuses</option><option value="requested">Requested</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select><SearchInput value={search} onChange={setSearch} placeholder="Search clipper or reference…" /></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Clipper</th><th>Requested</th><th>Amount</th><th>Status</th><th>UPI ID</th><th>Payment reference</th><th>Actions</th></tr></thead><tbody>{filteredPayouts.map((payout) => <tr key={payout.id}><td><strong>{profileById.get(payout.user_id)?.display_name || "Unnamed clipper"}</strong><small className={styles.subCell}>{payout.user_id.slice(0, 8)}…</small></td><td>{shortDate(payout.requested_at)}</td><td><strong>{currencyAmount(payout.amount, payout.currency)}</strong></td><td><StatusBadge status={payout.status} /></td><td>{payout.upi_id || "—"}</td><td>{payout.payment_reference || "—"}</td><td><div className={styles.actionGroup}>{payout.status === "requested" && <><button className={styles.smallAction} disabled={busyId === payout.id} onClick={() => updatePayout(payout, "approve")}>Approve</button><button className={styles.dangerButton} disabled={busyId === payout.id} onClick={() => updatePayout(payout, "reject")}>Reject</button></>}{payout.status === "approved" && <button className={styles.smallAction} disabled={busyId === payout.id} onClick={() => updatePayout(payout, "mark_paid")}>Mark paid</button>}{(payout.status === "paid" || payout.status === "rejected") && <span className={styles.mutedText}>Finalized</span>}</div></td></tr>)}{filteredPayouts.length === 0 && <tr><td colSpan={7}><EmptyState title="No payout requests found" text="Payout requests will appear when clippers submit them." /></td></tr>}</tbody></table></div><p className={styles.cautionNote}>Important: approving a payout does not transfer money. Send the real bank/UPI payment separately, then choose “Mark paid” and enter its reference.</p></section>}

        {tab === "clippers" && <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Clipper directory</h2><p>Registered accounts and their platform activity.</p></div><span className={styles.countPill}>{clipperCount} clippers</span></div><div className={styles.filters}><SearchInput value={search} onChange={setSearch} placeholder="Search clippers…" /></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Clipper</th><th>Joined</th><th>Clips submitted</th><th>Approved views</th><th>Recorded earnings</th><th>Outstanding payout</th></tr></thead><tbody>{filteredProfiles.map((person) => { const personClips = clips.filter((c) => c.user_id === person.user_id); const personEarnings = earnings.filter((e) => e.user_id === person.user_id); const due = payouts.filter((p) => p.user_id === person.user_id && ["requested", "approved"].includes(p.status)).reduce((sum, p) => sum + Number(p.amount), 0); return <tr key={person.id}><td><div className={styles.nameCell}><div className={styles.miniAvatar}>{(person.display_name || "C").slice(0, 1).toUpperCase()}</div><div><strong>{person.display_name || "Unnamed clipper"}</strong><small className={styles.subCell}>{person.user_id.slice(0, 8)}…</small></div></div></td><td>{shortDate(person.created_at)}</td><td>{integer(personClips.length)}</td><td>{integer(personClips.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.eligible_views), 0))}</td><td>{currencyAmount(personEarnings.reduce((sum, e) => sum + Number(e.amount), 0), personEarnings[0]?.currency || "INR")}</td><td>{currencyAmount(due, payouts.find((p) => p.user_id === person.user_id)?.currency || "INR")}</td></tr>; })}{filteredProfiles.length === 0 && <tr><td colSpan={6}><EmptyState title="No clippers found" text="New registered clipper accounts will show up here." /></td></tr>}</tbody></table></div></section>}

        <footer className={styles.footer}><span>ClipperHub Admin</span><span>Figures reflect records currently stored in your Supabase project.</span></footer>
      </div>
    </main>
  </div>;
}

function sectionDescription(tab: Tab) {
  return ({ overview: "Your operations overview.", clips: "Review submissions and confirm eligible views before earnings are recorded.", campaigns: "Create client campaigns and control which campaigns accept submissions.", payouts: "Review payout requests and maintain a clear payment status trail.", clippers: "Browse registered clipper accounts and their recorded platform activity." })[tab];
}
function StatCard({ label, value, icon, tone, foot }: { label: string; value: string; icon: string; tone: string; foot: string }) {
  return <div className={styles.statCard}><div className={styles.statTop}><span>{label}</span><span className={`${styles.statIcon} ${styles[tone]}`}>{icon}</span></div><strong className={styles.statValue}>{value}</strong><span className={styles.statFoot}>{foot}</span></div>;
}
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className={styles.searchBox}><span>⌕</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Search table" /></div>; }
function StatusBadge({ status }: { status: string }) { const cls = status === "approved" || status === "paid" || status === "active" ? styles.badgeGreen : status === "pending" || status === "requested" || status === "approved" ? styles.badgeAmber : status === "rejected" ? styles.badgeRed : status === "inactive" ? styles.badgeGray : styles.badgeBlue; return <span className={`${styles.statusBadge} ${cls}`}><span />{labelize(status)}</span>; }
function ClipTable({ clips, profileById, campaignById, busyId, onReview, compact = false }: { clips: AdminClip[]; profileById: Map<string, AdminProfile>; campaignById: Map<string, AdminCampaign>; busyId: string | null; onReview: (clip: AdminClip, decision: "approve" | "reject") => void; compact?: boolean }) {
  return <div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Clip / Instagram URL</th><th>Clipper</th><th>Campaign</th><th>Submitted</th><th>Views</th><th>Status</th><th>Actions</th></tr></thead><tbody>{clips.map((clip) => <tr key={clip.id}><td><a href={clip.instagram_url} target="_blank" rel="noreferrer" className={styles.clipLink}>Open Reel ↗</a><small className={styles.subCell}>{clip.instagram_url.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").slice(0, 42)}</small><small className={styles.subCell}>{clip.instagram_account_handle ? `Account: @${clip.instagram_account_handle}` : "Older clip · no account linked"}</small></td><td><strong>{profileById.get(clip.user_id)?.display_name || "Unnamed clipper"}</strong></td><td>{campaignById.get(clip.campaign_id)?.name || "Unknown campaign"}</td><td>{shortDate(clip.submitted_at)}</td><td><strong>Reported: {integer(clip.self_reported_views)}</strong><small className={styles.subCell}>Likes: {integer(clip.self_reported_likes)}</small><small className={styles.subCell}>Eligible: {integer(clip.eligible_views)}</small></td><td><StatusBadge status={clip.status} /></td><td><div className={styles.actionGroup}>{clip.status === "pending" ? <><button className={styles.smallAction} disabled={busyId === clip.id} onClick={() => onReview(clip, "approve")}>{busyId === clip.id ? "Saving…" : "Approve"}</button><button className={styles.dangerButton} disabled={busyId === clip.id} onClick={() => onReview(clip, "reject")}>Reject</button></> : <span className={styles.mutedText}>{clip.review_note || "Reviewed"}</span>}</div></td></tr>)}{clips.length === 0 && <tr><td colSpan={7}><EmptyState title="Nothing here yet" text="Submissions matching this filter will appear here." /></td></tr>}</tbody></table>{compact && clips.length > 0 && <div className={styles.tableHint}>Showing the latest {clips.length} submissions.</div>}</div>;
}
function EmptyState({ title, text }: { title: string; text: string }) { return <div className={styles.emptyState}><div>⌁</div><strong>{title}</strong><span>{text}</span></div>; }
