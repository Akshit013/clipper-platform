"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/currency";
import styles from "./wallet-insights.module.css";

type WalletTransaction = {
  id: string;
  event_type: string;
  amount_inr: number | string;
  balance_delta: number | string;
  currency?: string;
  source_table: string | null;
  source_id: string | null;
  description: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};
type BonusClaim = {
  id: string;
  milestone: number;
  amount_inr: number | string;
  status: "pending" | "approved" | "paid" | "rejected";
  requested_at: string;
  processed_at: string | null;
  payment_reference: string | null;
  admin_note: string | null;
};
type WalletResponse = {
  walletTransactions: WalletTransaction[];
  walletTransactionCount: number;
  walletTransactionPage: number;
  walletTransactionPageSize: number;
  approvedClipCount: number;
  bonusClaims: BonusClaim[];
  summary: { totalEarned: number; totalPaid: number; reserved: number; available: number };
};
type Filter = "all" | "credits" | "debits" | "bonus" | "payout" | "adjustments";

const MILESTONES = [
  { clips: 25, reward: 100 },
  { clips: 50, reward: 200 },
  { clips: 100, reward: 500 },
] as const;

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(date) + " IST";
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    clip_earning: "Clip earning",
    earning_adjustment: "Earning adjustment",
    bonus_credit: "Bonus credited to wallet",
    bonus_reversal: "Bonus credit reversed",
    bonus_paid_direct: "Bonus paid directly by admin",
    payout_reserved: "Payout request · funds reserved",
    payout_paid: "Payout marked paid",
    payout_reversal: "Payout rejected · funds released",
    manual_adjustment: "Wallet adjustment",
    contest_prize: "Prize race reward",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

function eventGroup(eventType: string): Exclude<Filter, "all"> | "other" {
  if (eventType.startsWith("bonus_") || eventType === "contest_prize") return "bonus";
  if (eventType.startsWith("payout_")) return "payout";
  if (eventType.includes("adjustment")) return "adjustments";
  return "other";
}

function escapeCsv(value: unknown) {
  const raw = value == null ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

export default function WalletInsights() {
  const [data, setData] = useState<WalletResponse | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [downloading, setDownloading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payouts?transactionsPage=0", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load wallet history.");
      const parsed = body as WalletResponse;
      setData(parsed);
      setTransactions(parsed.walletTransactions ?? []);
      setPage(parsed.walletTransactionPage ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load wallet history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filteredTransactions = useMemo(() => {
    const term = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00+05:30`).getTime() : Number.NEGATIVE_INFINITY;
    const to = toDate ? new Date(`${toDate}T23:59:59.999+05:30`).getTime() : Number.POSITIVE_INFINITY;
    return transactions.filter((row) => {
      const timestamp = new Date(row.created_at).getTime();
      const delta = Number(row.balance_delta || 0);
      const group = eventGroup(row.event_type);
      const matchesFilter = filter === "all" ||
        (filter === "credits" && delta > 0) ||
        (filter === "debits" && delta < 0) ||
        (filter === "adjustments" && group === "adjustments") ||
        (filter === "bonus" && group === "bonus") ||
        (filter === "payout" && group === "payout");
      const searchable = `${row.description} ${eventLabel(row.event_type)} ${row.source_table ?? ""} ${row.source_id ?? ""}`.toLowerCase();
      return matchesFilter && searchable.includes(term) && timestamp >= from && timestamp <= to;
    });
  }, [transactions, query, filter, fromDate, toDate]);

  const latestCredit = useMemo(() => transactions.find((row) => Number(row.balance_delta || 0) > 0) ?? null, [transactions]);
  const totalCreditsLoaded = useMemo(() => transactions.reduce((n, t) => n + Math.max(0, Number(t.balance_delta || 0)), 0), [transactions]);
  const totalDebitsLoaded = useMemo(() => transactions.reduce((n, t) => n + Math.max(0, -Number(t.balance_delta || 0)), 0), [transactions]);

  async function loadMore() {
    if (!data || transactions.length >= data.walletTransactionCount || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetch(`/api/payouts?transactionsPage=${nextPage}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load older wallet entries.");
      const parsed = body as WalletResponse;
      setTransactions((current) => {
        const known = new Set(current.map((row) => row.id));
        return [...current, ...(parsed.walletTransactions ?? []).filter((row) => !known.has(row.id))];
      });
      setPage(parsed.walletTransactionPage ?? nextPage);
      setData((current) => current ? { ...current, walletTransactionCount: parsed.walletTransactionCount ?? current.walletTransactionCount } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load older wallet entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  function exportCsv() {
    if (!filteredTransactions.length || downloading) return;
    setDownloading(true);
    const columns = ["Timestamp (IST)", "Event", "Description", "Amount (INR)", "Wallet impact (INR)", "Source table", "Source ID", "Transaction ID"];
    const rows = filteredTransactions.map((row) => [
      formatTimestamp(row.created_at), eventLabel(row.event_type), row.description,
      Number(row.amount_inr || 0).toFixed(2), Number(row.balance_delta || 0).toFixed(2),
      row.source_table ?? "", row.source_id ?? "", row.id,
    ]);
    const csv = "\uFEFF" + [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `clipper-wallet-history-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  const claimsByMilestone = new Map<number, BonusClaim>((data?.bonusClaims ?? []).map((claim): [number, BonusClaim] => [Number(claim.milestone), claim]));

  return <section className={styles.wrap} aria-label="Wallet activity and progress">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Your account at a glance</span><h2>Wallet activity & clipper tools</h2><p>See when wallet entries were recorded, track bonus milestones, and jump to the tools you use most.</p></div>
      <button type="button" className={styles.ghostButton} onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh history"}</button>
    </header>

    {error && <div className={styles.error} role="alert">{error}</div>}

    <div className={styles.stats}>
      <article className={styles.stat}><span>Approved clips</span><strong>{loading && !data ? "—" : (data?.approvedClipCount ?? 0).toLocaleString("en-IN")}</strong><small>Clips approved by the admin</small></article>
      <article className={styles.stat}><span>Wallet credits loaded</span><strong>{formatINR(totalCreditsLoaded)}</strong><small>Credits visible in the loaded history</small></article>
      <article className={styles.stat}><span>Wallet debits / reservations loaded</span><strong>{formatINR(totalDebitsLoaded)}</strong><small>Funds reserved for payouts or later reversed</small></article>
      <article className={styles.stat + " " + styles.statHighlight}><span>Latest wallet credit</span><strong>{latestCredit ? formatINR(latestCredit.balance_delta) : "—"}</strong><small>{latestCredit ? formatTimestamp(latestCredit.created_at) : "No wallet credit recorded yet"}</small></article>
    </div>

    <div className={styles.columns}>
      <section className={styles.panel}>
        <div className={styles.panelTitle}><div><h3>Bonus milestone progress</h3><p>Progress uses approved clips only. A bonus becomes wallet money when the admin approves the claim.</p></div><Link href="/dashboard/bonuses">Open bonuses ↗</Link></div>
        <div className={styles.milestones}>
          {MILESTONES.map((milestone) => {
            const claim = claimsByMilestone.get(milestone.clips);
            const approved = data?.approvedClipCount ?? 0;
            const percent = Math.min(100, Math.round(approved / milestone.clips * 100));
            let label = `${Math.max(0, milestone.clips - approved)} approved clips to go`;
            if (claim?.status === "approved") label = "Approved · added to wallet";
            else if (claim?.status === "pending") label = "Claim pending review";
            else if (claim?.status === "paid") label = "Paid directly by admin";
            else if (claim?.status === "rejected") label = "Claim rejected · contact admin";
            else if (approved >= milestone.clips) label = "Eligible · claim bonus";
            return <article className={styles.milestone} key={milestone.clips}>
              <div className={styles.milestoneTop}><strong>{milestone.clips} approved clips</strong><b>{formatINR(milestone.reward)}</b></div>
              <div className={styles.track} aria-label={`${percent}% of ${milestone.clips} clips`}><span style={{ width: `${percent}%` }} /></div>
              <div className={styles.milestoneBottom}><span>{label}</span><span>{Math.min(approved, milestone.clips)}/{milestone.clips}</span></div>
            </article>;
          })}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}><div><h3>Quick actions</h3><p>Common tasks are one click away.</p></div></div>
        <div className={styles.quickLinks}>
          <Link href="/dashboard/submit"><span>＋</span><div><strong>Submit a clip</strong><small>Add a Reel to a campaign</small></div><b>↗</b></Link>
          <Link href="/dashboard/streamers"><span>◎</span><div><strong>Approved streamers</strong><small>Browse streamer channels</small></div><b>↗</b></Link>
          <Link href="/dashboard/samples"><span>▶</span><div><strong>Sample clips</strong><small>Find available footage</small></div><b>↗</b></Link>
          <Link href="/dashboard/bonuses"><span>★</span><div><strong>Bonus centre</strong><small>Check and claim milestones</small></div><b>↗</b></Link>
        </div>
      </section>
    </div>

    <section className={styles.panel + " " + styles.historyPanel}>
      <div className={styles.panelTitle}><div><h3>Timestamped wallet transaction history</h3><p>Each row shows the recorded time, amount, and actual change to the spendable wallet. Times are displayed in India Standard Time (IST).</p></div><span className={styles.count}>{filteredTransactions.length} shown · {transactions.length} loaded / {data?.walletTransactionCount ?? 0} total</span></div>
      <div className={styles.filters}>
        <label className={styles.search}>Search<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Description, source, transaction ID…" /></label>
        <label>Type<select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}><option value="all">All entries</option><option value="credits">Credits into wallet</option><option value="debits">Debits from wallet</option><option value="bonus">Bonus events</option><option value="payout">Payouts</option><option value="adjustments">Adjustments</option></select></label>
        <label>From<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
        <label>To<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
        <button type="button" className={styles.ghostButton} onClick={exportCsv} disabled={!filteredTransactions.length || downloading}>{downloading ? "Preparing…" : "Export CSV"}</button>
      </div>
      {loading && !data ? <div className={styles.empty}>Loading wallet history…</div> : !filteredTransactions.length ? <div className={styles.empty}>{transactions.length ? "No entries match these filters." : "No wallet transactions have been recorded yet. New clip earnings and approved bonus credits will appear here."}</div> : <div className={styles.tableWrap}><table><thead><tr><th>Recorded timestamp</th><th>Transaction</th><th>Amount</th><th>Wallet impact</th><th>Source</th><th>Transaction ID</th></tr></thead><tbody>{filteredTransactions.map((row) => {
        const delta = Number(row.balance_delta || 0);
        const directPaid = row.event_type === "bonus_paid_direct";
        const reserved = row.event_type === "payout_reserved";
        const released = row.event_type === "payout_reversal" || row.event_type === "bonus_reversal";
        return <tr key={row.id}>
          <td className={styles.timestamp}>{formatTimestamp(row.created_at)}</td>
          <td><strong className={styles.transactionLabel}>{eventLabel(row.event_type)}</strong><span className={styles.description}>{row.description}</span></td>
          <td>{formatINR(row.amount_inr)}</td>
          <td className={delta > 0 ? styles.positive : delta < 0 ? styles.negative : styles.neutral}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatINR(Math.abs(delta))}<small>{directPaid ? "not credited to wallet" : reserved ? "reserved for payout" : released && delta > 0 ? "released / reversed to wallet" : delta > 0 ? "added to wallet" : delta < 0 ? "removed from wallet" : "no balance change"}</small></td>
          <td>{row.source_table ?? "—"}</td>
          <td><code title={row.id}>{row.id.slice(0, 8)}…</code></td>
        </tr>;
      })}</tbody></table></div>}
      {data && transactions.length < data.walletTransactionCount && <div className={styles.moreRow}><button type="button" className={styles.primaryButton} onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading older entries…" : `Load older transactions (${transactions.length} of ${data.walletTransactionCount})`}</button></div>}
      <p className={styles.footnote}>Historical entries are backfilled where source records exist. For records created before this ledger was enabled, the timestamp uses the best available source timestamp; future wallet events receive an exact database event timestamp. Payout requests reserve funds before transfer; marking them paid does not deduct the same amount a second time. Export CSV includes currently loaded and filtered rows, so load older transactions first for a full export. This ledger records activity; it does not transfer money automatically.</p>
    </section>
  </section>;
}
