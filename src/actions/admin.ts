'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from './auth';
import { revalidatePath } from 'next/cache';
import type {
  Clip,
  Campaign,
  Profile,
  MetricSnapshot,
  Earning,
  AuditLog,
  AdminStats,
} from '@/lib/types';

export type AdminClipView = Clip & {
  self_reported_views?: number | null;
  self_reported_likes?: number | null;
  review_note?: string | null;
  clipper: {
    displayName: string | null;
    instagramHandle: string | null;
    userId: string;
  };
  campaign: Campaign;
  latestSnapshot: MetricSnapshot | null;
  earnings: Earning | null;
};

/**
 * Admin: Get overview stats
 */
export async function getAdminOverviewStatsAction(): Promise<{
  stats: AdminStats;
  error?: string;
}> {
  const { isAdmin } = await getCurrentProfile();
  if (!isAdmin) {
    return {
      stats: {
        totalClips: 0,
        pendingClips: 0,
        totalViews: 0,
        totalEarnings: 0,
        pendingPayouts: 0,
        activeCampaigns: 0,
      },
      error: 'Unauthorized',
    };
  }

  const adminClient = createAdminClient();

  // Clips
  const { data: clips } = await adminClient.from('clips').select('id, status');
  const allClips = (clips as Clip[]) || [];
  const totalClips = allClips.length;
  const pendingClips = allClips.filter((c) => c.status === 'pending').length;

  // Earnings
  const { data: earnings } = await adminClient
    .from('earnings')
    .select('amount, eligible_views');

  const allEarnings = (earnings as Earning[]) || [];
  const totalEarnings = allEarnings.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );
  const totalViews = allEarnings.reduce(
    (sum, e) => sum + Number(e.eligible_views || 0),
    0
  );

  // Pending Payouts
  const { data: payouts } = await adminClient
    .from('payout_requests')
    .select('amount, status');

  const allPayouts = (payouts as { amount: number; status: string }[]) || [];
  const pendingPayouts = allPayouts
    .filter((p) => p.status === 'pending' || p.status === 'approved')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Active Campaigns
  const today = new Date().toISOString().split('T')[0];
  const { data: campaigns } = await adminClient
    .from('campaigns')
    .select('id')
    .eq('is_active', true)
    .lte('start_date', today)
    .gte('end_date', today);

  const activeCampaigns = (campaigns || []).length;

  return {
    stats: {
      totalClips,
      pendingClips,
      totalViews,
      totalEarnings,
      pendingPayouts,
      activeCampaigns,
    },
  };
}

/**
 * Admin: Get all clips with filters
 */
export async function getAdminClipsAction(
  statusFilter?: string,
  campaignIdFilter?: string
): Promise<{ clips: AdminClipView[]; error?: string }> {
  const { isAdmin } = await getCurrentProfile();
  if (!isAdmin) {
    return { clips: [], error: 'Unauthorized: Admin access required' };
  }

  const adminClient = createAdminClient();

  let query = adminClient
    .from('clips')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(1000);

  if (statusFilter && ['pending', 'reviewing', 'approved', 'rejected'].includes(statusFilter)) {
    query = query.eq('status', statusFilter as 'pending' | 'reviewing' | 'approved' | 'rejected');
  }

  if (campaignIdFilter) {
    query = query.eq('campaign_id', campaignIdFilter);
  }

  const { data: clips, error: clipsError } = await query;
  if (clipsError || !clips) {
    return { clips: [], error: clipsError?.message || 'Failed to fetch clips' };
  }

  const typedClips = clips as Clip[];
  if (typedClips.length === 0) {
    return { clips: [] };
  }

  const clipIds = typedClips.map((c) => c.id);
  const userIds = Array.from(new Set(typedClips.map((c) => c.user_id)));
  const campaignIds = Array.from(new Set(typedClips.map((c) => c.campaign_id)));

  // Independent enrichment queries run concurrently to keep the admin review queue quick.
  const [profilesResult, campaignsResult, snapshotsResult, earningsResult] = await Promise.all([
    adminClient.from('profiles').select('user_id, display_name, instagram_handle').in('user_id', userIds),
    adminClient.from('campaigns').select('*').in('id', campaignIds),
    adminClient.from('metric_snapshots').select('*').in('clip_id', clipIds).order('fetched_at', { ascending: false }),
    adminClient.from('earnings').select('*').in('clip_id', clipIds),
  ]);

  const profileMap = new Map<string, Profile>();
  (profilesResult.data as Profile[] || []).forEach((profile) => profileMap.set(profile.user_id, profile));

  const campaignMap = new Map<string, Campaign>();
  (campaignsResult.data as Campaign[] || []).forEach((campaign) => campaignMap.set(campaign.id, campaign));

  const snapshotMap = new Map<string, MetricSnapshot>();
  (snapshotsResult.data as MetricSnapshot[] || []).forEach((snapshot) => {
    if (!snapshotMap.has(snapshot.clip_id)) snapshotMap.set(snapshot.clip_id, snapshot);
  });

  const earningsMap = new Map<string, Earning>();
  (earningsResult.data as Earning[] || []).forEach((earning) => earningsMap.set(earning.clip_id, earning));

  const result: AdminClipView[] = typedClips.map((clip) => {
    const prof = profileMap.get(clip.user_id);
    return {
      ...clip,
      clipper: {
        userId: clip.user_id,
        displayName: prof?.display_name || 'Anonymous Clipper',
        instagramHandle: prof?.instagram_handle || null,
      },
      campaign: campaignMap.get(clip.campaign_id)!,
      latestSnapshot: snapshotMap.get(clip.id) || null,
      earnings: earningsMap.get(clip.id) || null,
    };
  });

  return { clips: result };
}

/**
 * Admin: Approve clip with verified eligible views
 * Atomic transaction:
 * 1. Lock clip & verify status === 'pending'
 * 2. Calculate earnings using campaign rate: (eligible_views / 1000) * rate_per_1000
 * 3. Update clip status to 'approved'
 * 4. Insert/update earnings record
 * 5. Insert metric snapshot
 * 6. Write audit log
 */
export async function approveClipAction(
  clipId: string,
  eligibleViews: number
): Promise<{ success: boolean; amount?: number; error?: string }> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

  if (eligibleViews < 0 || !Number.isInteger(eligibleViews)) {
    return {
      success: false,
      error: 'Eligible views must be a non-negative integer.',
    };
  }

  const adminClient = createAdminClient();

  // 1. Fetch clip
  const { data: clipData, error: clipError } = await adminClient
    .from('clips')
    .select('*')
    .eq('id', clipId)
    .single();

  if (clipError || !clipData) {
    return { success: false, error: 'Clip not found.' };
  }

  const clip = clipData as Clip;
  if (clip.status !== 'pending') {
    return { success: false, error: `Clip is already marked as ${clip.status}.` };
  }

  // 2. Fetch campaign
  const { data: campaignData, error: campError } = await adminClient
    .from('campaigns')
    .select('*')
    .eq('id', clip.campaign_id)
    .single();

  if (campError || !campaignData) {
    return { success: false, error: 'Associated campaign not found.' };
  }

  const campaign = campaignData as Campaign;

  // 3. Calculate earnings: eligible_views / 1000 * rate_per_1000
  const ratePer1000 = Number(campaign.rate_per_1000);
  const calculatedEarnings = Number(
    ((eligibleViews / 1000) * ratePer1000).toFixed(2)
  );

  // 4. Update clip status
  const { error: updateError } = await adminClient
    .from('clips')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', clipId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // 5. Insert or update earnings record
  const { error: earnError } = await adminClient.from('earnings').upsert(
    {
      clip_id: clipId,
      user_id: clip.user_id,
      campaign_id: clip.campaign_id,
      eligible_views: eligibleViews,
      rate_per_1000: ratePer1000,
      amount: calculatedEarnings,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: 'clip_id' }
  );

  if (earnError) {
    console.error('Earnings record insert failed:', earnError);
  }

  // 6. Record metric snapshot
  await adminClient.from('metric_snapshots').insert({
    clip_id: clipId,
    eligible_views: eligibleViews,
    source: 'admin_verification',
  });

  // 7. Write audit log
  await adminClient.from('audit_logs').insert({
    admin_id: user.id,
    action: 'approve_clip',
    target_table: 'clips',
    target_id: clipId,
    new_values: {
      status: 'approved',
      eligible_views: eligibleViews,
      rate_per_1000: ratePer1000,
      earnings_amount: calculatedEarnings,
    },
  });

  revalidatePath('/admin/clips');
  revalidatePath('/admin');
  revalidatePath('/dashboard/clips');
  revalidatePath('/dashboard');

  return { success: true, amount: calculatedEarnings };
}

/**
 * Admin: Reject clip
 */
export async function rejectClipAction(
  clipId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

  const adminClient = createAdminClient();

  const { data: clipData, error: clipError } = await adminClient
    .from('clips')
    .select('status')
    .eq('id', clipId)
    .single();

  if (clipError || !clipData) {
    return { success: false, error: 'Clip not found.' };
  }

  const { error: updateError } = await adminClient
    .from('clips')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq('id', clipId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await adminClient.from('audit_logs').insert({
    admin_id: user.id,
    action: 'reject_clip',
    target_table: 'clips',
    target_id: clipId,
    old_values: { status: (clipData as Clip).status },
    new_values: { status: 'rejected', reason: reason || 'Not specified' },
  });

  revalidatePath('/admin/clips');
  revalidatePath('/admin');
  revalidatePath('/dashboard/clips');

  return { success: true };
}

/**
 * Admin: Get audit logs with admin profiles
 */
export async function getAuditLogsAction(): Promise<{
  logs: (AuditLog & { adminName: string })[];
  error?: string;
}> {
  const { isAdmin } = await getCurrentProfile();
  if (!isAdmin) {
    return { logs: [], error: 'Unauthorized: Admin access required' };
  }

  const adminClient = createAdminClient();

  const { data: logs, error } = await adminClient
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !logs) {
    return { logs: [], error: error?.message || 'Failed to load audit logs' };
  }

  const adminIds = Array.from(new Set(logs.map((l) => l.admin_id)));
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('user_id, display_name')
    .in('user_id', adminIds);

  const profileMap = new Map<string, string>();
  (profiles as Profile[] || []).forEach((p) =>
    profileMap.set(p.user_id, p.display_name || 'Admin')
  );

  const result = (logs as AuditLog[]).map((log) => ({
    ...log,
    adminName: profileMap.get(log.admin_id) || 'Admin',
  }));

  return { logs: result };
}
