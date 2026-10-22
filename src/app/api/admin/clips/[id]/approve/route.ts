import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-server";

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  eligibleViews: z.number().int().safe().nonnegative().optional(),
}).refine((value) => value.decision !== "approve" || value.eligibleViews !== undefined, {
  message: "Verified eligible views are required to approve a clip.",
  path: ["eligibleViews"],
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireAdmin();
    const { id } = await context.params;
    const input = decisionSchema.parse(await request.json());
    const { data: clip, error: clipError } = await supabase.from("clips")
      .select("id,user_id,campaign_id,status")
      .eq("id", id)
      .maybeSingle();
    if (clipError) return NextResponse.json({ error: clipError.message }, { status: 400 });
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
    if (clip.status !== "pending") return NextResponse.json({ error: "This clip has already been reviewed." }, { status: 409 });

    const now = new Date().toISOString();
    if (input.decision === "reject") {
      const { data, error } = await supabase.from("clips")
        .update({ status: "rejected", reviewed_at: now, reviewed_by: user.id })
        .eq("id", id).eq("status", "pending")
        .select("id,status,reviewed_at")
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ error: "Clip state changed. Refresh and try again." }, { status: 409 });
      return NextResponse.json({ clip: data });
    }

    const eligibleViews = input.eligibleViews!;
    const { data: campaign, error: campaignError } = await supabase.from("campaigns")
      .select("rate_per_1000").eq("id", clip.campaign_id).maybeSingle();
    if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 400 });
    if (!campaign) return NextResponse.json({ error: "The clip's campaign could not be found." }, { status: 400 });
    const rate = Number(campaign.rate_per_1000);
    const amount = Math.round((eligibleViews / 1000) * rate * 100) / 100;

    const { data: updatedClip, error: updateError } = await supabase.from("clips")
      .update({ status: "approved", reviewed_at: now, reviewed_by: user.id })
      .eq("id", id).eq("status", "pending")
      .select("id,status,reviewed_at")
      .maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    if (!updatedClip) return NextResponse.json({ error: "Clip state changed. Refresh and try again." }, { status: 409 });

    const { error: earningError } = await supabase.from("earnings").upsert({
      clip_id: clip.id,
      user_id: clip.user_id,
      campaign_id: clip.campaign_id,
      eligible_views: eligibleViews,
      rate_per_1000: rate,
      amount,
      calculated_at: now,
    }, { onConflict: "clip_id" });
    if (earningError) {
      // Best-effort rollback so a clip isn't left approved without its earning record.
      await supabase.from("clips").update({ status: "pending", reviewed_at: null, reviewed_by: null }).eq("id", id);
      return NextResponse.json({ error: `Could not record earnings: ${earningError.message}` }, { status: 400 });
    }
    return NextResponse.json({ clip: updatedClip, eligibleViews, amount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
