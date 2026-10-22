'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createPrizeRaceAction,
  finalizePrizeRaceDrawAction,
  getAdminPrizeRaceDataAction,
  setContestEligibilityAction,
  setContestEligibilityBulkAction,
  setPrizeRaceEntryModeAction,
  setPrizeRaceStatusAction,
} from '@/actions/community';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  Award, CalendarClock, Check, ChevronDown, CircleDollarSign, Crown,
  Loader2, Pause, Play, Plus, Search, Shuffle, Sparkles, Target, Trophy, Users,
} from 'lucide-react';

type Race = {
  id: string; title: string; description: string; goal_approved_clips: number;
  prize_amount_inr: number | string; status: string; starts_at: string; ends_at: string | null;
  winner_user_id: string | null; winner_approved_clip_count: number | null; winner_at: string | null;
  entry_mode: 'open' | 'selected'; draw_seed_commitment?: string | null; draw_at?: string | null; draw_eligible_count?: number | null;
};
type ProfileRow = { user_id: string; display_name: string | null; instagram_handle: string | null; role: string };
type Participant = { contest_id: string; user_id: string; eligible_by_admin: boolean; opted_in: boolean; joined_at: string | null };

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function AdminPrizeRacesPage() {
  const [races, setRaces] = useState<Race[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyRaceId, setBusyRaceId] = useState<string | null>(null);
  const [managingRaceId, setManagingRaceId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [busyBatch, setBusyBatch] = useState(false);
  const [busyModeRaceId, setBusyModeRaceId] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<'open' | 'selected'>('open');
  const [title, setTitle] = useState('5 Clip Sprint');
  const [description, setDescription] = useState('Join before the deadline and get the target number of clips submitted during the contest approved. Every eligible clipper enters one fair random draw after all contest-period submissions have been reviewed.');
  const [goal, setGoal] = useState('5');
  const [prize, setPrize] = useState('500');
  const [startsDate, setStartsDate] = useState(() => localDateTimeValue(new Date()).split('T')[0]);
  const [startsTime, setStartsTime] = useState(() => localDateTimeValue(new Date()).split('T')[1]);
  const [endsDate, setEndsDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return localDateTimeValue(date).split('T')[0];
  });
  const [endsTime, setEndsTime] = useState('23:59');
  const [startImmediately, setStartImmediately] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getAdminPrizeRaceDataAction();
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setRaces((result.races || []) as Race[]);
    setProfiles((result.profiles || []) as ProfileRow[]);
    setParticipants((result.participants || []) as Participant[]);
    setManagingRaceId((current) => current || (result.races?.[0]?.id ?? null));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const selectedRace = races.find((race) => race.id === managingRaceId) || null;
  const selectedRaceMembers = useMemo(() => participants.filter((row) => row.contest_id === managingRaceId), [participants, managingRaceId]);
  const activeCount = races.filter((race) => race.status === 'active').length;
  const completeCount = races.filter((race) => race.status === 'completed').length;
  const invitedCount = selectedRaceMembers.filter((row) => row.eligible_by_admin).length;
  const joinedCount = selectedRaceMembers.filter((row) => row.eligible_by_admin && row.opted_in).length;
  const filteredProfiles = profiles.filter((profile) => {
    const q = userSearch.trim().toLowerCase();
    return !q || `${profile.display_name || ''} ${profile.instagram_handle || ''}`.toLowerCase().includes(q);
  });

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startsDate || !startsTime || !endsDate || !endsTime) {
      toast.error('Choose both a start date/time and an end date/time.');
      return;
    }
    const startLocal = new Date(`${startsDate}T${startsTime}`);
    const endLocal = new Date(`${endsDate}T${endsTime}`);
    if (!Number.isFinite(startLocal.getTime()) || !Number.isFinite(endLocal.getTime())) {
      toast.error('Please choose valid start and end dates/times.');
      return;
    }
    if (endLocal <= startLocal) {
      toast.error('The contest end must be later than the start.');
      return;
    }
    if (endLocal.getTime() <= Date.now()) {
      toast.error('Choose an end date/time in the future.');
      return;
    }
    setCreating(true);
    const result = await createPrizeRaceAction({
      title,
      description,
      goalApprovedClips: Number(goal),
      prizeAmountInr: Number(prize),
      startsAt: startLocal.toISOString(),
      endsAt: endLocal.toISOString(),
      startImmediately,
      entryMode,
    });
    setCreating(false);
    if (!result.success) { toast.error(result.error || 'Could not create the race.'); return; }
    toast.success(result.message || 'Prize draw created.');
    if (result.race?.id) setManagingRaceId(result.race.id);
    await refresh();
  }

  async function toggleEligibility(profile: ProfileRow, enabled: boolean) {
    if (!managingRaceId) return;
    setBusyUserId(profile.user_id);
    const result = await setContestEligibilityAction(managingRaceId, profile.user_id, enabled);
    setBusyUserId(null);
    if (!result.success) { toast.error(result.error || 'Could not update eligibility.'); return; }
    toast.success(result.message || 'Updated.');
    await refresh();
  }

  async function bulkToggleEligibility(enabled: boolean) {
    if (!managingRaceId || !selectedUserIds.length) return;
    setBusyBatch(true);
    const result = await setContestEligibilityBulkAction(managingRaceId, selectedUserIds, enabled);
    setBusyBatch(false);
    if (!result.success) { toast.error(result.error || 'Could not update the selected clippers.'); return; }
    toast.success(result.message || 'Selected clippers updated.');
    setSelectedUserIds([]);
    await refresh();
  }

  async function changeEntryMode(race: Race, mode: 'open' | 'selected') {
    setBusyModeRaceId(race.id);
    const result = await setPrizeRaceEntryModeAction(race.id, mode);
    setBusyModeRaceId(null);
    if (!result.success) { toast.error(result.error || 'Could not change race access.'); return; }
    toast.success(result.message || 'Race access updated.');
    setSelectedUserIds([]);
    await refresh();
  }

  async function drawWinner(race: Race) {
    const confirmed = window.confirm(`Close the pool and draw one winner for “${race.title}”? This can happen only once. All contest-period submissions from joined users must be approved or rejected first.`);
    if (!confirmed) return;
    setBusyRaceId(race.id);
    const result = await finalizePrizeRaceDrawAction(race.id);
    setBusyRaceId(null);
    if (!result.success) { toast.error(result.error || 'Could not complete the draw.'); return; }
    toast.success(result.message || 'Draw complete.');
    await refresh();
  }

  async function changeStatus(race: Race, status: 'draft' | 'active' | 'paused' | 'cancelled') {
    setBusyRaceId(race.id);
    const result = await setPrizeRaceStatusAction(race.id, status);
    setBusyRaceId(null);
    if (!result.success) { toast.error(result.error || 'Could not update race.'); return; }
    toast.success(result.message || 'Race updated.');
    await refresh();
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-amber-200/15 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,.2),transparent_42%),radial-gradient(ellipse_at_bottom_left,rgba(217,70,239,.12),transparent_45%),linear-gradient(130deg,#17152a,#090f20_70%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.28)] sm:p-8">
        <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full border border-amber-200/10 sm:h-72 sm:w-72" aria-hidden="true" />
        <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/[0.08] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.2em] text-amber-100"><Sparkles className="h-3.5 w-3.5" /> Competition control room</div>
            <h1 className="text-3xl font-black tracking-[-.055em] text-white sm:text-4xl lg:text-5xl">Turn approvals into <span className="text-amber-200">a fair prize draw.</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Set a target and prize, then draw one winner from everyone who joined and reached the target. The draw waits until the end time and all contest-period clips have been reviewed, so approval order cannot decide the winner.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:w-[360px]">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">Active</p><p className="mt-2 text-2xl font-black text-white">{activeCount}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">Completed</p><p className="mt-2 text-2xl font-black text-white">{completeCount}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:text-[10px]">Eligible</p><p className="mt-2 text-2xl font-black text-white">{invitedCount}</p><p className="text-[10px] text-slate-500">selected race</p></div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(300px,.78fr)_minmax(0,1.22fr)]">
        <section className="rounded-3xl border border-white/[0.08] bg-slate-950/50 p-4 shadow-xl sm:p-6">
          <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-200/20 bg-amber-300/10 text-amber-100"><Plus className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold text-white">Create a prize draw</h2><p className="text-xs text-slate-400">Choose an open contest or invite a selected group.</p></div></div>
          <form className="space-y-4" onSubmit={onCreate}>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Race name</span><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required minLength={3} className="border-white/10 bg-white/[0.035]" placeholder="5 Clip Sprint" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} className="w-full resize-y rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" placeholder="Explain the race rules" /></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Who can enter?</span><select value={entryMode} onChange={(e) => setEntryMode(e.target.value as 'open' | 'selected')} className="h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-amber-200/30"><option value="open">Open to all clippers — they can join on the website</option><option value="selected">Selected clippers only — use bulk selection below</option></select><span className="block text-[11px] leading-5 text-slate-500">Open contests appear to every clipper. Selected contests only appear to users you add.</span></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Approved clips to qualify</span><Input type="number" min="1" max="10000" step="1" value={goal} onChange={(e) => setGoal(e.target.value)} required className="border-white/10 bg-white/[0.035]" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Prize (INR)</span><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₹</span><Input type="number" min="0.01" max="1000000" step="0.01" value={prize} onChange={(e) => setPrize(e.target.value)} required className="border-white/10 bg-white/[0.035] pl-7" /></div></label>
            </div>
            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4">
              <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-200" /><p className="text-sm font-bold text-white">Contest timeline</p></div>
              <p className="text-[11px] leading-5 text-slate-500">Pick the date and time separately. Times use your local timezone.</p>
              <p className="pt-1 text-xs font-semibold text-slate-300">Starts</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0 space-y-1.5"><span className="text-[11px] font-medium text-slate-400">Start date</span><Input type="date" value={startsDate} onChange={(e) => { const nextDate = e.target.value; setStartsDate(nextDate); if (endsDate && nextDate && endsDate < nextDate) setEndsDate(nextDate); }} required className="min-w-0 border-white/10 bg-slate-900 text-white [color-scheme:dark]" /></label>
                <label className="block min-w-0 space-y-1.5"><span className="text-[11px] font-medium text-slate-400">Start time</span><Input type="time" value={startsTime} onChange={(e) => setStartsTime(e.target.value)} required className="min-w-0 border-white/10 bg-slate-900 text-white [color-scheme:dark]" /></label>
              </div>
              <p className="pt-2 text-xs font-semibold text-slate-300">Ends</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block min-w-0 space-y-1.5"><span className="text-[11px] font-medium text-slate-400">End date</span><Input type="date" value={endsDate} min={startsDate || undefined} onChange={(e) => setEndsDate(e.target.value)} required className="min-w-0 border-white/10 bg-slate-900 text-white [color-scheme:dark]" /></label>
                <label className="block min-w-0 space-y-1.5"><span className="text-[11px] font-medium text-slate-400">End time</span><Input type="time" value={endsTime} min={endsDate === startsDate ? startsTime : undefined} onChange={(e) => setEndsTime(e.target.value)} required className="min-w-0 border-white/10 bg-slate-900 text-white [color-scheme:dark]" /></label>
              </div>
              <p className="text-[11px] leading-5 text-slate-500">The draw becomes available after the end time and after all contest-period submissions from participants have been reviewed.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><input type="checkbox" checked={startImmediately} onChange={(e) => setStartImmediately(e.target.checked)} className="mt-1 h-4 w-4 accent-amber-300" /><span><strong className="block text-sm text-white">Activate immediately</strong><span className="mt-0.5 block text-xs leading-5 text-slate-400">You can pause it later. {entryMode === 'open' ? 'All clippers can see this race and choose to join.' : 'Add a selected group after creating the race.'}</span></span></label>
            <Button type="submit" disabled={creating} className="h-11 w-full gap-2 bg-amber-300 font-extrabold text-slate-950 hover:bg-amber-200">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}{creating ? 'Creating…' : 'Create prize draw'}</Button>
          </form>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black tracking-tight text-white">Prize draws</h2><p className="mt-1 text-xs text-slate-400">Everyone who joins and meets the target goes into the end-of-contest draw.</p></div><Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading} className="border-white/10 bg-white/[0.03]">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}</Button></div>
          {loading ? <div className="rounded-2xl border border-white/10 bg-slate-950/40 py-12 text-center text-sm text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading races…</div> : races.length === 0 ? <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-12 text-center"><Trophy className="mx-auto h-9 w-9 text-amber-200/60" /><p className="mt-3 font-bold text-white">No races yet</p><p className="mt-1 text-sm text-slate-400">Create one, then select who may enter.</p></div> : races.map((race) => {
            const raceMembers = participants.filter((row) => row.contest_id === race.id);
            const invited = raceMembers.filter((row) => row.eligible_by_admin).length;
            const joined = raceMembers.filter((row) => row.eligible_by_admin && row.opted_in).length;
            const isSelected = managingRaceId === race.id;
            return <article key={race.id} className={`overflow-hidden rounded-2xl border transition ${isSelected ? 'border-amber-200/30 bg-amber-200/[0.045] shadow-[0_12px_40px_rgba(245,158,11,.05)]' : 'border-white/[0.08] bg-slate-950/45'}`}>
              <button type="button" onClick={() => { setManagingRaceId(isSelected ? null : race.id); setSelectedUserIds([]); }} className="flex w-full items-start gap-3 p-4 text-left sm:p-5"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-200/15 bg-amber-300/[0.08] text-amber-100"><Award className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-white">{race.title}</h3><Badge variant="secondary" className={`capitalize ${race.status === 'active' ? 'bg-emerald-400/10 text-emerald-200' : race.status === 'completed' ? 'bg-sky-400/10 text-sky-200' : 'bg-white/[0.08] text-slate-300'}`}>{race.status}</Badge></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{race.description || 'No description set.'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1.5 text-slate-300"><Target className="h-3 w-3" />Draw · {race.goal_approved_clips} approved to qualify</span><span className="inline-flex items-center gap-1 rounded-full bg-amber-300/10 px-2.5 py-1.5 font-bold text-amber-100"><CircleDollarSign className="h-3 w-3" />{formatCurrency(Number(race.prize_amount_inr))}</span><span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1.5 text-slate-400"><Users className="h-3 w-3" />{race.entry_mode === 'selected' ? `${joined}/${invited} joined` : `${joined} joined · open entry`}</span></div><p className="mt-2 text-[11px] text-slate-500"><CalendarClock className="mr-1 inline h-3 w-3" />{formatDateTime(race.starts_at)}{race.ends_at ? ` · ends ${formatDateTime(race.ends_at)}` : ' · no end date'}</p>{race.winner_user_id && <p className="mt-2 text-xs font-bold text-emerald-200"><Crown className="mr-1 inline h-3.5 w-3.5" />Draw complete · prize credited to winner</p>}{race.status === 'completed' && !race.winner_user_id && <p className="mt-2 text-xs font-bold text-slate-300">Draw complete · no one met the qualification target</p>}{race.draw_seed_commitment && <p className="mt-2 break-all text-[10px] text-slate-500">Seed committed before entry: {race.draw_seed_commitment}</p>}</div><ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition ${isSelected ? 'rotate-180' : ''}`} /></button>
              {isSelected && <div className="border-t border-white/[0.08] p-4 sm:p-5"><div className="mb-4 flex flex-wrap gap-2">{race.status === 'draft' || race.status === 'paused' ? <Button size="sm" onClick={() => void changeStatus(race, 'active')} disabled={busyRaceId === race.id} className="gap-1.5 bg-emerald-300 text-slate-950 hover:bg-emerald-200"><Play className="h-3.5 w-3.5" />Activate</Button> : race.status === 'active' ? <Button size="sm" variant="outline" onClick={() => void changeStatus(race, 'paused')} disabled={busyRaceId === race.id} className="gap-1.5 border-white/10"><Pause className="h-3.5 w-3.5" />Pause</Button> : null}{(race.status === 'active' || race.status === 'paused') && race.ends_at && new Date(race.ends_at).getTime() <= Date.now() && <Button size="sm" onClick={() => void drawWinner(race)} disabled={busyRaceId === race.id} className="gap-1.5 bg-amber-300 font-extrabold text-slate-950 hover:bg-amber-200">{busyRaceId === race.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}Draw winner</Button>}{race.status !== 'completed' && race.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => void changeStatus(race, 'cancelled')} disabled={busyRaceId === race.id} className="border-rose-300/20 text-rose-200 hover:bg-rose-400/10">Cancel race</Button>}{race.status !== 'completed' && race.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => void changeEntryMode(race, race.entry_mode === 'open' ? 'selected' : 'open')} disabled={busyModeRaceId === race.id} className="border-amber-200/20 text-amber-100">{busyModeRaceId === race.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Users className="mr-1 h-3.5 w-3.5" />}{race.entry_mode === 'open' ? 'Restrict to selected' : 'Open to all'}</Button>}</div>
                {race.entry_mode === 'selected' ? <>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-bold text-white">Clipper access</h4><p className="text-xs text-slate-400">Select many clippers, then add or remove them in one action. {joined} have joined.</p></div><label className="relative block sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Find a clipper…" className="h-9 border-white/10 bg-black/20 pl-9" /></label></div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={filteredProfiles.length > 0 && filteredProfiles.every((profile) => selectedUserIds.includes(profile.user_id))} onChange={(e) => setSelectedUserIds((current) => e.target.checked ? Array.from(new Set([...current, ...filteredProfiles.map((profile) => profile.user_id)])) : current.filter((id) => !filteredProfiles.some((profile) => profile.user_id === id)))} disabled={race.status === 'completed' || race.status === 'cancelled'} className="h-4 w-4 accent-amber-300" />Select filtered ({filteredProfiles.length})</label><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-slate-500">{selectedUserIds.length} selected</span><Button size="sm" onClick={() => void bulkToggleEligibility(true)} disabled={!selectedUserIds.length || busyBatch || race.status === 'completed' || race.status === 'cancelled'} className="h-8 bg-amber-300 text-xs font-extrabold text-slate-950 hover:bg-amber-200">{busyBatch ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Users className="mr-1 h-3.5 w-3.5" />}Add selected</Button><Button size="sm" variant="outline" onClick={() => void bulkToggleEligibility(false)} disabled={!selectedUserIds.length || busyBatch || race.status === 'completed' || race.status === 'cancelled'} className="h-8 border-white/10 text-xs">Remove selected</Button></div></div>
                <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">{filteredProfiles.map((profile) => { const membership = raceMembers.find((row) => row.user_id === profile.user_id); const eligible = Boolean(membership?.eligible_by_admin); return <div key={profile.user_id} className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-white/10 hover:bg-white/[0.035]"><input aria-label={`Select ${profile.display_name || profile.instagram_handle || 'clipper'} for bulk action`} type="checkbox" checked={selectedUserIds.includes(profile.user_id)} onChange={(e) => setSelectedUserIds((current) => e.target.checked ? [...current, profile.user_id] : current.filter((id) => id !== profile.user_id))} disabled={busyBatch || race.status === 'completed' || race.status === 'cancelled'} className="h-4 w-4 shrink-0 accent-amber-300" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-100">{profile.display_name || 'Unnamed clipper'}</p><p className="truncate text-xs text-slate-500">{profile.instagram_handle ? `@${profile.instagram_handle}` : 'No Instagram handle'}</p></div>{eligible ? <Badge variant="secondary" className="bg-emerald-400/10 text-[10px] text-emerald-200">Eligible</Badge> : <Badge variant="secondary" className="bg-white/[0.06] text-[10px] text-slate-400">Not added</Badge>}{membership?.opted_in && <Badge variant="secondary" className="bg-sky-400/10 text-[10px] text-sky-200">Joined <Check className="ml-1 h-3 w-3" /></Badge>}<Button size="sm" variant="outline" onClick={() => void toggleEligibility(profile, !eligible)} disabled={busyUserId === profile.user_id || busyBatch || race.status === 'completed' || race.status === 'cancelled'} className="h-7 border-white/10 px-2 text-[11px]">{busyUserId === profile.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : eligible ? 'Remove' : 'Add'}</Button></div>; })}{filteredProfiles.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No clippers match that search.</p>}</div>
                </> : <div className="rounded-2xl border border-emerald-200/15 bg-emerald-200/[0.04] p-4"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-emerald-200/15 bg-emerald-200/10 text-emerald-100"><Users className="h-4 w-4" /></div><div><h4 className="text-sm font-bold text-white">Open to all clippers</h4><p className="mt-1 text-xs leading-5 text-slate-400">This race is visible to every clipper on the website. They can enter themselves. No manual invites are needed. To run a private group race, switch to <strong className="text-slate-200">Restrict to selected</strong> above, then select as many clippers as you need and use the bulk Add selected button.</p></div></div></div>}

              </div>}
            </article>;
          })}
        </section>
      </div>
    </div>
  );
}
