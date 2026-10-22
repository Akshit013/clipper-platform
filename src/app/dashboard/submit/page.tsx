import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import SubmitClipForm from "./SubmitClipForm";
import styles from "../portal.module.css";

export const dynamic = "force-dynamic";

export default async function SubmitClipPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  const today = new Date().toISOString().slice(0, 10);
  const [campaignsResult, accountsResult] = await Promise.all([
    supabase.from("campaigns").select("id,name,description,rate_per_1000,start_date,end_date")
      .eq("is_active", true).lte("start_date", today).gte("end_date", today).order("created_at", { ascending: false }),
    supabase.from("instagram_accounts").select("id,handle,display_name")
      .eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }),
  ]);
  return <main className={styles.page}>
    <div className={styles.topline}><Link className={styles.backLink} href="/dashboard">← Dashboard</Link><span style={{ color: "#526782" }}>/</span><span style={{ color: "#d5e0f0" }}>Submit Reel</span></div>
    <p className={styles.eyebrow}>Clip submission</p>
    <h1 className={styles.title}>Submit a Reel</h1>
    <p className={styles.subtitle}>Link each submission to the Instagram account that published it. All displayed campaign rates are in Indian rupees (INR).</p>
    {(campaignsResult.error || accountsResult.error) && <div className={`${styles.notice} ${styles.noticeError}`}>Couldn't load all submission options: {[campaignsResult.error?.message, accountsResult.error?.message].filter(Boolean).join(" · ")}. Apply the included SQL migration if the instagram_accounts table is missing.</div>}
    <SubmitClipForm campaigns={campaignsResult.data ?? []} accounts={accountsResult.data ?? []} />
  </main>;
}
