'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from './auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Campaign } from '@/lib/types';

const CampaignSchema = z.object({
  name: z.string().min(2, 'Campaign name must be at least 2 characters'),
  description: z.string().optional(),
  ratePer1000: z
    .number()
    .positive('Rate per 1,000 views must be greater than $0.00'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  isActive: z.boolean().default(true),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  }
);

export type CampaignActionResult = {
  success: boolean;
  error?: string;
  campaign?: Campaign;
};

/**
 * Get active campaigns for clippers to submit clips to
 */
export async function getActiveCampaignsAction(): Promise<Campaign[]> {
  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', today)
    .gte('end_date', today)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch active campaigns:', error);
    return [];
  }

  return (data as Campaign[]) || [];
}

/**
 * Admin: Get all campaigns with performance stats
 */
export async function getAllCampaignsAction(): Promise<{
  campaigns: (Campaign & {
    totalClips: number;
    approvedClips: number;
    totalEligibleViews: number;
    totalEarnings: number;
  })[];
  error?: string;
}> {
  const { isAdmin } = await getCurrentProfile();
  if (!isAdmin) {
    return { campaigns: [], error: 'Unauthorized: Admin access required' };
  }

  const adminClient = createAdminClient();

  const { data: campaigns, error: campError } = await adminClient
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (campError || !campaigns) {
    return { campaigns: [], error: campError?.message || 'Failed to fetch campaigns' };
  }

  // Fetch clips and earnings aggregates
  const { data: clips } = await adminClient
    .from('clips')
    .select('id, campaign_id, status');

  const { data: earnings } = await adminClient
    .from('earnings')
    .select('campaign_id, eligible_views, amount');

  const result = (campaigns as Campaign[]).map((camp) => {
    const campClips = (clips || []).filter((c) => c.campaign_id === camp.id);
    const approvedClips = campClips.filter((c) => c.status === 'approved');
    const campEarnings = (earnings || []).filter((e) => e.campaign_id === camp.id);

    const totalEligibleViews = campEarnings.reduce(
      (sum, e) => sum + Number(e.eligible_views || 0),
      0
    );
    const totalEarnings = campEarnings.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    return {
      ...camp,
      totalClips: campClips.length,
      approvedClips: approvedClips.length,
      totalEligibleViews,
      totalEarnings,
    };
  });

  return { campaigns: result };
}

/**
 * Admin: Create a new campaign
 */
export async function createCampaignAction(
  formData: FormData
): Promise<CampaignActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    ratePer1000: parseFloat(formData.get('ratePer1000') as string),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    isActive: formData.get('isActive') === 'true' || formData.get('isActive') === 'on',
  };

  const parsed = CampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('campaigns')
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      rate_per_1000: parsed.data.ratePer1000,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      is_active: parsed.data.isActive,
    })
    .select('*')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const createdCampaign = data as Campaign;

  // Log action
  await adminClient.from('audit_logs').insert({
    admin_id: user.id,
    action: 'create_campaign',
    target_table: 'campaigns',
    target_id: createdCampaign.id,
    new_values: {
      name: createdCampaign.name,
      rate_per_1000: createdCampaign.rate_per_1000,
      start_date: createdCampaign.start_date,
      end_date: createdCampaign.end_date,
    },
  });

  revalidatePath('/admin/campaigns');
  revalidatePath('/dashboard/submit');

  return { success: true, campaign: createdCampaign };
}

/**
 * Admin: Update an existing campaign
 */
export async function updateCampaignAction(
  campaignId: string,
  formData: FormData
): Promise<CampaignActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

  const raw = {
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    ratePer1000: parseFloat(formData.get('ratePer1000') as string),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    isActive: formData.get('isActive') === 'true' || formData.get('isActive') === 'on',
  };

  const parsed = CampaignSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message };
  }

  const adminClient = createAdminClient();

  // Get existing for audit
  const { data: existing } = await adminClient
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  const { data, error } = await adminClient
    .from('campaigns')
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      rate_per_1000: parsed.data.ratePer1000,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      is_active: parsed.data.isActive,
    })
    .eq('id', campaignId)
    .select('*')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const updatedCampaign = data as Campaign;

  await adminClient.from('audit_logs').insert({
    admin_id: user.id,
    action: 'update_campaign',
    target_table: 'campaigns',
    target_id: campaignId,
    old_values: existing ? { ...existing } : null,
    new_values: { ...updatedCampaign },
  });

  revalidatePath('/admin/campaigns');
  revalidatePath('/dashboard/submit');

  return { success: true, campaign: updatedCampaign };
}
