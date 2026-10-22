import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminBonusClaims from "./AdminBonusClaims";
import styles from "../../dashboard/clipping-tools.module.css";

export const dynamic = "force-dynamic";

export default async function AdminBonusClaimsPage() {
  const sessionClient = await createServerSupabaseClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) redirect("/login");
  const admin = createAdminClient() as any;
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") redirect("/dashboard");
  const { data: claims, error: claimsError } = await admin.from("bonus_claims").select("*").order("requested_at", { ascending: false });
  if (claimsError) return <main className={styles.page}><h1 className={styles.title}>Bonus claims</h1><p className={styles.error}>Could not load claims: {claimsError.message}</p></main>;
  const { data: profiles } = await admin.from("profiles").select("user_id,display_name");
  const names = new Map<string, string>((profiles ?? []).map((item: any): [string, string] => [item.user_id, item.display_name || item.user_id]));
  const decorated = (claims ?? []).map((claim: any) => ({ ...claim, clipper_name: names.get(claim.user_id) || claim.user_id }));
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Admin operations</p>
        <h1 className={styles.title}>Bonus claims</h1>
        <p className={styles.description}>Review milestone claims, approve them, and record payment only after the bonus has actually been transferred.</p>
      </section>
      <p className={styles.note}>Marking a claim as paid records the transaction reference. It does not transfer money automatically. Process the UPI/bank payment separately.</p>
      <AdminBonusClaims initialClaims={decorated} />
    </main>
  );
}
