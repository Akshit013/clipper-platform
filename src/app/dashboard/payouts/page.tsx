import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import PayoutsManager from "./PayoutsManager";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  return <PayoutsManager />;
}
