import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-server";

const schema = z.object({
  decision: z.enum(["approve", "reject", "mark_paid"]),
  paymentReference: z.string().trim().min(1).max(200).optional(),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireAdmin();
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const { data: payout, error: readError } = await supabase.from("payout_requests")
      .select("id,status,amount")
      .eq("id", id).maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    if (!payout) return NextResponse.json({ error: "Payout request not found." }, { status: 404 });
    if (["paid", "rejected"].includes(payout.status)) return NextResponse.json({ error: "This payout request is finalized." }, { status: 409 });

    let nextStatus: "approved" | "rejected" | "paid";
    if (body.decision === "approve") {
      if (payout.status !== "pending") return NextResponse.json({ error: "Only pending requests can be approved." }, { status: 409 });
      nextStatus = "approved";
    } else if (body.decision === "reject") {
      if (payout.status !== "pending" && payout.status !== "approved") return NextResponse.json({ error: "This request cannot be rejected in its current state." }, { status: 409 });
      nextStatus = "rejected";
    } else {
      if (payout.status !== "approved") return NextResponse.json({ error: "Only approved payouts can be marked paid." }, { status: 409 });
      if (!body.paymentReference?.trim()) return NextResponse.json({ error: "A real payment reference is required." }, { status: 400 });
      nextStatus = "paid";
    }

    const patch: Record<string, unknown> = { status: nextStatus, processed_at: new Date().toISOString(), processed_by: user.id };
    if (body.decision === "mark_paid") patch.payment_reference = body.paymentReference!.trim();
    const { data, error } = await supabase.from("payout_requests").update(patch).eq("id", id)
      .select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ payout: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
