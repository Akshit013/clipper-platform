import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import StreamersDirectory from "./StreamersDirectory";
import styles from "../clipping-tools.module.css";

export const dynamic = "force-dynamic";

export default async function ApprovedStreamersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Clipping resources</p>
        <h1 className={styles.title}>Approved streamers</h1>
        <p className={styles.description}>Browse all 165 streamer names supplied by your team and open their Kick channels before creating a clip.</p>
      </section>
      <p className={styles.note}>Link note: Kick URLs were inferred from the usernames in your screenshots and have not been individually verified. If a channel doesn't open or the username differs, report it to an admin before clipping.</p>
      <StreamersDirectory />
    </main>
  );
}
