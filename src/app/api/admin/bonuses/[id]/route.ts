import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionClient = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await sessionClient.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const admin = createAdminClient() as any;
    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
    if (profileError || profile?.role !== "admin") return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    const status = action === "approve" ? "approved" : action === "mark_paid" ? "paid" : action === "reject" ? "rejected" : null;
    if (!status) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    const { data: current, error: currentError } = await admin.from("bonus_claims").select("id,status").eq("id", id).maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Bonus claim not found." }, { status: 404 });
    if (current.status === "paid" || current.status === "rejected") return NextResponse.json({ error: `Claim is already ${current.status} and cannot be changed.` }, { status: 409 });
    const paymentReference = typeof body?.paymentReference === "string" ? body.paymentReference.trim().slice(0, 200) : "";
    if (action === "mark_paid" && !paymentReference) return NextResponse.json({ error: "Enter the UPI/bank transaction reference after you have actually sent the payment." }, { status: 400 });
    const note = typeof body?.adminNote === "string" ? body.adminNote.trim().slice(0, 1000) : null;
    const updates: Record<string, unknown> = { status, processed_at: new Date().toISOString(), processed_by: user.id, admin_note: note };
    if (action === "mark_paid") updates.payment_reference = paymentReference;
    const { data, error } = await admin.from("bonus_claims").update(updates).eq("id", id).select("id,status,amount_inr,payment_reference,admin_note").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ claim: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500 });
  }
}
