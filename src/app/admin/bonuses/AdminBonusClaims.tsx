"use client";

import { useEffect, useState } from "react";
import styles from "../../dashboard/clipping-tools.module.css";

type Claim = { id: string; user_id: string; clipper_name: string; milestone: number; amount_inr: number; approved_clip_count_at_claim: number; status: string; requested_at: string; payment_reference: string | null; admin_note: string | null };
const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function AdminBonusClaims({ initialClaims }: { initialClaims: Claim[] }) {
  const [claims, setClaims] = useState(initialClaims);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  async function act(claim: Claim, action: "approve" | "mark_paid" | "reject") {
    let paymentReference = "";
    let adminNote: string | null = null;
    if (action === "mark_paid") {
      const input = window.prompt("Enter the UPI/bank transaction reference (only after you have sent the payment):");
      if (!input?.trim()) return;
      paymentReference = input.trim();
    }
    if (action === "reject") {
      adminNote = window.prompt("Reason for rejection (optional):")?.trim() || null;
    }
    setBusyId(claim.id); setMessage("");
    try {
      const response = await fetch(`/api/admin/bonuses/${claim.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, paymentReference, adminNote }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(body.error || "Action failed."); return; }
      setClaims((current) => current.map((item) => item.id === claim.id ? { ...item, ...body.claim } : item));
      setMessage(`Updated ${claim.clipper_name}'s ${claim.milestone}-clip bonus claim.`);
    } catch { setMessage("Network error. Try again."); }
    finally { setBusyId(null); }
  }
  return <>
    {message && <p className={styles.note} role="status">{message}</p>}
    {claims.length === 0 ? <p className={styles.note}>There are no bonus claims yet.</p> : (
      <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Clipper</th><th>Milestone</th><th>Bonus</th><th>Approved clips at claim</th><th>Requested</th><th>Status</th><th>Reference / notes</th><th>Actions</th></tr></thead><tbody>
        {claims.map((claim) => <tr key={claim.id}>
          <td>{claim.clipper_name}<br /><span className={styles.muted}>{claim.user_id.slice(0, 8)}…</span></td>
          <td>{claim.milestone} clips</td><td>{money(claim.amount_inr)}</td><td>{claim.approved_clip_count_at_claim}</td>
          <td>{new Date(claim.requested_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td><td>{claim.status}</td>
          <td>{claim.payment_reference || "—"}{claim.admin_note ? <><br /><span className={styles.muted}>{claim.admin_note}</span></> : null}</td>
          <td><div className={styles.actions}>
            {claim.status === "pending" && <button disabled={busyId === claim.id} className={styles.secondary} onClick={() => act(claim, "approve")}>Approve</button>}
            {(claim.status === "pending" || claim.status === "approved") && <button disabled={busyId === claim.id} className={styles.primary} onClick={() => act(claim, "mark_paid")}>Mark paid</button>}
            {(claim.status === "pending" || claim.status === "approved") && <button disabled={busyId === claim.id} className={styles.secondary} onClick={() => act(claim, "reject")}>Reject</button>}
          </div></td>
        </tr>)}
      </tbody></table></div>
    )}
  </>;
}
