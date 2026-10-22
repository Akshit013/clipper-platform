import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ClaimBonusButton from "./ClaimBonusButton";
import styles from "../clipping-tools.module.css";

export const dynamic = "force-dynamic";
const REWARDS = [
  { milestone: 25, amount: 100, label: "Starter bonus" },
  { milestone: 50, amount: 200, label: "Consistency bonus" },
  { milestone: 100, amount: 500, label: "Elite clipper bonus" },
];
const rupees = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

export default async function BonusesPage() {
  const sessionClient = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) redirect("/login");
  const admin = createAdminClient() as any;
  const [{ count, error: countError }, { data: claims, error: claimsError }] = await Promise.all([
    admin.from("clips").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "approved").eq("is_removed", false),
    admin.from("bonus_claims").select("id,milestone,amount_inr,status,requested_at,processed_at,payment_reference,admin_note").eq("user_id", user.id).order("requested_at", { ascending: false }),
  ]);
  const approvedCount = count ?? 0;
  const claimError = countError?.message || claimsError?.message;
  const claimByMilestone = new Map<number, any>((claims ?? []).map((claim: any): [number, any] => [claim.milestone, claim]));
  const availableToClaim = REWARDS.reduce((sum, item) => sum + (approvedCount >= item.milestone && !claimByMilestone.has(item.milestone) ? item.amount : 0), 0);
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Rewards program</p>
        <h1 className={styles.title}>Clipper bonuses</h1>
        <p className={styles.description}>Earn extra rewards when your clips are approved. Only clips with status Approved count toward these milestones; pending and rejected clips do not count.</p>
        <div className={styles.grid} style={{ marginTop: 22 }}>
          <div className={styles.card}><p className={styles.muted}>Your approved clips</p><div className={styles.amount}>{approvedCount}</div><p className={styles.muted}>Verified by the platform</p></div>
          <div className={styles.card}><p className={styles.muted}>Bonuses available to claim</p><div className={styles.amount}>{rupees(availableToClaim)}</div><p className={styles.muted}>Available milestones not already claimed</p></div>
        </div>
      </section>
      {claimError && <p className={styles.error}>Could not load some bonus data: {claimError}</p>}
      <p className={styles.note}>Each milestone can be claimed once. At 100 approved clips, you can claim all three milestones (₹800 total), if you have not already claimed the lower milestones. Pending claims are not credited. Once an admin approves a claim, its amount is added to your available wallet balance and can be included in a payout request. If an admin marks a bonus as paid directly, it is recorded as paid and is not added to the available wallet again.</p>
      <div className={styles.grid}>
        {REWARDS.map((reward) => {
          const claim = claimByMilestone.get(reward.milestone);
          const reached = approvedCount >= reward.milestone;
          const percent = Math.min(100, Math.floor((approvedCount / reward.milestone) * 100));
          return <article className={styles.card} key={reward.milestone}>
            <span className={styles.badge}>{reward.label}</span>
            <h2 className={styles.cardTitle} style={{ marginTop: 12 }}>{reward.milestone} approved clips</h2>
            <div className={styles.amount}>{rupees(reward.amount)}</div>
            <p className={styles.muted}>{reached ? "Milestone achieved" : `${reward.milestone - approvedCount} more approved clips to unlock`}</p>
            <div className={styles.progressTrack}><div className={styles.progress} style={{ width: `${percent}%` }} /></div>
            <p className={styles.muted}>{approvedCount} / {reward.milestone} approved clips</p>
            {claim ? <>
              <span className={`${styles.status} ${claim.status === "paid" ? styles.statusPaid : claim.status === "rejected" ? styles.statusRejected : styles.statusPending}`}>{claim.status === "paid" ? "Paid" : claim.status === "approved" ? "Approved for payment" : claim.status === "rejected" ? "Rejected — contact admin" : "Pending admin review"}</span>
              {claim.payment_reference && <p className={styles.muted}>Payment reference: {claim.payment_reference}</p>}
              {claim.admin_note && <p className={styles.muted}>Admin note: {claim.admin_note}</p>}
            </> : reached ? <ClaimBonusButton milestone={reward.milestone} amount={reward.amount} /> : <span className={styles.status}>Locked</span>}
          </article>;
        })}
      </div>
      <h2 style={{ fontSize: 22, margin: "30px 0 14px" }}>Your bonus claim history</h2>
      {!claims?.length ? <p className={styles.note}>You have not claimed a bonus yet. Your claim history will appear here.</p> : (
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Milestone</th><th>Bonus</th><th>Requested</th><th>Status</th><th>Payment reference</th></tr></thead><tbody>
          {claims.map((claim: any) => <tr key={claim.id}><td>{claim.milestone} approved clips</td><td>{rupees(claim.amount_inr)}</td><td>{new Date(claim.requested_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</td><td>{claim.status}</td><td>{claim.payment_reference || "—"}</td></tr>)}
        </tbody></table></div>
      )}
    </main>
  );
}
