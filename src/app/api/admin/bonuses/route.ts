import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const sessionClient = await createServerSupabaseClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Please sign in." }, { status: 401 }) };
  const admin = createAdminClient() as any;
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  return { user, admin };
}

export async function GET() {
  const access = await requireAdmin();
  if ("response" in access) return access.response;
  const { data: claims, error } = await access.admin.from("bonus_claims").select("*").order("requested_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: profiles } = await access.admin.from("profiles").select("user_id,display_name");
  const names = new Map<string, string>((profiles ?? []).map((profile: any): [string, string] => [profile.user_id, profile.display_name || profile.user_id]));
  return NextResponse.json({ claims: (claims ?? []).map((claim: any) => ({ ...claim, clipper_name: names.get(claim.user_id) || claim.user_id })) });
}
