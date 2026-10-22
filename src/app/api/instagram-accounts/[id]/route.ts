import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { id } = await context.params;
    const { data, error } = await supabase.from("instagram_accounts")
      .update({ is_active: false })
      .eq("id", id).eq("user_id", user.id)
      .select("id,handle,is_active").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Instagram account not found." }, { status: 404 });
    return NextResponse.json({ account: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not deactivate account." }, { status: 500 });
  }
}
