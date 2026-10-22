'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from './auth';
import { extractInstagramShortcode, isValidInstagramReelUrl } from '@/lib/utils';
import { instagramMetricService } from '@/lib/instagram';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type {
  Clip,
  Campaign,
  MetricSnapshot,
  Earning,
  ClipperStats,
} from '@/lib/types';

const SubmitClipSchema = z.object({
  instagramUrl: z
    .string()
    .url('Please enter a valid URL')
    .refine(
      (url) => isValidInstagramReelUrl(url),
      'URL must be a public Instagram Reel (e.g., https://www.instagram.com/reel/C123456/)'
    ),
  campaignId: z.string().uuid('Please select a valid campaign'),
});

export type SubmitClipResult = {
  success: boolean;
  error?: string;
  clip?: Clip;
  message?: string;
};

/**
 * Submit public Instagram Reel URL for an active campaign
 */
export async function submitClipAction(
  formData: FormData
): Promise<SubmitClipResult> {
  const { user } = await getCurrentProfile();
  if (!user) {
    return { success: false, error: 'You must be logged in to submit clips.' };
  }

  const raw = {
    instagramUrl: formData.get('instagramUrl'),
    campaignId: formData.get('campaignId'),
  };

  const parsed = SubmitClipSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message || 'Invalid submission form data',
    };
  }

  const { instagramUrl, campaignId } = parsed.data;
  const shortcode = extractInstagramShortcode(instagramUrl)!;

  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  // Verify campaign is active and within active dates
  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campError || !campaign) {
    return { success: false, error: 'The selected campaign does not exist.' };
  }

  const camp = campaign as Campaign;
  if (!camp.is_active || today < camp.start_date || today > camp.end_date) {
    return {
      success: false,
      error: 'This campaign is no longer accepting submissions.',
    };
  }

  // Prevent duplicate submissions of the exact same reel shortcode for the same campaign by the same user
  const { data: existingClip } = await supabase
    .from('clips')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('campaign_id', campaignId)
    .eq('shortcode', shortcode)
    .maybeSingle();

  if (existingClip) {
    return {
      success: false,
      error: 'You have already submitted this Instagram Reel for this campaign.',
    };
  }

  // Insert clip with pending status
  const adminClient = createAdminClient();
  const { data: clipData, error: insertError } = await adminClient
    .from('clips')
    .insert({
      user_id: user.id,
      campaign_id: campaignId,
      instagram_url: instagramUrl,
      shortcode,
      status: 'pending',
    })
    .select('*')
    .single();

  if (insertError || !clipData) {
    return {
      success: false,
      error: insertError?.message || 'Failed to submit clip.',
    };
  }

  const newClip = clipData as Clip;

  // Attempt initial metric snapshot fetch asynchronously without blocking failure
  try {
    const metrics = await instagramMetricService.getMetrics(shortcode);
    await adminClient.from('metric_snapshots').insert({
      clip_id: newClip.id,
      observed_views: metrics.observedViews,
      eligible_views: null, // Eligible views are determined during admin review
      source: metrics.source,
    });
  } catch (err) {
    console.warn('Initial metric snapshot warning:', err);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/clips');

  return {
    success: true,
    clip: newClip,
    message: 'Clip submitted successfully! Awaiting review.',
  };
}

export type ClipperClipView = Clip & {
  campaign: Campaign;
  latestSnapshot: MetricSnapshot | null;
  earnings: Earning | null;
};

/**
 * Get all clips submitted by the current clipper
 */
export async function getClipperClipsAction(
  statusFilter?: string
): Promise<{ clips: ClipperClipView[]; error?: string }> {
  const { user } = await getCurrentProfile();
  if (!user) {
    return { clips: [], error: 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('clips')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false });

  if (statusFilter && ['pending', 'reviewing', 'approved', 'rejected'].includes(statusFilter)) {
    query = query.eq('status', statusFilter as 'pending' | 'reviewing' | 'approved' | 'rejected');
  }

  const { data: clips, error: clipsError } = await query;
  if (clipsError || !clips) {
    return { clips: [], error: clipsError?.message || 'Failed to load clips' };
  }

  const typedClips = clips as Clip[];
  if (typedClips.length === 0) {
    return { clips: [] };
  }

  const clipIds = typedClips.map((c) => c.id);
  const campaignIds = Array.from(new Set(typedClips.map((c) => c.campaign_id)));

  // These lookups are independent, so run them in parallel to reduce queue latency.
  const [campaignsResult, snapshotsResult, earningsResult] = await Promise.all([
    supabase.from('campaigns').select('*').in('id', campaignIds),
    supabase.from('metric_snapshots').select('*').in('clip_id', clipIds).order('fetched_at', { ascending: false }),
    supabase.from('earnings').select('*').in('clip_id', clipIds),
  ]);

  const campaignMap = new Map<string, Campaign>();
  (campaignsResult.data as Campaign[] || []).forEach((c) => campaignMap.set(c.id, c));

  const latestSnapshotMap = new Map<string, MetricSnapshot>();
  (snapshotsResult.data as MetricSnapshot[] || []).forEach((snapshot) => {
    if (!latestSnapshotMap.has(snapshot.clip_id)) latestSnapshotMap.set(snapshot.clip_id, snapshot);
  });

  const earningsMap = new Map<string, Earning>();
  (earningsResult.data as Earning[] || []).forEach((earning) => earningsMap.set(earning.clip_id, earning));

  const result: ClipperClipView[] = typedClips.map((clip) => ({
    ...clip,
    campaign: campaignMap.get(clip.campaign_id)!,
    latestSnapshot: latestSnapshotMap.get(clip.id) || null,
    earnings: earningsMap.get(clip.id) || null,
  }));

  return { clips: result };
}

/**
 * Get clipper dashboard overview stats & recent activity
 */
export async function getClipperDashboardDataAction(): Promise<{
  stats: ClipperStats;
  recentClips: ClipperClipView[];
  error?: string;
}> {
  const { user } = await getCurrentProfile();
  if (!user) {
    return {
      stats: {
        totalClips: 0,
        observedViews: 0,
        eligibleViews: 0,
        approvedEarnings: 0,
        pendingPayouts: 0,
        availableBalance: 0,
      },
      recentClips: [],
      error: 'Unauthorized',
    };
  }

  const supabase = await createServerSupabaseClient();

  // Load independent dashboard data concurrently. Bonus credits are part of spendable wallet balance.
  const [clipsResult, earningsResult, payoutsResult, bonusResult, contestPrizeResult] = await Promise.all([
    getClipperClipsAction(),
    supabase.from('earnings').select('*').eq('user_id', user.id),
    supabase.from('payout_requests').select('amount, status').eq('user_id', user.id),
    (supabase as any).from('bonus_claims').select('amount_inr, status').eq('user_id', user.id),
    (supabase as any).from('wallet_transactions').select('balance_delta').eq('user_id', user.id).eq('event_type', 'contest_prize'),
  ]);
  const { clips = [] } = clipsResult;
  const userEarnings = (earningsResult.data as Earning[]) || [];
  const approvedEarnings = userEarnings.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );
  const eligibleViews = userEarnings.reduce(
    (sum, e) => sum + Number(e.eligible_views || 0),
    0
  );

  // 3. Fetch observed views across all user clips
  let observedViews = 0;
  clips.forEach((clip) => {
    if (clip.latestSnapshot?.observed_views) {
      observedViews += Number(clip.latestSnapshot.observed_views);
    }
  });

  // 4. Calculate wallet balance from the same categories as the payout centre.
  const payouts = (payoutsResult.data as { amount: number | string; status: string }[]) || [];
  const bonusClaims = (bonusResult.data as { amount_inr: number | string; status: string }[]) || [];
  const approvedBonusTotal = bonusClaims
    .filter((claim) => claim.status === 'approved')
    .reduce((sum, claim) => sum + Number(claim.amount_inr || 0), 0);
  const contestPrizeTotal = ((contestPrizeResult.data as { balance_delta: number | string }[]) || [])
    .reduce((sum, row) => sum + Number(row.balance_delta || 0), 0);

  const pendingPayouts = payouts
    .filter((p) => p.status === 'pending' || p.status === 'approved')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const paidPayouts = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Only approved wallet bonuses are spendable. Bonuses paid directly by admin are not added again.
  const availableBalance = Math.round(Math.max(
    0,
    approvedEarnings + approvedBonusTotal + contestPrizeTotal - pendingPayouts - paidPayouts
  ) * 100) / 100;

  return {
    stats: {
      totalClips: clips.length,
      observedViews,
      eligibleViews,
      approvedEarnings,
      pendingPayouts,
      availableBalance,
    },
    recentClips: clips.slice(0, 5),
  };
}

/**
 * Fetch only the spendable wallet balance for the persistent dashboard header.
 * This avoids loading every clip, metric snapshot, campaign and earning on each subpage.
 */
export async function getClipperAvailableBalanceAction(): Promise<number> {
  const { user } = await getCurrentProfile();
  if (!user) return 0;

  const supabase = await createServerSupabaseClient();
  const [earningsResult, payoutsResult, bonusResult, contestPrizeResult] = await Promise.all([
    supabase.from('earnings').select('amount').eq('user_id', user.id),
    supabase.from('payout_requests').select('amount, status').eq('user_id', user.id),
    (supabase as any).from('bonus_claims').select('amount_inr, status').eq('user_id', user.id),
    (supabase as any).from('wallet_transactions').select('balance_delta').eq('user_id', user.id).eq('event_type', 'contest_prize'),
  ]);

  const clipEarnings = ((earningsResult.data as { amount: number | string }[]) || [])
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const payouts = (payoutsResult.data as { amount: number | string; status: string }[]) || [];
  const bonusClaims = (bonusResult.data as { amount_inr: number | string; status: string }[]) || [];
  const approvedBonus = bonusClaims.filter((row) => row.status === 'approved')
    .reduce((sum, row) => sum + Number(row.amount_inr || 0), 0);
  const contestPrizeCredits = ((contestPrizeResult.data as { balance_delta: number | string }[]) || [])
    .reduce((sum, row) => sum + Number(row.balance_delta || 0), 0);
  const committedPayouts = payouts.filter((row) => ['pending', 'approved', 'paid'].includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  return Math.round(Math.max(0, clipEarnings + approvedBonus + contestPrizeCredits - committedPayouts) * 100) / 100;
}

/**
 * Trigger live synchronization for a clip's Instagram metrics
 */
export async function syncClipMetricsAction(
  clipId: string
): Promise<{ success: boolean; snapshot?: MetricSnapshot; error?: string }> {
  const { user } = await getCurrentProfile();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Ensure clip belongs to user or user is admin
  const { data: clip, error: clipError } = await supabase
    .from('clips')
    .select('*')
    .eq('id', clipId)
    .single();

  if (clipError || !clip) {
    return { success: false, error: 'Clip not found' };
  }

  const typedClip = clip as Clip;
  const metrics = await instagramMetricService.getMetrics(typedClip.shortcode);

  const adminClient = createAdminClient();
  const { data: snapshot, error: snapError } = await adminClient
    .from('metric_snapshots')
    .insert({
      clip_id: clipId,
      observed_views: metrics.observedViews,
      eligible_views: null,
      source: metrics.source,
    })
    .select('*')
    .single();

  if (snapError) {
    return { success: false, error: snapError.message };
  }

  revalidatePath('/dashboard/clips');
  revalidatePath('/admin/clips');

  return {
    success: true,
    snapshot: snapshot as MetricSnapshot,
  };
}
