import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({
  handle: z.string().trim().min(1).max(200),
  displayName: z.string().trim().max(80).optional().nullable(),
}).strict();

function normalizeInstagramHandle(input: string): string {
  let value = input.trim();
  if (value.includes("instagram.com/")) {
    try {
      const url = new URL(value.startsWith("http") ? value : `https://${value}`);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("Enter an Instagram profile URL or username.");
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) throw new Error("Paste a profile URL, not a Reel or post URL.");
      value = parts[0] ?? "";
    } catch {
      throw new Error("Enter a valid Instagram username or profile URL.");
    }
  }
  value = value.replace(/^@/, "").trim().toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(value)) {
    throw new Error("Instagram usernames may contain letters, numbers, periods and underscores (up to 30 characters).");
  }
  return value;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const { data, error } = await supabase.from("instagram_accounts")
      .select("id,user_id,handle,display_name,is_active,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ accounts: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Instagram accounts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    const input = schema.parse(await request.json());
    const handle = normalizeInstagramHandle(input.handle);

    const { count, error: countError } = await supabase.from("instagram_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("is_active", true);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });

    const { data: existing, error: existingError } = await supabase.from("instagram_accounts")
      .select("id,user_id,handle,display_name,is_active,created_at")
      .eq("user_id", user.id).eq("handle", handle).maybeSingle();
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 });

    if (existing) {
      if (!existing.is_active && (count ?? 0) >= 10) {
        return NextResponse.json({ error: "You can have up to 10 active Instagram accounts." }, { status: 409 });
      }
      const { data, error } = await supabase.from("instagram_accounts")
        .update({ is_active: true, display_name: input.displayName?.trim() || null, handle })
        .eq("id", existing.id).eq("user_id", user.id)
        .select("id,user_id,handle,display_name,is_active,created_at").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ account: data, reactivated: true }, { status: 200 });
    }

    if ((count ?? 0) >= 10) return NextResponse.json({ error: "You can have up to 10 active Instagram accounts." }, { status: 409 });

    const { data, error } = await supabase.from("instagram_accounts").insert({
      user_id: user.id,
      handle,
      display_name: input.displayName?.trim() || null,
      is_active: true,
    }).select("id,user_id,handle,display_name,is_active,created_at").single();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "This Instagram account is already added." : error.message }, { status: error.code === "23505" ? 409 : 400 });
    return NextResponse.json({ account: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Could not add Instagram account.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
