'use server';

import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/actions/auth';
import { revalidatePath } from 'next/cache';

type RaceStatus = 'draft' | 'active' | 'paused' | 'cancelled';
type EntryMode = 'open' | 'selected';
type VisibilityScope = 'private' | 'participants' | 'selected';

type ActionResult = { success: boolean; error?: string; message?: string };

function dbClient() {
  return createAdminClient() as any;
}

function validId(value: string) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function drawIndexFromSeed(seed: string, contestId: string, tokens: string[]) {
  if (tokens.length < 1) return { index: null as number | null, counter: 0, hash: null as string | null };
  const limitSize = 1n << 256n;
  const n = BigInt(tokens.length);
  const acceptBelow = limitSize - (limitSize % n);
  let counter = 0;
  while (counter < 1000) {
    const hash = sha256Hex(`${seed}|${contestId}|${tokens.join('|')}|${counter}`);
    const value = BigInt(`0x${hash}`);
    if (value < acceptBelow) return { index: Number(value % n), counter, hash };
    counter += 1;
  }
  throw new Error('Could not generate a fair draw index.');
}

function revalidateCommunity() {
  revalidatePath('/dashboard/community');
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/payouts');
  revalidatePath('/admin/contests');
  revalidatePath('/admin/leaderboard');
  revalidatePath('/admin');
}

export async function getAdminPrizeRaceDataAction() {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { error: 'Admin access required.', races: [], profiles: [], participants: [] };
  const db = dbClient();
  const [raceResult, profileResult, participantResult] = await Promise.all([
    db.from('prize_contests').select('*').order('created_at', { ascending: false }),
    db.from('profiles').select('user_id, display_name, instagram_handle, role').eq('role', 'clipper').order('display_name'),
    db.from('contest_participants').select('*'),
  ]);
  const error = raceResult.error || profileResult.error || participantResult.error;
  if (error) return { error: error.message || 'Could not load prize-draw controls.', races: [], profiles: [], participants: [] };
  return {
    error: null,
    races: raceResult.data || [],
    profiles: profileResult.data || [],
    participants: participantResult.data || [],
  };
}

export async function createPrizeRaceAction(input: {
  title: string;
  description?: string;
  goalApprovedClips: number;
  prizeAmountInr: number;
  startsAt: string;
  endsAt?: string | null;
  startImmediately: boolean;
  entryMode?: EntryMode;
}): Promise<ActionResult & { race?: any }> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const goal = Number(input.goalApprovedClips);
  const prize = Number(input.prizeAmountInr);
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (title.length < 3 || title.length > 120) return { success: false, error: 'Title must be 3–120 characters.' };
  if (description.length > 2000) return { success: false, error: 'Description must be under 2,000 characters.' };
  if (!Number.isInteger(goal) || goal < 1 || goal > 10000) return { success: false, error: 'Approved-clip goal must be a whole number between 1 and 10,000.' };
  if (!Number.isFinite(prize) || prize <= 0 || prize > 1000000) return { success: false, error: 'Prize must be between ₹0.01 and ₹10,00,000.' };
  if (!Number.isFinite(startsAt.getTime())) return { success: false, error: 'Choose a valid start time.' };
  if (!endsAt || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return { success: false, error: 'Choose an end time after the start time. A draw happens after the contest closes.' };
  if (endsAt.getTime() <= Date.now()) return { success: false, error: 'Choose a future end time so participants have a real entry window.' };

  const db = dbClient();
  const drawSeed = randomBytes(32).toString('hex');
  const drawSeedCommitment = sha256Hex(Buffer.from(drawSeed, 'hex'));
  const { data, error } = await db.from('prize_contests').insert({
    title,
    description,
    goal_approved_clips: goal,
    prize_amount_inr: cents(prize),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt?.toISOString() || null,
    status: input.startImmediately ? 'active' : 'draft',
    entry_mode: input.entryMode === 'selected' ? 'selected' : 'open',
    draw_seed_commitment: drawSeedCommitment,
    created_by: user.id,
  }).select('*').single();
  if (error || !data) return { success: false, error: error?.message || 'Could not create the prize contest.' };
  const { error: secretError } = await db.from('prize_contest_draw_secrets').insert({ contest_id: data.id, draw_seed: drawSeed });
  if (secretError) {
    await db.from('prize_contests').delete().eq('id', data.id);
    return { success: false, error: 'The contest was not saved because its private draw seed could not be stored. Confirm migration 014 is applied, then retry.' };
  }
  revalidateCommunity();
  return { success: true, race: data, message: input.startImmediately ? 'Prize draw contest created.' : 'Draft prize draw contest created.' };
}

export async function finalizePrizeRaceDrawAction(contestId: string): Promise<ActionResult & { winnerUserId?: string | null; eligibleCount?: number }> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!validId(contestId)) return { success: false, error: 'Invalid contest.' };
  const db = dbClient();
  const { data: race, error: raceError } = await db.from('prize_contests').select('id, title, goal_approved_clips, prize_amount_inr, status, starts_at, ends_at, winner_user_id, draw_seed_commitment').eq('id', contestId).maybeSingle();
  if (raceError || !race) return { success: false, error: raceError?.message || 'Contest not found.' };
  if (!race.ends_at) return { success: false, error: 'This contest has no end time. Create a contest with a fixed end time to run a fair draw.' };
  if (new Date(race.ends_at).getTime() > Date.now()) return { success: false, error: 'The contest has not reached its end time yet.' };
  if (!['active', 'paused'].includes(race.status) || race.winner_user_id) return { success: false, error: 'This contest has already been drawn, cancelled, or is not eligible for drawing.' };
  if (!race.draw_seed_commitment) return { success: false, error: 'This contest is missing its precommitted draw seed. Apply migration 014 or recreate the contest.' };

  const { data: secret, error: secretError } = await db.from('prize_contest_draw_secrets').select('draw_seed').eq('contest_id', contestId).maybeSingle();
  if (secretError || !secret?.draw_seed) return { success: false, error: 'The private draw seed is missing. Do not draw this contest; contact support to inspect the migration.' };
  const seed = String(secret.draw_seed);
  if (sha256Hex(Buffer.from(seed, 'hex')) !== race.draw_seed_commitment) return { success: false, error: 'The precommitted draw seed does not match. No winner was selected.' };

  const { data: pool, error: poolError } = await db.rpc('admin_prize_contest_pool', { p_contest_id: contestId });
  if (poolError) return { success: false, error: poolError.message || 'Could not build the final eligible pool. Confirm migration 014 is applied.' };
  const rows = (pool || []) as { user_id: string; approved_clip_count: number | string; unresolved_clip_count: number | string }[];
  const unresolvedCount = rows.reduce((sum, row) => sum + Number(row.unresolved_clip_count || 0), 0);
  if (unresolvedCount > 0) {
    return { success: false, error: `${unresolvedCount} contest-period clip${unresolvedCount === 1 ? ' is' : 's are'} still pending or reviewing. Finish reviewing all contest-period submissions, then draw again.` };
  }

  const goal = Number(race.goal_approved_clips);
  const eligible = rows
    .map((row) => ({ user_id: row.user_id, approved_clips: Number(row.approved_clip_count || 0) }))
    .filter((row) => row.approved_clips >= goal)
    .map((row) => ({ ...row, token: sha256Hex(`${seed}:${contestId}:${row.user_id}`) }))
    .sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : 0));

  const tokens = eligible.map((row) => row.token);
  const draw = drawIndexFromSeed(seed, contestId, tokens);
  const winner = draw.index === null ? null : eligible[draw.index];
  const proof = {
    version: 1,
    algorithm: 'SHA-256 commit/reveal with rejection sampling; candidates sorted by SHA-256(seed:contestId:userId).',
    eligible_count: eligible.length,
    entries: eligible.map((row) => ({ token: row.token, approved_clips: row.approved_clips })),
    selected_index: draw.index,
    rejection_counter: draw.counter,
    selection_hash: draw.hash,
    winner_token: winner?.token || null,
  };
  const candidateRows = eligible.map((row) => ({ user_id: row.user_id, approved_clips: row.approved_clips, token: row.token }));
  const { data: finalizeResult, error: finalizeError } = await db.rpc('admin_finalize_prize_contest_draw', {
    p_contest_id: contestId,
    p_candidate_rows: candidateRows,
    p_draw_index: draw.index,
    p_draw_proof: proof,
    p_seed_revealed: seed,
    p_finalized_by: user.id,
  });
  if (finalizeError) return { success: false, error: finalizeError.message || 'The draw could not be finalized. Refresh and retry after checking the contest status.' };
  revalidateCommunity();
  const winnerUserId = finalizeResult?.winner_user_id ?? null;
  return {
    success: true,
    winnerUserId,
    eligibleCount: eligible.length,
    message: winnerUserId
      ? `Draw complete. ${eligible.length} eligible clipper${eligible.length === 1 ? '' : 's'} entered; the winner's ₹${cents(Number(race.prize_amount_inr)).toFixed(2)} prize has been credited.`
      : 'Draw complete, but no joined clipper reached the approved-clip target. No prize was awarded.',
  };
}

export async function setPrizeRaceStatusAction(raceId: string, status: RaceStatus): Promise<ActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!validId(raceId) || !['draft', 'active', 'paused', 'cancelled'].includes(status)) return { success: false, error: 'Invalid race or status.' };
  const db = dbClient();
  const { data: race, error: readError } = await db.from('prize_contests').select('*').eq('id', raceId).maybeSingle();
  if (readError || !race) return { success: false, error: readError?.message || 'Prize draw not found.' };
  if (race.winner_user_id || race.status === 'completed') return { success: false, error: 'A completed prize draw cannot be changed.' };
  if (status === 'cancelled' && race.ends_at && new Date(race.ends_at).getTime() <= Date.now()) {
    return { success: false, error: 'The contest has closed. Resolve all contest-period clips and run the draw instead of cancelling after the deadline.' };
  }
  if (status === 'active') {
    const now = Date.now();
    if (new Date(race.starts_at).getTime() > now) return { success: false, error: 'This contest has a future start time. Edit its start time before activating it.' };
    if (race.ends_at && new Date(race.ends_at).getTime() <= now) return { success: false, error: 'This contest has already passed its end time.' };
  }
  const { error } = await db.from('prize_contests').update({ status, updated_at: new Date().toISOString() }).eq('id', raceId);
  if (error) return { success: false, error: error.message };
  revalidateCommunity();
  return { success: true, message: `Prize draw ${status}.` };
}

export async function setPrizeRaceEntryModeAction(raceId: string, entryMode: EntryMode): Promise<ActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!validId(raceId) || !['open', 'selected'].includes(entryMode)) return { success: false, error: 'Invalid race access mode.' };
  const db = dbClient();
  const { data: race, error: readError } = await db.from('prize_contests').select('id, status, winner_user_id, ends_at').eq('id', raceId).maybeSingle();
  if (readError || !race) return { success: false, error: readError?.message || 'Prize draw not found.' };
  if (race.winner_user_id || race.status === 'completed' || race.status === 'cancelled') return { success: false, error: 'A completed or cancelled race cannot change entry access.' };
  if (race.ends_at && new Date(race.ends_at).getTime() <= Date.now()) return { success: false, error: 'Entry settings are locked after the contest end time.' };
  const { error } = await db.from('prize_contests').update({ entry_mode: entryMode, updated_at: new Date().toISOString() }).eq('id', raceId);
  if (error) return { success: false, error: error.message };
  revalidateCommunity();
  return { success: true, message: entryMode === 'open' ? 'This race is now open to all clippers.' : 'This race now accepts selected clippers only.' };
}

export async function setContestEligibilityAction(contestId: string, targetUserId: string, enabled: boolean): Promise<ActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!validId(contestId) || !validId(targetUserId)) return { success: false, error: 'Invalid contest or user.' };
  const db = dbClient();
  const [{ data: contest }, { data: profile }] = await Promise.all([
    db.from('prize_contests').select('id, status, ends_at').eq('id', contestId).maybeSingle(),
    db.from('profiles').select('user_id, role').eq('user_id', targetUserId).maybeSingle(),
  ]);
  if (!contest) return { success: false, error: 'Prize contest not found.' };
  if (contest.status === 'completed' || contest.status === 'cancelled') return { success: false, error: 'Entries cannot be changed for a completed or cancelled contest.' };
  if (contest.ends_at && new Date(contest.ends_at).getTime() <= Date.now()) return { success: false, error: 'Entries are locked after the contest end time.' };
  if (!profile || profile.role !== 'clipper') return { success: false, error: 'Only clipper accounts can be added.' };
  const { data: existing } = await db.from('contest_participants').select('id').eq('contest_id', contestId).eq('user_id', targetUserId).maybeSingle();
  let result;
  if (existing) {
    const updateValues: Record<string, unknown> = { eligible_by_admin: enabled, updated_at: new Date().toISOString() };
    if (!enabled) { updateValues.opted_in = false; updateValues.joined_at = null; }
    result = await db.from('contest_participants').update(updateValues).eq('contest_id', contestId).eq('user_id', targetUserId);
  } else {
    result = await db.from('contest_participants').insert({ contest_id: contestId, user_id: targetUserId, eligible_by_admin: enabled, opted_in: false, joined_at: null });
  }
  if (result.error) return { success: false, error: result.error.message };
  revalidateCommunity();
  return { success: true, message: enabled ? 'Clipper is eligible for this race.' : 'Clipper removed from race eligibility.' };
}

export async function setContestEligibilityBulkAction(contestId: string, targetUserIds: string[], enabled: boolean): Promise<ActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!validId(contestId) || !Array.isArray(targetUserIds) || typeof enabled !== 'boolean') {
    return { success: false, error: 'Invalid race or selection.' };
  }
  const ids = Array.from(new Set(targetUserIds.filter((id) => validId(id))));
  if (!ids.length || ids.length > 500 || ids.length !== targetUserIds.length) {
    return { success: false, error: 'Select between 1 and 500 valid clippers.' };
  }
  const db = dbClient();
  const [contestResult, profilesResult, existingResult] = await Promise.all([
    db.from('prize_contests').select('id, status, entry_mode, ends_at').eq('id', contestId).maybeSingle(),
    db.from('profiles').select('user_id, role').in('user_id', ids),
    db.from('contest_participants').select('user_id, opted_in, joined_at').eq('contest_id', contestId).in('user_id', ids),
  ]);
  if (contestResult.error || profilesResult.error || existingResult.error) return { success: false, error: 'Could not load the selected race/clippers. Refresh and try again.' };
  const contest = contestResult.data;
  const profiles = profilesResult.data;
  const existingRows = existingResult.data;
  if (!contest) return { success: false, error: 'Prize draw not found.' };
  if (contest.status === 'completed' || contest.status === 'cancelled') return { success: false, error: 'Participants cannot be changed for a completed or cancelled contest.' };
  if (contest.ends_at && new Date(contest.ends_at).getTime() <= Date.now()) return { success: false, error: 'The entrant list is locked after the contest deadline.' };
  const validProfiles = new Set((profiles || []).filter((profile: any) => profile.role === 'clipper').map((profile: any) => profile.user_id));
  if (validProfiles.size !== ids.length) return { success: false, error: 'One or more selected accounts are not clippers. Refresh the list and try again.' };
  const existingByUser = new Map<string, any>((existingRows || []).map((row: any) => [row.user_id, row] as [string, any]));
  const now = new Date().toISOString();
  const rows = ids.map((targetUserId) => {
    const existing = existingByUser.get(targetUserId);
    return {
      contest_id: contestId,
      user_id: targetUserId,
      eligible_by_admin: enabled,
      opted_in: enabled ? Boolean(existing?.opted_in) : false,
      joined_at: enabled ? (existing?.joined_at || null) : null,
      updated_at: now,
    };
  });
  const { error } = await db.from('contest_participants').upsert(rows, { onConflict: 'contest_id,user_id' });
  if (error) return { success: false, error: error.message || 'Could not update selected clippers.' };
  revalidateCommunity();
  return { success: true, message: `${ids.length} clipper${ids.length === 1 ? '' : 's'} ${enabled ? 'added to' : 'removed from'} the selected race.` };
}

export async function getAdminLeaderboardDataAction() {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { error: 'Admin access required.', users: [] };
  const db = dbClient();
  const [profilesResult, eligibilityResult, preferencesResult, statsResult] = await Promise.all([
    db.from('profiles').select('user_id, display_name, instagram_handle, role').eq('role', 'clipper').order('display_name'),
    db.from('leaderboard_eligibility').select('*'),
    db.from('leaderboard_preferences').select('*'),
    db.rpc('admin_clipper_stats'),
  ]);
  const error = profilesResult.error || eligibilityResult.error || preferencesResult.error || statsResult.error;
  if (error) return { error: error.message || 'Could not load leaderboard access and stats. Apply the latest community migration.', users: [] };
  const eligibility = new Map<string, any>((eligibilityResult.data || []).map((item: any) => [item.user_id, item] as [string, any]));
  const prefs = new Map<string, any>((preferencesResult.data || []).map((item: any) => [item.user_id, item] as [string, any]));
  const stats = new Map<string, any>((statsResult.data || []).map((item: any) => [item.user_id, item] as [string, any]));
  return {
    error: null,
    users: (profilesResult.data || []).map((profile: any) => {
      const access = eligibility.get(profile.user_id) as any;
      const pref = prefs.get(profile.user_id) as any;
      const stat = stats.get(profile.user_id) as any;
      return {
        ...profile,
        enabled: Boolean(access?.enabled_by_admin),
        featuredOnSite: Boolean(access?.featured_on_site),
        optedIn: Boolean(pref?.opted_in),
        visibilityScope: pref?.visibility_scope || 'private',
        displayAlias: pref?.display_alias || '',
        approvedClips: Number(stat?.approved_clips || 0),
        eligibleViews: Number(stat?.eligible_views || 0),
      };
    }),
  };
}

export async function setFeaturedStatsBulkAction(targetUserIds: string[], featured: boolean): Promise<ActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!Array.isArray(targetUserIds) || typeof featured !== 'boolean') return { success: false, error: 'Invalid selection.' };
  const ids = Array.from(new Set(targetUserIds.filter((id) => validId(id))));
  if (!ids.length || ids.length > 500 || ids.length !== targetUserIds.length) return { success: false, error: 'Select between 1 and 500 valid clippers.' };
  const db = dbClient();
  const [eligibilityResult, preferencesResult] = await Promise.all([
    db.from('leaderboard_eligibility').select('user_id, enabled_by_admin').in('user_id', ids),
    db.from('leaderboard_preferences').select('user_id, opted_in, visibility_scope').in('user_id', ids),
  ]);
  if (eligibilityResult.error || preferencesResult.error) return { success: false, error: 'Could not load leaderboard permissions. Refresh and try again.' };
  const eligibilityRows = eligibilityResult.data || [];
  const prefRows = preferencesResult.data || [];
  if (featured) {
    const enabledIds = new Set((eligibilityRows || []).filter((row: any) => row.enabled_by_admin).map((row: any) => row.user_id));
    const optedIds = new Set((prefRows || []).filter((row: any) => row.opted_in && row.visibility_scope !== 'private').map((row: any) => row.user_id));
    const invalid = ids.filter((id) => !enabledIds.has(id) || !optedIds.has(id));
    if (invalid.length) return { success: false, error: 'Only eligible, opted-in clippers who chose to share beyond private can be featured. Their selected-viewer permissions still apply.' };
    const { error } = await db.from('leaderboard_eligibility').update({ featured_on_site: true, updated_by: user.id, updated_at: new Date().toISOString() }).in('user_id', ids);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await db.from('leaderboard_eligibility').update({ featured_on_site: false, updated_by: user.id, updated_at: new Date().toISOString() }).in('user_id', ids);
    if (error) return { success: false, error: error.message };
  }
  revalidateCommunity();
  return { success: true, message: `${ids.length} clipper${ids.length === 1 ? '' : 's'} ${featured ? 'featured on' : 'removed from'} the community stats spotlight.` };
}

export async function setLeaderboardEligibilityAction(targetUserId: string, enabled: boolean): Promise<ActionResult> {
  const { user, isAdmin } = await getCurrentProfile();
  if (!user || !isAdmin) return { success: false, error: 'Admin access required.' };
  if (!validId(targetUserId) || typeof enabled !== 'boolean') return { success: false, error: 'Invalid user or access setting.' };
  const db = dbClient();
  const { data: profile } = await db.from('profiles').select('user_id, role').eq('user_id', targetUserId).maybeSingle();
  if (!profile || profile.role !== 'clipper') return { success: false, error: 'Only clipper accounts can be eligible.' };
  const { error } = await db.from('leaderboard_eligibility').upsert({ user_id: targetUserId, enabled_by_admin: enabled, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return { success: false, error: error.message };
  if (!enabled) {
    await Promise.all([
      db.from('leaderboard_preferences').upsert({ user_id: targetUserId, opted_in: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
      db.from('leaderboard_eligibility').update({ featured_on_site: false, updated_at: new Date().toISOString() }).eq('user_id', targetUserId),
    ]);
  }
  revalidateCommunity();
  return { success: true, message: enabled ? 'User can now opt into the leaderboard.' : 'Leaderboard eligibility disabled and participation switched off.' };
}

export async function getClipperCommunityDataAction() {
  const { user, profile, isAdmin } = await getCurrentProfile();
  if (!user || !profile || profile.role !== 'clipper' || isAdmin) return { error: 'Clipper account access required.', userId: null, races: [], leaderboard: [], eligible: false, preference: { optedIn: false, visibilityScope: 'private', displayAlias: '' }, eligibleViewers: [], allowedViewerIds: [] };
  const db = dbClient();
  const [membershipResult, allRaceResult, eligibilityResult, prefsResult, myAccessResult, allowedAsViewerResult, myAllowedViewerResult] = await Promise.all([
    db.from('contest_participants').select('*').eq('user_id', user.id),
    db.from('prize_contests').select('*').in('status', ['active', 'completed']).order('created_at', { ascending: false }),
    db.from('leaderboard_eligibility').select('*').eq('enabled_by_admin', true),
    db.from('leaderboard_preferences').select('*'),
    db.from('leaderboard_eligibility').select('enabled_by_admin').eq('user_id', user.id).maybeSingle(),
    db.from('leaderboard_allowed_viewers').select('owner_user_id').eq('viewer_user_id', user.id),
    db.from('leaderboard_allowed_viewers').select('viewer_user_id').eq('owner_user_id', user.id),
  ]);
  const dataError = membershipResult.error || allRaceResult.error || eligibilityResult.error || prefsResult.error || myAccessResult.error || allowedAsViewerResult.error || myAllowedViewerResult.error;
  if (dataError) return { error: 'Community features are not available yet. Confirm the prize-race/leaderboard database migration has been applied.', userId: user.id, races: [], leaderboard: [], eligible: false, preference: { optedIn: false, visibilityScope: 'private', displayAlias: '' }, eligibleViewers: [], allowedViewerIds: [] };

  const memberships = membershipResult.data || [];
  const membershipMap = new Map<string, any>(memberships.map((item: any) => [item.contest_id, item] as [string, any]));
  const visibleRaces = (allRaceResult.data || []).filter((race: any) => race.entry_mode !== 'selected' || membershipMap.has(race.id));
  const approvedResult = await db.from('clips').select('created_at, reviewed_at').eq('user_id', user.id).eq('status', 'approved');
  const approvedRows = (approvedResult.data || []) as { created_at: string | null; reviewed_at: string | null }[];
  const nowMs = Date.now();
  const races = visibleRaces.filter((race: any) => {
    const member = membershipMap.get(race.id) as any;
    return race.entry_mode !== 'selected' || member?.eligible_by_admin || race.status === 'completed';
  }).map((race: any) => {
    const member = membershipMap.get(race.id) as any;
    const startMs = Math.max(new Date(race.starts_at).getTime(), member?.joined_at ? new Date(member.joined_at).getTime() : Number.POSITIVE_INFINITY);
    const endMs = race.ends_at ? new Date(race.ends_at).getTime() : Number.POSITIVE_INFINITY;
    const count = member?.opted_in ? approvedRows.filter((clip) => clip.created_at && new Date(clip.created_at).getTime() >= startMs && new Date(clip.created_at).getTime() <= endMs).length : 0;
    return { ...race, optedIn: Boolean(member?.opted_in), eligibleByAdmin: race.entry_mode !== 'selected' || Boolean(member?.eligible_by_admin), progress: count, progressPercent: Math.min(100, Math.round((count / Math.max(1, Number(race.goal_approved_clips))) * 100)) };
  });
  const winnerIds = [...new Set(races.map((race: any) => race.winner_user_id).filter(Boolean))];
  let winners = new Map<string, string>();
  if (winnerIds.length) {
    const { data: winnerProfiles } = await db.from('profiles').select('user_id, display_name').in('user_id', winnerIds);
    winners = new Map<string, string>((winnerProfiles || []).map((profile: any) => [profile.user_id, profile.display_name || 'Clipper'] as [string, string]));
  }
  const racesWithWinner = races.map((race: any) => ({ ...race, winnerDisplayName: race.winner_user_id ? (winners.get(race.winner_user_id) || 'Clipper') : null }));

  const eligibilityRows = eligibilityResult.data || [];
  const eligibleIds = eligibilityRows.map((row: any) => row.user_id);
  const prefRows = prefsResult.data || [];
  const prefMap = new Map<string, any>(prefRows.map((row: any) => [row.user_id, row] as [string, any]));
  const profileResult = eligibleIds.length
    ? await db.from('profiles').select('user_id, display_name, instagram_handle').eq('role', 'clipper').in('user_id', eligibleIds)
    : { data: [], error: null };
  const eligibleProfiles = profileResult.data || [];
  const myPref = (prefMap.get(user.id) as any) || { user_id: user.id, opted_in: false, visibility_scope: 'private', display_alias: null };
  const eligible = Boolean(myAccessResult.data?.enabled_by_admin);
  const viewerIsParticipant = eligible && Boolean(myPref.opted_in);
  const allowedOwnerIds = new Set((allowedAsViewerResult.data || []).map((row: any) => row.owner_user_id));
  const eligibilityMap = new Map<string, any>(eligibilityRows.map((row: any) => [row.user_id, row] as [string, any]));
  const leaderboardCandidates = eligibleProfiles.map((profile: any) => {
    const pref = (prefMap.get(profile.user_id) as any) || {};
    const access = eligibilityMap.get(profile.user_id) || {};
    return { userId: profile.user_id, displayName: pref.display_alias || profile.display_name || 'Clipper', optedIn: Boolean(pref.opted_in), visibilityScope: pref.visibility_scope || 'private', featuredOnSite: Boolean(access.featured_on_site) };
  }).filter((entry: any) => entry.optedIn);
  const visibleCandidates = leaderboardCandidates.filter((entry: any) => {
    if (entry.userId === user.id) return eligible && Boolean(myPref.opted_in);
    if (entry.visibilityScope === 'participants') return viewerIsParticipant;
    if (entry.visibilityScope === 'selected') return allowedOwnerIds.has(entry.userId);
    return false;
  });
  const leaderboardIds = visibleCandidates.map((entry: any) => entry.userId);
  const visibleStatsResult = leaderboardIds.length
    ? await db.rpc('admin_clipper_stats')
    : { data: [], error: null };
  const statsMap = new Map<string, any>((visibleStatsResult.data || []).map((row: any) => [row.user_id, row] as [string, any]));
  const scoreMap = new Map<string, number>(Array.from(statsMap.entries()).map(([id, row]) => [id, Number(row.approved_clips || 0)]));
  const eligibleViewsMap = new Map<string, number>(Array.from(statsMap.entries()).map(([id, row]) => [id, Number(row.eligible_views || 0)]));
  const leaderboard = visibleCandidates.map((entry: any) => ({ ...entry, approvedClips: scoreMap.get(entry.userId) || 0, eligibleViews: eligibleViewsMap.get(entry.userId) || 0 }))
    .sort((a: any, b: any) => b.approvedClips - a.approvedClips || a.displayName.localeCompare(b.displayName))
    .map((entry: any, index: number) => ({ ...entry, rank: index + 1 }));
  const featuredStats = leaderboard.filter((entry: any) => entry.featuredOnSite);
  const eligibleViewers = eligibleProfiles.filter((profile: any) => profile.user_id !== user.id).map((profile: any) => {
    const viewerPreference = (prefMap.get(profile.user_id) as any) || {};
    return { userId: profile.user_id, displayName: viewerPreference.opted_in && viewerPreference.display_alias ? viewerPreference.display_alias : profile.display_name || 'Clipper' };
  });
  const allowedViewerIds = (myAllowedViewerResult.data || []).map((row: any) => row.viewer_user_id);
  return {
    userId: user.id,
    races: racesWithWinner,
    leaderboard,
    featuredStats,
    eligible,
    preference: { optedIn: Boolean(myPref.opted_in), visibilityScope: myPref.visibility_scope || 'private', displayAlias: myPref.display_alias || '' },
    eligibleViewers,
    allowedViewerIds,
    error: null,
  };
}

export async function setContestOptInAction(contestId: string, optedIn: boolean): Promise<ActionResult> {
  const { user, profile, isAdmin } = await getCurrentProfile();
  if (!user || !profile || profile.role !== 'clipper' || isAdmin) return { success: false, error: 'Clipper account access required.' };
  if (!validId(contestId) || typeof optedIn !== 'boolean') return { success: false, error: 'Invalid prize draw or entry setting.' };
  const db = dbClient();
  const [{ data: contest }, { data: member }] = await Promise.all([
    db.from('prize_contests').select('id, status, starts_at, ends_at, entry_mode').eq('id', contestId).maybeSingle(),
    db.from('contest_participants').select('*').eq('contest_id', contestId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (!contest || contest.status !== 'active') return { success: false, error: 'This prize draw is not accepting entries.' };
  const isOpenEntry = contest.entry_mode !== 'selected';
  if (!isOpenEntry && (!member || !member.eligible_by_admin)) return { success: false, error: 'This race is limited to selected clippers. Ask the admin to add you first.' };
  const now = Date.now();
  if (new Date(contest.starts_at).getTime() > now || (contest.ends_at && new Date(contest.ends_at).getTime() <= now)) return { success: false, error: 'The race is not currently open.' };
  const joinedAt = optedIn ? new Date().toISOString() : null;
  let result;
  if (member) {
    result = await db.from('contest_participants').update({ eligible_by_admin: isOpenEntry ? true : Boolean(member.eligible_by_admin), opted_in: optedIn, joined_at: joinedAt, updated_at: new Date().toISOString() }).eq('contest_id', contestId).eq('user_id', user.id);
  } else if (isOpenEntry && optedIn) {
    result = await db.from('contest_participants').insert({ contest_id: contestId, user_id: user.id, eligible_by_admin: true, opted_in: true, joined_at: joinedAt });
  } else {
    return { success: true, message: 'You are not entered in this race.' };
  }
  if (result.error) return { success: false, error: result.error.message };
  revalidateCommunity();
  return { success: true, message: optedIn ? 'You are entered. Clips submitted during the contest window count once approved; eligible clippers are drawn after the contest closes.' : 'You left the prize draw.' };
}

export async function saveLeaderboardSettingsAction(input: {
  optedIn: boolean;
  visibilityScope: VisibilityScope;
  displayAlias?: string;
  allowedViewerIds?: string[];
}): Promise<ActionResult> {
  const { user, profile, isAdmin } = await getCurrentProfile();
  if (!user || !profile || profile.role !== 'clipper' || isAdmin) return { success: false, error: 'Clipper account access required.' };
  if (!input || typeof input !== 'object') return { success: false, error: 'Invalid leaderboard settings.' };
  if (typeof input.optedIn !== 'boolean' || !['private', 'participants', 'selected'].includes(input.visibilityScope)) return { success: false, error: 'Invalid leaderboard visibility option.' };
  const alias = String(input.displayAlias || '').trim();
  if (alias.length > 40) return { success: false, error: 'Display name must be 40 characters or fewer.' };
  const db = dbClient();
  const { data: eligibility } = await db.from('leaderboard_eligibility').select('enabled_by_admin').eq('user_id', user.id).maybeSingle();
  if (input.optedIn && !eligibility?.enabled_by_admin) return { success: false, error: 'The admin must enable your leaderboard access before you can join.' };
  const requestedViewerIds = Array.isArray(input.allowedViewerIds) ? input.allowedViewerIds : [];
  const viewerIds = Array.from(new Set(requestedViewerIds.filter((id) => typeof id === 'string' && validId(id) && id !== user.id))).slice(0, 200);
  if (viewerIds.length) {
    const { data: allowedRows } = await db.from('leaderboard_eligibility').select('user_id').eq('enabled_by_admin', true).in('user_id', viewerIds);
    const allowed = new Set((allowedRows || []).map((row: any) => row.user_id));
    for (const id of viewerIds) if (!allowed.has(id)) return { success: false, error: 'Selected viewers must be approved for leaderboard access.' };
  }
  const { error: prefError } = await db.from('leaderboard_preferences').upsert({ user_id: user.id, opted_in: input.optedIn, visibility_scope: input.visibilityScope, display_alias: alias || null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (prefError) return { success: false, error: prefError.message };
  if (!input.optedIn) {
    await db.from('leaderboard_eligibility').update({ featured_on_site: false, updated_at: new Date().toISOString() }).eq('user_id', user.id);
  }
  const { error: deleteError } = await db.from('leaderboard_allowed_viewers').delete().eq('owner_user_id', user.id);
  if (deleteError) return { success: false, error: deleteError.message };
  if (input.visibilityScope === 'selected' && viewerIds.length) {
    const { error: insertError } = await db.from('leaderboard_allowed_viewers').insert(viewerIds.map((viewerUserId) => ({ owner_user_id: user.id, viewer_user_id: viewerUserId })));
    if (insertError) return { success: false, error: insertError.message };
  }
  revalidateCommunity();
  return { success: true, message: input.optedIn ? 'Leaderboard preferences saved.' : 'You are hidden from the leaderboard. Your settings have been saved.' };
}
