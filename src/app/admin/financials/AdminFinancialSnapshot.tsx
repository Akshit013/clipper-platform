"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./financials.module.css";

type Summary = Record<string, string | number | null>;
const money = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export default function AdminFinancialSnapshot() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/admin/financial-transactions?summaryOnly=1", { cache: "no-store" }).then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "Could not load financial summary"); if (active) setSummary(body.summary ?? {}); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load financial summary"); }); return () => { active = false; }; }, []);
  return <section className={styles.snapshot} aria-label="Financial transaction snapshot">
    <div className={styles.snapshotHeader}><div><p className={styles.eyebrow}>FINANCE · LEDGER</p><h2>Financial transaction snapshot</h2><p className={styles.muted}>Includes wallet credits, bonus credits and payout movements recorded in the ledger.</p></div><Link className={styles.primaryLink} href="/admin/financials">Open full payment ledger →</Link></div>
    {error ? <p className={styles.error}>{error}</p> : !summary ? <p className={styles.muted}>Loading financial totals…</p> : <div className={styles.summaryGrid}>
      <div className={styles.summaryCard}><span>Net clip earnings</span><strong>{money(summary.net_clip_earnings)}</strong></div>
      <div className={styles.summaryCard}><span>Bonuses credited to wallets (net)</span><strong>{money(summary.net_bonus_wallet_credits)}</strong></div>
      <div className={styles.summaryCard}><span>Bonuses paid directly by admin</span><strong>{money(summary.bonuses_paid_direct)}</strong></div>
      <div className={styles.summaryCard}><span>Prize race rewards (net)</span><strong>{money(summary.net_contest_prizes)}</strong></div>
      <div className={styles.summaryCard}><span>Recorded payout payments</span><strong>{money(summary.recorded_payout_payments)}</strong></div>
      <div className={styles.summaryCard}><span>Net wallet liability (ledger)</span><strong>{money(summary.net_wallet_liability)}</strong></div>
      <div className={styles.summaryCard}><span>Ledger entries</span><strong>{Number(summary.transaction_count ?? 0).toLocaleString("en-IN")}</strong></div>
    </div>}
  </section>;
}
