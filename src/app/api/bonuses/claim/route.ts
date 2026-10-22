import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const REWARDS: Record<number, number> = { 25: 100, 50: 200, 100: 500 };

export async function POST(request: Request) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in to claim a bonus." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const milestone = Number(body?.milestone);
    const amount = REWARDS[milestone];
    if (!amount) return NextResponse.json({ error: "Select a valid bonus milestone." }, { status: 400 });

    const admin = createAdminClient() as any;
    const { count, error: countError } = await admin
      .from("clips")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "approved")
      .eq("is_removed", false);
    if (countError) return NextResponse.json({ error: `Could not verify approved clips: ${countError.message}` }, { status: 500 });
    const approvedCount = count ?? 0;
    if (approvedCount < milestone) {
      return NextResponse.json({ error: `You need ${milestone} approved clips to claim this bonus. Current count: ${approvedCount}.` }, { status: 409 });
    }

    const { data: existing, error: existingError } = await admin
      .from("bonus_claims")
      .select("id,status")
      .eq("user_id", user.id)
      .eq("milestone", milestone)
      .maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
    if (existing) return NextResponse.json({ error: `You have already submitted the ${milestone}-clip bonus. Status: ${existing.status}.` }, { status: 409 });

    const { data, error } = await admin.from("bonus_claims").insert({
      user_id: user.id,
      milestone,
      amount_inr: amount,
      approved_clip_count_at_claim: approvedCount,
      status: "pending",
    }).select("id,milestone,amount_inr,status,requested_at").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "This milestone has already been claimed." }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ claim: data, message: "Bonus claim submitted for admin review." }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500 });
  }
}
