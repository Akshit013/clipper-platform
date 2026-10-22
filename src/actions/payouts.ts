'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from './auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { PayoutRequest, Profile } from '@/lib/types';

const PayoutRequestSchema = z.object({
  amount: z
    .number()
    .positive('Payout request amount must be greater than ₹0.00'),
});

export type PayoutActionResult = {
  success: boolean;
  error?: string;
  payout?: PayoutRequest;
  message?: string;
};

/**
 * Clipper: Request a payout from genuinely available balance
 */
export async function requestPayoutAction(
  formData: FormData
): Promise<PayoutActionResult> {
  const { user } = await getCurrentProfile();
  if (!user) {
    return { success: false, error: 'Unauthorized: Please log in.' };
  }

  const rawAmount = parseFloat(formData.get('amount') as string);
  const parsed = PayoutRequestSchema.safeParse({ amount: rawAmount });
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const requestedAmount = parsed.data.amount;
  const adminClient = createAdminClient();

  // 1. Calculate available balance atomically
  const [{ data: earningsData }, { data: bonusData }, { data: contestPrizeData }] = await Promise.all([
    adminClient.from('earnings').select('amount').eq('user_id', user.id),
    (adminClient as any).from('bonus_claims').select('amount_inr, status').eq('user_id', user.id),
    (adminClient as any).from('wallet_transactions').select('balance_delta').eq('user_id', user.id).eq('event_type', 'contest_prize'),
  ]);

  const clipEarnings = (earningsData || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const approvedBonusCredits = ((bonusData as { amount_inr: number | string; status: string }[]) || [])
    .filter((row) => row.status === 'approved').reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
  const contestPrizeCredits = ((contestPrizeData as { balance_delta: number | string }[]) || [])
    .reduce((sum, row) => sum + Number(row.balance_delta || 0), 0);
  const totalEarnings = clipEarnings + approvedBonusCredits + contestPrizeCredits;

  const { data: payoutsData } = await adminClient
    .from('payout_requests')
    .select('amount, status')
    .eq('user_id', user.id);

  const reserved = (payoutsData || [])
    .filter((p) => p.status !== 'rejected')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const availableBalance = Math.max(0, totalEarnings - reserved);

  if (requestedAmount > availableBalance) {
    return {
      success: false,
      error: `Insufficient available balance. You requested ₹${requestedAmount.toFixed(
        2
      )}, but your available balance is ₹${availableBalance.toFixed(2)}.`,
    };
  }

  // 2. Insert payout request with pending status
  const { data: newPayout, error: insertError } = await adminClient
    .from('payout_requests')
    .insert({
      user_id: user.id,
      amount: requestedAmount,
      status: 'pending',
    })
    .select('*')
    .single();

  if (insertError || !newPayout) {
    return {
      success: false,
      error: insertError?.message || 'Failed to submit payout request.',
    };
  }

  revalidatePath('/dashboard/payouts');
  revalidatePath('/dashboard');

  return {
    success: true,
    payout: newPayout as PayoutRequest,
    message: 'Payout request submitted successfully!',
  };
}

/**
 * Clipper: Get user's payout requests history
 */
export async function getClipperPayoutsAction(): Promise<{
  payouts: PayoutRequest[];
  availableBalance: number;
  totalEarnings: number;
  error?: string;
}> {
  const { user } = await getCurrentProfile();
  if (!user) {
    return { payouts: [], availableBalance: 0, totalEarnings: 0, error: 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch user payouts
  const { data: payouts, error: pError } = await supabase
    .from('payout_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false });

  if (pError) {
    return {
      payouts: [],
      availableBalance: 0,
      totalEarnings: 0,
      error: pError.message,
    };
  }

  // Include approved clip earnings, approved wallet bonuses, and contest prize credits.
  const [{ data: earningsData }, { data: bonusData }, { data: contestPrizeData }] = await Promise.all([
    supabase.from('earnings').select('amount').eq('user_id', user.id),
    (supabase as any).from('bonus_claims').select('amount_inr, status').eq('user_id', user.id),
    (supabase as any).from('wallet_transactions').select('balance_delta').eq('user_id', user.id).eq('event_type', 'contest_prize'),
  ]);
  const earningsRows = (earningsData as unknown as { amount: number | string }[]) || [];
  const clipEarnings = earningsRows.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const approvedBonusCredits = ((bonusData as { amount_inr: number | string; status: string }[]) || [])
    .filter((row) => row.status === 'approved').reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
  const contestPrizeCredits = ((contestPrizeData as { balance_delta: number | string }[]) || [])
    .reduce((sum, row) => sum + Number(row.balance_delta || 0), 0);
  const totalEarnings = clipEarnings + approvedBonusCredits + contestPrizeCredits;

  const reserved = (payouts as PayoutRequest[] || [])
    .filter((p) => p.status !== 'rejected')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const availableBalance = Math.max(0, totalEarnings - reserved);

  return {
    payouts: (payouts as PayoutRequest[]) || [],
    availableBalance,
    totalEarnings,
  };
}

export type AdminPayoutView = PayoutRequest & {
  clipper: {
    displayName: string | null;
    instagramHandle: string | null;
    userId: string;
  };
};

/**
 * Admin: Get all payout requests with clipper profile info
 */
export async function getAdminPayoutsAction(): Promise<{
  payouts: AdminPayoutView[];
  error?: string;
}> {
  const { isAdmin } = await getCurrentProfile();
  if (!isAdmin) {
    return { payouts: [], error: 'Unauthorized: Admin access required' };
  }

  const adminClient = createAdminClient();

  const { data: requests, error: reqError } = await adminClient
    .from('payout_requests')
    .select('*')
    .order('requested_at', { ascending: false });

  if (reqError || !requests) {
    return { payouts: [], error: reqError?.message || 'Failed to load payouts' };
  }

  const userIds = Array.from(new Set(requests.map((r) => r.user_id)));
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('user_id, display_name, instagram_handle')
    .in('user_id', userIds);

  const profileMap = new Map<string, Profile>();
  (profiles as Profile[] || []).forEach((p) => profileMap.set(p.user_id, p));

  const result: AdminPayoutView[] = (requests as PayoutRequest[]).map((req) => {
    const prof = profileMap.get(req.user_id);
    return {
      ...req,
      clipper: {
        userId: req.user_id,
        displayName: prof?.display_name || 'Anonymous Clipper',
        instagramHandle: prof?.instagram_handle || null,
      },
    };
  });

  return { payouts: result };
}

/**
 * Admin: Process payout (approve, mark paid with payment reference, or reject)
 */
export async function processPayoutAction(
  payoutId: string,
  newStatus: 'approved' | 'paid' | 'rejected',
  paymentReference?: string
): Promise<PayoutActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

  if (newStatus === 'paid' && (!paymentReference || !paymentReference.trim())) {
    return {
      success: false,
      error: 'A payment reference (e.g., transaction ID, bank reference) is required when marking a payout as paid.',
    };
  }

  const adminClient = createAdminClient();

  // Get current record
  const { data: current, error: getError } = await adminClient
    .from('payout_requests')
    .select('*')
    .eq('id', payoutId)
    .single();

  if (getError || !current) {
    return { success: false, error: 'Payout request not found.' };
  }

  const currentPayout = current as PayoutRequest;
  if (currentPayout.status === 'paid') {
    return { success: false, error: 'This payout has already been paid.' };
  }

  const updateData: {
    status: 'approved' | 'paid' | 'rejected';
    processed_at: string;
    processed_by: string;
    payment_reference?: string;
  } = {
    status: newStatus,
    processed_at: new Date().toISOString(),
    processed_by: user.id,
  };

  if (paymentReference) {
    updateData.payment_reference = paymentReference.trim();
  }

  const { data: updated, error: updateError } = await adminClient
    .from('payout_requests')
    .update(updateData)
    .eq('id', payoutId)
    .select('*')
    .single();

  if (updateError || !updated) {
    return { success: false, error: updateError?.message || 'Failed to update payout' };
  }

  const updatedPayout = updated as PayoutRequest;

  // Log audit
  await adminClient.from('audit_logs').insert({
    admin_id: user.id,
    action: `process_payout_${newStatus}`,
    target_table: 'payout_requests',
    target_id: payoutId,
    old_values: {
      status: currentPayout.status,
      payment_reference: currentPayout.payment_reference,
    },
    new_values: {
      status: updatedPayout.status,
      payment_reference: updatedPayout.payment_reference,
      amount: updatedPayout.amount,
    },
  });

  revalidatePath('/admin/payouts');
  revalidatePath('/dashboard/payouts');

  return {
    success: true,
    payout: updatedPayout,
    message: `Payout request updated to ${newStatus}.`,
  };
}
