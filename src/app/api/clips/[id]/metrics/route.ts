import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  views: z.number().int().min(0).max(1_000_000_000),
  likes: z.number().int().min(0).max(1_000_000_000),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const admin = createAdminClient() as any;
    const { data: clip, error: readError } = await admin.from("clips").select("id,status,is_removed").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    if (!clip) return NextResponse.json({ error: "Clip not found." }, { status: 404 });
    if (clip.is_removed) return NextResponse.json({ error: "This clip has been removed. Contact an admin if you think this is a mistake." }, { status: 409 });
    if (clip.status !== "reviewing") return NextResponse.json({ error: "Updated views and likes can only be submitted when the admin marks this Reel as Reviewing." }, { status: 409 });
    const { data: updated, error: updateError } = await admin.from("clips").update({ self_reported_views: input.views, self_reported_likes: input.likes, status: "pending" }).eq("id", id).eq("user_id", user.id).eq("status", "reviewing").select("id,status,self_reported_views,self_reported_likes").maybeSingle();
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "This Reel's review state changed. Refresh and try again." }, { status: 409 });
    revalidatePath("/dashboard/clips");
    revalidatePath("/admin/clips");
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, clip: updated, message: "Updated metrics submitted. Your Reel is back in the admin review queue." });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not update metrics.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
