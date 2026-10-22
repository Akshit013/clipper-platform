import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import AdminDashboard, { type AdminClip, type AdminCampaign, type AdminPayout, type AdminProfile, type AdminEarning } from "./AdminDashboard";
import AdminFinancialSnapshot from "./financials/AdminFinancialSnapshot";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/login");

  const profileLookup = await supabase
    .from("profiles")
    .select("role,display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = profileLookup.data as unknown as {
    role: string;
    display_name: string | null;
  } | null;

  const profileError = profileLookup.error;

  if (profileError || profile?.role !== "admin") redirect("/dashboard");

  const [profilesResult, campaignsResult, clipsResult, payoutsResult, earningsResult, accountsResult] = await Promise.all([
    supabase.from("profiles").select("id,user_id,display_name,role,created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("campaigns").select("id,name,description,rate_per_1000,start_date,end_date,is_active,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("clips").select("id,user_id,campaign_id,instagram_account_id,instagram_url,shortcode,self_reported_views,self_reported_likes,status,submitted_at,reviewed_at,reviewed_by").eq("is_removed", false).order("submitted_at", { ascending: false }).limit(500),
    supabase.from("payout_requests").select("*").order("requested_at", { ascending: false }).limit(500),
    supabase.from("earnings").select("id,clip_id,user_id,campaign_id,eligible_views,rate_per_1000,amount,calculated_at").order("calculated_at", { ascending: false }).limit(1000),
    supabase.from("instagram_accounts").select("id,user_id,handle,is_active").limit(5000),
  ]);

  const errors = [profilesResult.error, campaignsResult.error, clipsResult.error, payoutsResult.error, earningsResult.error, accountsResult.error]
    .filter(Boolean).map((e) => e!.message);

  const earningsData = ((earningsResult.data ?? []) as unknown as Record<string, unknown>[]).map((e) => ({ ...e, currency: "INR" })) as unknown as AdminEarning[];
  const accountRows = (accountsResult.data ?? []) as unknown as Array<{ id: string; [key: string]: any }>;
  const accountById = new Map<string, (typeof accountRows)[number]>(
    accountRows.map((account): [string, (typeof accountRows)[number]] => [account.id, account])
  );
  const earningsByClip = new Map(earningsData.map((e) => [e.clip_id, e]));
  const clipRows = (clipsResult.data ?? []) as unknown as AdminClip[];
  const clips = clipRows.map((clip) => {
    const earning = earningsByClip.get(clip.id);
    return {
      ...clip,
      review_note: null,
      instagram_account_handle: clip.instagram_account_id ? accountById.get(clip.instagram_account_id)?.handle ?? null : null,
      eligible_views: Number(earning?.eligible_views ?? 0),
      last_observed_views: null,
      last_metric_at: null,
    };
  }) as AdminClip[];

  const campaigns = ((campaignsResult.data ?? []) as unknown as Record<string, any>[]).map((c) => ({ ...c, currency: "INR" })) as AdminCampaign[];
  const payouts = ((payoutsResult.data ?? []) as unknown as Record<string, any>[]).map((p) => ({
    ...p,
    status: p.status === "pending" ? "requested" : p.status,
    currency: "INR",
    reviewed_at: p.processed_at,
    paid_at: p.status === "paid" ? p.processed_at : null,
    admin_note: null,
  })) as AdminPayout[];
  const profiles = (profilesResult.data ?? []) as AdminProfile[];

  return <>
      <AdminDashboard
    adminName={profile.display_name || user.email?.split("@")[0] || "Admin"}
    initialError={errors.length ? errors.join(" · ") : null}
    profiles={profiles}
    campaigns={campaigns}
    clips={clips}
    payouts={payouts}
    earnings={earningsData}
      />
      <AdminFinancialSnapshot />
    </>;
}
