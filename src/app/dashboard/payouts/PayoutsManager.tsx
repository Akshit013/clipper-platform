"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/currency";
import styles from "./payouts.module.css";
import WalletInsights from "./WalletInsights";

type Earning = { id: string; clip_id: string; campaign_id: string; eligible_views: number | string; rate_per_1000: number | string; amount: number | string; calculated_at: string };
type Payout = { id: string; amount: number | string; status: "pending" | "approved" | "paid" | "rejected"; upi_id: string | null; payment_reference: string | null; requested_at: string; processed_at: string | null };
type BonusClaim = { id: string; milestone: number; amount_inr: number | string; status: "pending" | "approved" | "paid" | "rejected"; requested_at: string; processed_at: string | null; payment_reference: string | null; admin_note: string | null };
type Data = { earnings: Earning[]; payouts: Payout[]; bonusClaims: BonusClaim[]; summary: { totalEarned: number; totalPaid: number; reserved: number; available: number } };
type Activity = { key: string; date: string; type: "earning" | "bonus" | "payout"; label: string; amount: number; status: string; note: string };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(status: Payout["status"]) {
  return ({ pending: "Pending review", approved: "Approved · awaiting transfer", paid: "Paid", rejected: "Rejected · balance released" })[status];
}

export default function PayoutsManager() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [upiId, setUpiId] = useState("");

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/payouts", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load payment history.");
      setData(body as Data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load payment history.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activity = useMemo<Activity[]>(() => {
    if (!data) return [];
    const earnings: Activity[] = data.earnings.map((row) => ({
      key: `earning-${row.id}`,
      date: row.calculated_at,
      type: "earning",
      label: "Approved clip earning",
      amount: Number(row.amount || 0),
      status: "Recorded",
      note: `${Number(row.eligible_views || 0).toLocaleString("en-IN")} eligible views · ₹${Number(row.rate_per_1000 || 0).toLocaleString("en-IN")} per 1,000 · clip ${row.clip_id.slice(0, 8)}…`,
    }));
    const payouts: Activity[] = data.payouts.map((row) => ({
      key: `payout-${row.id}`,
      date: row.requested_at,
      type: "payout",
      label: "Payout request",
      amount: Number(row.amount || 0),
      status: statusLabel(row.status),
      note: `UPI: ${row.upi_id || "not recorded"}${row.payment_reference ? ` · Ref: ${row.payment_reference}` : ""}`,
    }));
    const bonuses: Activity[] = data.bonusClaims.map((row) => ({
      key: `bonus-${row.id}`,
      date: row.requested_at,
      type: "bonus",
      label: `${row.milestone}-clip milestone bonus`,
      amount: Number(row.amount_inr || 0),
      status: row.status === "approved" ? "Added to wallet" : row.status === "paid" ? "Paid directly by admin" : row.status === "pending" ? "Pending admin approval — not credited" : "Rejected — not credited",
      note: row.status === "approved" ? "Credited to available wallet; can be requested as a payout" : row.status === "paid" ? `Direct payment recorded${row.payment_reference ? ` · Ref: ${row.payment_reference}` : ""}` : row.admin_note || "Bonus claim status",
    }));
    return [...earnings, ...bonuses, ...payouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), upiId: upiId.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Payout request failed.");
      setAmount("");
      setNotice({ kind: "success", text: "Payout request submitted. The amount is now reserved while the request is reviewed." });
      await refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Payout request failed." });
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <div className={styles.topline}><Link href="/dashboard" className={styles.backLink}>← Back to dashboard</Link><span className={styles.eyebrow}>Wallet & payments</span></div>
    <header className={styles.header}><h1 className={styles.title}>Your earnings & payments</h1><p className={styles.subtitle}>Your available balance includes approved bonus credits. Pending and rejected bonuses are not spendable; bonuses marked paid directly by admin have already been transferred.</p></header>

    {loadError && <div className={styles.error} role="alert">{loadError}<button onClick={() => void refresh()} className={styles.textButton}>Retry</button></div>}
    {notice && <div className={notice.kind === "error" ? styles.error : styles.success} role="status">{notice.text}</div>}

    <section className={styles.summaryGrid} aria-label="Payment totals">
      <article className={styles.summaryCard}><span>Total earnings</span><strong>{formatINR(data?.summary.totalEarned ?? 0)}</strong><small>Clip earnings plus approved and directly paid bonuses</small></article>
      <article className={styles.summaryCard}><span>Paid out</span><strong>{formatINR(data?.summary.totalPaid ?? 0)}</strong><small>Requests marked as paid by an admin</small></article>
      <article className={styles.summaryCard}><span>Pending / approved</span><strong>{formatINR(data?.summary.reserved ?? 0)}</strong><small>Reserved while awaiting final outcome</small></article>
      <article className={styles.summaryCard + " " + styles.highlight}><span>Available balance</span><strong>{formatINR(data?.summary.available ?? 0)}</strong><small>Maximum currently available to request</small></article>
    </section>

    <WalletInsights />

    <div className={styles.contentGrid}>
      <section className={styles.panel}>
        <h2>Request a payout</h2>
        <p>Enter the amount and UPI ID where you want the transfer sent. The request stores this UPI ID so the admin can see it for this payment.</p>
        <form className={styles.form} onSubmit={submit}>
          <label>Amount (INR)<input type="number" min="1" step="0.01" max={data?.summary.available ?? 0} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" /></label>
          <label>UPI ID<input type="text" required maxLength={150} value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="yourname@bank" autoComplete="off" /></label>
          <small className={styles.muted}>Example format: name@bank. Double-check the ID before submitting.</small>
          <button className={styles.primaryButton} disabled={busy || !data || Number(amount) <= 0 || Number(amount) > data.summary.available}>{busy ? "Submitting request…" : "Request payout"}</button>
        </form>
        <p className={styles.notice}>This app records the request only; it does not send money automatically. An admin must make the real UPI transfer and then mark the request paid with the transaction reference.</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><h2>Payout history</h2><span className={styles.count}>{data?.payouts.length ?? 0} requests</span></div>
        {!data?.payouts.length ? <div className={styles.empty}>No payout requests yet. Your requests will appear here after you submit one.</div> : <div className={styles.tableWrap}><table><thead><tr><th>Requested</th><th>Amount</th><th>UPI ID</th><th>Status</th><th>Payment reference</th></tr></thead><tbody>{data.payouts.map((row) => <tr key={row.id}><td>{formatDate(row.requested_at)}</td><td>{formatINR(row.amount)}</td><td>{row.upi_id || "—"}</td><td><span className={styles.status}>{statusLabel(row.status)}</span></td><td>{row.payment_reference || "—"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>

    <section className={styles.panel + " " + styles.ledgerPanel}>
      <div className={styles.panelHeader}><div><h2>Complete activity history</h2><p>Clip earnings and payout requests, combined and sorted by date.</p></div><span className={styles.count}>{activity.length} entries</span></div>
      {!activity.length ? <div className={styles.empty}>No payments or earnings recorded yet. Approved clips will add earning entries here.</div> : <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Activity</th><th>Details</th><th>Status</th><th>Amount</th></tr></thead><tbody>{activity.map((row) => <tr key={row.key}><td>{formatDate(row.date)}</td><td><span className={row.type === "earning" ? styles.earningTag : row.type === "bonus" ? styles.earningTag : styles.payoutTag}>{row.type === "earning" ? "Earning" : row.type === "bonus" ? "Bonus" : "Payout"}</span><strong className={styles.activityTitle}>{row.label}</strong></td><td>{row.note}</td><td>{row.status}</td><td className={(row.type === "earning" || (row.type === "bonus" && row.status === "Added to wallet")) ? styles.positiveAmount : styles.normalAmount}>{(row.type === "earning" || (row.type === "bonus" && row.status === "Added to wallet")) ? "+" : ""}{formatINR(row.amount)}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
