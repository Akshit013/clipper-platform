import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import AccountsManager from "./AccountsManager";
import styles from "../portal.module.css";

export const dynamic = "force-dynamic";

export default async function InstagramAccountsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { data, error } = await supabase.from("instagram_accounts")
    .select("id,user_id,handle,display_name,is_active,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <main className={styles.page}>
    <div className={styles.topline}><Link className={styles.backLink} href="/dashboard">← Dashboard</Link><span style={{ color: "#526782" }}>/</span><span style={{ color: "#d5e0f0" }}>Instagram accounts</span></div>
    <p className={styles.eyebrow}>Creator settings</p>
    <h1 className={styles.title}>Manage Instagram accounts</h1>
    <p className={styles.subtitle}>Keep several creator pages under one ClipperPlatform login and choose the right account for each Reel submission.</p>
    <AccountsManager initialAccounts={data ?? []} initialError={error?.message ?? null} />
  </main>;
}
