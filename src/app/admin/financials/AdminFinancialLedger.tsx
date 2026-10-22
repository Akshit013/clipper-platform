"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./financials.module.css";
type Tx = { id:string; user_id:string; event_type:string; amount_inr:number|string; balance_delta:number|string; currency?:string; source_table?:string|null; source_id?:string|null; description:string; created_at:string; metadata?:Record<string,unknown>|null; clipper_name?:string|null };
type Summary = Record<string, string|number|null>;
const money=(v:unknown)=>`₹${Number(v??0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const types=["clip_earning","earning_adjustment","bonus_credit","bonus_reversal","bonus_paid_direct","payout_reserved","payout_paid","payout_reversal","manual_adjustment","contest_prize"];
function ist(s:string){try{return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"medium",timeZone:"Asia/Kolkata"}).format(new Date(s));}catch{return s;}}
export default function AdminFinancialLedger(){
 const [rows,setRows]=useState<Tx[]>([]);const [summary,setSummary]=useState<Summary|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [page,setPage]=useState(1);const [count,setCount]=useState(0);const [type,setType]=useState("");const [direction,setDirection]=useState("");const [userId,setUserId]=useState("");const [from,setFrom]=useState("");const [to,setTo]=useState("");const [q,setQ]=useState("");const pageSize=50;
 const params=useMemo(()=>{const p=new URLSearchParams({page:String(page),pageSize:String(pageSize)});if(type)p.set("type",type);if(direction)p.set("direction",direction);if(userId.trim())p.set("userId",userId.trim());if(from)p.set("from",from);if(to)p.set("to",to);return p;},[page,type,direction,userId,from,to]);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch(`/api/admin/financial-transactions?${params}`,{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error||"Could not load transactions");setRows(b.rows||[]);setCount(b.count||0);setSummary(b.summary||{});}catch(e){setError(e instanceof Error?e.message:"Could not load transactions");}finally{setLoading(false);}},[params]);
 useEffect(()=>{void load();},[load]);
 const filtered=useMemo(()=>{const needle=q.trim().toLowerCase();if(!needle)return rows;return rows.filter(r=>[r.clipper_name,r.user_id,r.description,r.event_type,r.source_id,r.id].some(v=>String(v??"").toLowerCase().includes(needle)));},[rows,q]);
 const exportUrl=(format:"csv"|"pdf")=>{const p=new URLSearchParams({format});if(type)p.set("type",type);if(direction)p.set("direction",direction);if(userId.trim())p.set("userId",userId.trim());if(from)p.set("from",from);if(to)p.set("to",to);if(q.trim())p.set("q",q.trim());return `/api/admin/financial-transactions?${p}`;};
 const maxPage=Math.max(1,Math.ceil(count/pageSize));
 return <main className={styles.page}>
  <div className={styles.snapshotHeader}><div><p className={styles.eyebrow}>ADMIN · FINANCE</p><h1>Financial transactions</h1><p className={styles.muted}>Every recorded wallet credit/debit with the timestamp and linked source. All times below are shown in IST.</p></div><a className={styles.button} href="/admin">← Admin overview</a></div>
  {summary&&<div className={styles.summaryGrid}>
    <div className={styles.summaryCard}><span>Net clip earnings</span><strong>{money(summary.net_clip_earnings)}</strong></div>
    <div className={styles.summaryCard}><span>Bonuses credited to wallets (net)</span><strong>{money(summary.net_bonus_wallet_credits)}</strong></div>
    <div className={styles.summaryCard}><span>Bonuses paid directly by admin</span><strong>{money(summary.bonuses_paid_direct)}</strong></div>
    <div className={styles.summaryCard}><span>Prize race rewards (net)</span><strong>{money(summary.net_contest_prizes)}</strong></div>
    <div className={styles.summaryCard}><span>Recorded payout payments</span><strong>{money(summary.recorded_payout_payments)}</strong></div>
    <div className={styles.summaryCard}><span>Net wallet liability (ledger)</span><strong>{money(summary.net_wallet_liability)}</strong></div>
    <div className={styles.summaryCard}><span>Total ledger records</span><strong>{Number(summary.transaction_count??0).toLocaleString("en-IN")}</strong></div>
  </div>}
  <div className={styles.toolbar}>
    <input className={`${styles.input} ${styles.search}`} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search this page: clipper, user ID, description, reference" aria-label="Search visible transactions" />
    <select className={styles.select} value={type} onChange={e=>{setPage(1);setType(e.target.value)}} aria-label="Transaction type"><option value="">All types</option>{types.map(t=><option key={t} value={t}>{t.replaceAll("_"," ")}</option>)}</select>
    <select className={styles.select} value={direction} onChange={e=>{setPage(1);setDirection(e.target.value)}} aria-label="Direction"><option value="">Credit and debit</option><option value="credit">Credits</option><option value="debit">Debits</option><option value="neutral">No wallet impact</option></select>
    <input className={styles.input} value={userId} onChange={e=>{setPage(1);setUserId(e.target.value)}} placeholder="Filter user UUID" aria-label="Filter by user ID" />
    <input className={styles.input} type="date" value={from} onChange={e=>{setPage(1);setFrom(e.target.value)}} aria-label="From date" />
    <input className={styles.input} type="date" value={to} onChange={e=>{setPage(1);setTo(e.target.value)}} aria-label="To date" />
    <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={()=>void load()} disabled={loading}>{loading?"Loading…":"Refresh"}</button>
    <a className={styles.button} href={exportUrl("csv")}>Export CSV / Excel</a><a className={styles.button} href={exportUrl("pdf")}>Export PDF</a>
  </div>
  {error&&<p className={styles.error}>{error}</p>}
  <p className={styles.muted}>{count.toLocaleString("en-IN")} transaction(s) matching database filters. Text search filters the current page only. CSV/PDF export includes the full database-filtered result, with text search applied during export.</p>
  <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Timestamp (IST)</th><th>Clipper</th><th>Type</th><th>Amount</th><th>Wallet impact</th><th>Details / source</th><th>Transaction ID</th></tr></thead><tbody>
   {filtered.map(r=><tr key={r.id}><td>{ist(r.created_at)}<span className={styles.sub}>{r.created_at}</span></td><td><span className={styles.name}>{r.clipper_name||"Unknown clipper"}</span><span className={styles.sub}>{r.user_id}</span></td><td><span className={styles.status}>{r.event_type.replaceAll("_"," ")}</span></td><td>{money(r.amount_inr)}</td><td className={Number(r.balance_delta)>0?styles.credit:Number(r.balance_delta)<0?styles.debit:styles.neutral}>{Number(r.balance_delta)>0?"+":""}{money(r.balance_delta)}</td><td className={styles.detail}>{r.description}<span className={styles.sub}>{r.source_table||"source unavailable"}{r.source_id?` · ${r.source_id}`:""}</span></td><td>{r.id}</td></tr>)}
   {!loading&&!filtered.length&&<tr><td colSpan={7}>No transactions found for these filters.</td></tr>}
  </tbody></table></div>
  <div className={styles.footer}><span>Showing page {page} of {maxPage} · 50 rows per page</span><div className={styles.toolbar}><button className={styles.button} disabled={page<=1||loading} onClick={()=>setPage(v=>Math.max(1,v-1))}>Previous</button><button className={styles.button} disabled={page>=maxPage||loading} onClick={()=>setPage(v=>Math.min(maxPage,v+1))}>Next</button></div></div>
  <p className={styles.note}>This ledger reports recorded wallet events; it does not itself transfer funds. Review the underlying source record and payment reference before reconciling a transaction. The net wallet liability is derived from ledger balance deltas and should be reconciled with the payout balance calculation before accounting decisions.</p>
 </main>;
}
