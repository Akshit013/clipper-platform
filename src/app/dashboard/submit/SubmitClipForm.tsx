"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import styles from "../portal.module.css";
import { formatINR } from "@/lib/currency";

type Campaign = { id: string; name: string; description: string | null; rate_per_1000: number | string; start_date: string; end_date: string };
type InstagramAccount = { id: string; handle: string; display_name: string | null };

export default function SubmitClipForm({ campaigns, accounts }: { campaigns: Campaign[]; accounts: InstagramAccount[] }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [currentViews, setCurrentViews] = useState("");
  const [currentLikes, setCurrentLikes] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, instagramAccountId: accountId, instagramUrl, selfReportedViews: Number(currentViews), selfReportedLikes: Number(currentLikes) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Submission failed (${response.status})`);
      setInstagramUrl("");
      setCurrentViews("");
      setCurrentLikes("");
      setNotice({ kind: "success", text: "Reel submitted successfully. It will appear in your clip history while it awaits review." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not submit this Reel." });
    } finally { setBusy(false); }
  }

  return <>
    {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.noticeError : styles.noticeSuccess}`} role="status">{notice.text}</div>}
    {accounts.length === 0 ? <section className={styles.panel}>
      <h2>Add an Instagram account first</h2>
      <p>To keep clips organized, add the Instagram page that published the Reel before submitting it.</p>
      <Link className={styles.primaryButton} href="/dashboard/accounts">Manage Instagram accounts →</Link>
    </section> : campaigns.length === 0 ? <section className={styles.panel}>
      <h2>No active campaigns right now</h2>
      <p>Check again later or contact the campaign administrator. You can still manage your Instagram accounts.</p>
      <Link className={styles.secondaryButton} href="/dashboard/accounts">Manage Instagram accounts</Link>
    </section> : <div className={styles.grid}>
      <section className={styles.panel}>
        <h2>Submit a public Reel</h2>
        <p>Choose the account that published the Reel, then paste its public Instagram URL.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>Instagram account
            <select className={styles.select} value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
              {accounts.map((account) => <option value={account.id} key={account.id}>@{account.handle}{account.display_name ? ` — ${account.display_name}` : ""}</option>)}
            </select>
          </label>
          <label className={styles.label}>Campaign
            <select className={styles.select} value={campaignId} onChange={(event) => setCampaignId(event.target.value)} required>
              {campaigns.map((campaign) => <option value={campaign.id} key={campaign.id}>{campaign.name} — {formatINR(campaign.rate_per_1000)} per 1,000 eligible views</option>)}
            </select>
          </label>
          <label className={styles.label}>Public Instagram Reel URL
            <input className={styles.input} type="url" required maxLength={500} value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://www.instagram.com/reel/…" />
          </label>
          <div className={styles.metricEntry} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, padding: 16, border: "1px solid rgba(110,140,180,.28)", borderRadius: 14, background: "rgba(110,140,180,.06)" }}>
            <div style={{ gridColumn: "1 / -1" }}><strong>Current Reel performance <span aria-hidden="true" style={{ color: "#f87171" }}>*</span></strong><p className={styles.warning} style={{ margin: "4px 0 0" }}>Enter the counts currently shown on Instagram. These are self-reported and are not automatically verified for payment.</p></div>
            <label className={styles.label}>Current views
              <input className={styles.input} type="number" inputMode="numeric" min="0" max="1000000000" step="1" required value={currentViews} onChange={(event) => setCurrentViews(event.target.value)} placeholder="e.g. 12500" />
            </label>
            <label className={styles.label}>Current likes
              <input className={styles.input} type="number" inputMode="numeric" min="0" max="1000000000" step="1" required value={currentLikes} onChange={(event) => setCurrentLikes(event.target.value)} placeholder="e.g. 850" />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={busy || !accountId || !campaignId || currentViews.trim() === "" || currentLikes.trim() === "" || !Number.isSafeInteger(Number(currentViews)) || !Number.isSafeInteger(Number(currentLikes)) || Number(currentViews) < 0 || Number(currentLikes) < 0 || Number(currentViews) > 1000000000 || Number(currentLikes) > 1000000000}>{busy ? "Submitting…" : "Submit Reel for review"}</button>
        </form>
        <div className={styles.warning} style={{ marginTop: 18 }}>Submitting a URL doesn't guarantee automatic view tracking. Eligible views and earnings are finalized after review using data the platform can legitimately verify.</div>
      </section>
      <section className={styles.panel}>
        <h2>Active Instagram accounts</h2>
        <p>You have {accounts.length} account{accounts.length === 1 ? "" : "s"} available for submissions.</p>
        <div className={styles.accountList}>{accounts.map((account) => <div className={styles.accountCard} key={account.id}>
          <div className={styles.avatar}>@</div><div className={styles.accountInfo}><strong>@{account.handle}</strong>{account.display_name && <small>{account.display_name}</small>}</div>
        </div>)}</div>
        <div className={styles.inlineLinks}><Link className={styles.secondaryButton} href="/dashboard/accounts">Add or manage accounts →</Link><Link className={styles.secondaryButton} href="/dashboard">Back to dashboard</Link></div>
      </section>
    </div>}
  </>;
}
