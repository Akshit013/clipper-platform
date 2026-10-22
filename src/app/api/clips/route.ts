import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseInstagramUrl } from "@/lib/instagram";

const schema = z.object({
  campaignId: z.string().uuid(),
  instagramAccountId: z.string().uuid(),
  instagramUrl: z.string().trim().min(8).max(500),
  selfReportedViews: z.number().int().min(0).max(1000000000),
  selfReportedLikes: z.number().int().min(0).max(1000000000),
}).strict();

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in before submitting a Reel." }, { status: 401 });

    const input = schema.parse(await request.json());
    let parsedUrl: ReturnType<typeof parseInstagramUrl>;
    try {
      parsedUrl = parseInstagramUrl(input.instagramUrl);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid public Instagram Reel URL." }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [accountResult, campaignResult] = await Promise.all([
      supabase.from("instagram_accounts").select("id,handle")
        .eq("id", input.instagramAccountId).eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      supabase.from("campaigns").select("id")
        .eq("id", input.campaignId).eq("is_active", true)
        .lte("start_date", today).gte("end_date", today).maybeSingle(),
    ]);
    if (accountResult.error) return NextResponse.json({ error: accountResult.error.message }, { status: 400 });
    if (!accountResult.data) return NextResponse.json({ error: "Select one of your active Instagram accounts first." }, { status: 400 });
    if (campaignResult.error) return NextResponse.json({ error: campaignResult.error.message }, { status: 400 });
    if (!campaignResult.data) return NextResponse.json({ error: "Campaign not found, inactive, or outside its campaign dates." }, { status: 400 });

    const { data, error } = await supabase.from("clips").insert({
      user_id: user.id,
      campaign_id: input.campaignId,
      instagram_account_id: accountResult.data.id,
      instagram_url: parsedUrl.canonicalUrl,
      shortcode: parsedUrl.shortcode,
      self_reported_views: input.selfReportedViews,
      self_reported_likes: input.selfReportedLikes,
      status: "pending",
    }).select("id,user_id,campaign_id,instagram_account_id,instagram_url,shortcode,self_reported_views,self_reported_likes,status,submitted_at").single();

    if (error) return NextResponse.json({ error: error.code === "23505" ? "This Reel has already been submitted for that campaign." : error.message }, { status: error.code === "23505" ? 409 : 400 });
    return NextResponse.json({ clip: { ...data, instagram_account_handle: accountResult.data.handle } }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
