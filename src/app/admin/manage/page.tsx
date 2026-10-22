import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminManagementClient from "./AdminManagementClient";
import styles from "../../dashboard/clipping-tools.module.css";

export const dynamic = "force-dynamic";

export default async function AdminManagementPage() {
  const sessionClient = await createServerSupabaseClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) redirect("/login");

  const admin = createAdminClient() as any;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") redirect("/dashboard");

  return (
    <main className={styles.page}>
      <AdminManagementClient adminName={profile.display_name || user.email?.split("@")[0] || "Admin"} />
    </main>
  );
}
