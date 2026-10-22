import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  amount: z.number().finite().positive().max(100_000_000),
  upiId: z.string().trim().min(3).max(150).regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/,
    "Enter a valid UPI ID, for example name@bank.",
  ),
}).strict();

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("Please sign in again.", 401);

    const [earningsResult, payoutsResult, bonusClaimsResult] = await Promise.all([
      supabase.from("earnings")
        .select("id,clip_id,campaign_id,eligible_views,rate_per_1000,amount,calculated_at")
        .eq("user_id", user.id).order("calculated_at", { ascending: false }).limit(2000),
      supabase.from("payout_requests")
        .select("*")
        .eq("user_id", user.id).order("requested_at", { ascending: false }).limit(2000),
      supabase.from("bonus_claims")
        .select("id,milestone,amount_inr,status,requested_at,processed_at,payment_reference,admin_note")
        .eq("user_id", user.id).order("requested_at", { ascending: false }).limit(2000),
    ]);

    const requestUrl = new URL(request.url);
    const parsedPage = Number(requestUrl.searchParams.get("transactionsPage") ?? "0");
    const walletTransactionPage = Number.isInteger(parsedPage) && parsedPage >= 0 ? Math.min(parsedPage, 100000) : 0;
    const walletTransactionPageSize = 100;
    const [walletTransactionsResult, approvedClipsResult, contestPrizeTotalResult] = await Promise.all([
      (supabase as any).from("wallet_transactions")
        .select("*", { count: "exact" })
        .eq("user_id", user.id).order("created_at", { ascending: false })
        .range(walletTransactionPage * walletTransactionPageSize, (walletTransactionPage + 1) * walletTransactionPageSize - 1),
      (supabase as any).from("clips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", "approved"),
      (supabase as any).from("wallet_transactions")
        .select("balance_delta")
        .eq("user_id", user.id).eq("event_type", "contest_prize"),
    ]);

    const errors = [earningsResult.error, payoutsResult.error, bonusClaimsResult.error, walletTransactionsResult.error, approvedClipsResult.error, contestPrizeTotalResult.error].filter(Boolean).map((e) => e!.message);
    if (errors.length) return errorResponse(errors.join(" · "), 400);

    const earnings = earningsResult.data ?? [];
    const payouts = payoutsResult.data ?? [];
    const bonusClaims = bonusClaimsResult.data ?? [];

    const clipEarningsTotal = earnings.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const approvedBonusTotal = bonusClaims.filter((row) => row.status === "approved")
      .reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
    const paidBonusTotal = bonusClaims.filter((row) => row.status === "paid")
      .reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
    const contestPrizeTotal = ((contestPrizeTotalResult.data as { balance_delta: number | string }[]) || [])
      .reduce((sum, row) => sum + Number(row.balance_delta || 0), 0);
    const totalEarned = clipEarningsTotal + approvedBonusTotal + paidBonusTotal + contestPrizeTotal;
    const totalPaid = payouts.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount || 0), 0) + paidBonusTotal;
    const reserved = payouts.filter((row) => row.status === "pending" || row.status === "approved")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const committed = payouts.filter((row) => ["pending", "approved", "paid"].includes(row.status))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    // Only currently approved bonus claims are spendable. Paid bonuses were sent directly.
    const available = Math.max(0, clipEarningsTotal + approvedBonusTotal + contestPrizeTotal - committed);

    return NextResponse.json({
      earnings,
      payouts,
      bonusClaims,
      walletTransactions: walletTransactionsResult.data ?? [],
      walletTransactionCount: walletTransactionsResult.count ?? 0,
      walletTransactionPage,
      walletTransactionPageSize,
      approvedClipCount: approvedClipsResult.count ?? 0,
      summary: {
        totalEarned: Math.round(totalEarned * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        reserved: Math.round(reserved * 100) / 100,
        available: Math.round(available * 100) / 100,
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not load payment history.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse("Please sign in again.", 401);

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message || "Check the payout details.");

    // The SQL RPC rechecks available balance and inserts the request in one
    // database transaction, preventing double-spend from concurrent requests.
    const typedClient = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>;
    };
    const { data, error } = await typedClient.rpc("request_clipper_payout", {
      p_amount: parsed.data.amount,
      p_upi_id: parsed.data.upiId,
    });

    if (error) {
      const message = error.message.includes("UNAUTHENTICATED")
        ? "Your session expired. Please sign in again."
        : error.message.replace(/^.*ERROR:\s*/, "").replace(/^P0001:\s*/, "");
      return errorResponse(message, error.message.includes("UNAUTHENTICATED") ? 401 : 400);
    }
    return NextResponse.json({ payout: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not request payout.", 400);
  }
}
