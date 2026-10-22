'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAdminLeaderboardDataAction, setFeaturedStatsBulkAction, setLeaderboardEligibilityAction } from '@/actions/community';
import { Check, Eye, EyeOff, Loader2, Search, ShieldCheck, Sparkles, Trophy, Users } from 'lucide-react';

type LeaderboardUser = { user_id: string; display_name: string | null; instagram_handle: string | null; enabled: boolean; optedIn: boolean; visibilityScope: string; displayAlias: string; featuredOnSite: boolean; approvedClips: number; eligibleViews: number };

export default function AdminLeaderboardAccessPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyEnabled, setOnlyEnabled] = useState(false);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getAdminLeaderboardDataAction();
    setLoading(false);
    if (result.error) { toast.error(result.error); return; }
    setUsers((result.users || []) as LeaderboardUser[]);
    setSelectedIds([]);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(() => users.filter((user) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || `${user.display_name || ''} ${user.instagram_handle || ''}`.toLowerCase().includes(q);
    return matchesSearch && (!onlyEnabled || user.enabled);
  }), [users, search, onlyEnabled]);
  const enabledCount = users.filter((user) => user.enabled).length;
  const optedCount = users.filter((user) => user.enabled && user.optedIn).length;
  const selectedUsers = users.filter((user) => selectedIds.includes(user.user_id));
  const canFeatureSelected = selectedUsers.length > 0 && selectedUsers.every((user) => user.enabled && user.optedIn && user.visibilityScope !== 'private');

  async function updateUsers(ids: string[], enabled: boolean) {
    if (!ids.length) return;
    setBusyIds(ids);
    const results = await Promise.all(ids.map((id) => setLeaderboardEligibilityAction(id, enabled)));
    setBusyIds([]);
    const failed = results.find((result) => !result.success);
    if (failed) toast.error(failed.error || 'Some access settings could not be changed.');
    else toast.success(`${ids.length} user${ids.length === 1 ? '' : 's'} ${enabled ? 'enabled' : 'disabled'} for leaderboard access.`);
    await refresh();
  }

  async function updateFeatured(ids: string[], featured: boolean) {
    if (!ids.length) return;
    setBusyIds(ids);
    const result = await setFeaturedStatsBulkAction(ids, featured);
    setBusyIds([]);
    if (!result.success) { toast.error(result.error || 'Could not update featured stats.'); return; }
    toast.success(result.message || 'Featured stats updated.');
    await refresh();
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-violet-200/15 bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,.22),transparent_42%),radial-gradient(ellipse_at_bottom_left,rgba(56,189,248,.13),transparent_48%),linear-gradient(130deg,#17152a,#090f20_70%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.28)] sm:p-8">
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div className="max-w-3xl"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200/20 bg-violet-200/[0.08] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.2em] text-violet-100"><ShieldCheck className="h-3.5 w-3.5" /> Private community controls</div><h1 className="text-3xl font-black tracking-[-.055em] text-white sm:text-4xl lg:text-5xl">You decide who gets <span className="text-violet-200">on the board.</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Only users enabled here can opt in. Users still choose whether to appear and can limit their row to themselves, other opted-in participants, or specific people.</p></div><div className="grid grid-cols-2 gap-3 lg:w-[280px]"><div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Allowed</p><p className="mt-2 text-3xl font-black text-white">{enabledCount}</p><p className="mt-1 text-xs text-slate-500">admin-approved</p></div><div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Opted in</p><p className="mt-2 text-3xl font-black text-white">{optedCount}</p><p className="mt-1 text-xs text-slate-500">currently participating</p></div></div></div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-slate-950/50 shadow-xl">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="text-lg font-extrabold text-white">Leaderboard access list</h2><p className="mt-1 text-xs text-slate-400">Select clippers to grant access or feature stats. They must opt in, and their privacy settings still decide who can see their stats.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative block sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clippers…" className="h-10 border-white/10 bg-black/20 pl-9" /></label><Button type="button" variant="outline" onClick={() => setOnlyEnabled((value) => !value)} className={`h-10 border-white/10 ${onlyEnabled ? 'bg-violet-300/10 text-violet-100' : 'bg-white/[0.03]'}`}>{onlyEnabled ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}{onlyEnabled ? 'Showing allowed' : 'All clippers'}</Button></div></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 sm:px-5"><label className="flex items-center gap-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={filtered.length > 0 && filtered.every((user) => selectedIds.includes(user.user_id))} onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((user) => user.user_id) : [])} className="h-4 w-4 accent-violet-300" />Select filtered ({filtered.length})</label><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void updateUsers(selectedIds, true)} disabled={!selectedIds.length || busyIds.length > 0} className="bg-violet-300 text-slate-950 hover:bg-violet-200">Enable selected</Button><Button size="sm" variant="outline" onClick={() => void updateUsers(selectedIds, false)} disabled={!selectedIds.length || busyIds.length > 0} className="border-white/10">Disable selected</Button><Button size="sm" onClick={() => void updateFeatured(selectedIds, true)} disabled={!canFeatureSelected || busyIds.length > 0} className="bg-emerald-300 text-slate-950 hover:bg-emerald-200">Feature stats</Button><Button size="sm" variant="outline" onClick={() => void updateFeatured(selectedIds, false)} disabled={!selectedIds.length || busyIds.length > 0} className="border-white/10">Hide stats</Button></div></div>
        {loading ? <div className="py-16 text-center text-sm text-slate-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading access controls…</div> : filtered.length === 0 ? <div className="py-14 text-center"><Users className="mx-auto h-8 w-8 text-slate-500" /><p className="mt-3 font-semibold text-white">No users match this filter</p></div> : <div className="divide-y divide-white/[0.06]">{filtered.map((user) => <div key={user.user_id} className="flex flex-col gap-3 px-4 py-4 transition hover:bg-white/[0.025] sm:px-5"><div className="flex min-w-0 flex-1 items-center gap-3"><input type="checkbox" checked={selectedIds.includes(user.user_id)} onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, user.user_id] : current.filter((id) => id !== user.user_id))} className="h-4 w-4 shrink-0 accent-violet-300" /><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] font-black text-slate-200">{(user.display_name || user.instagram_handle || 'C').slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user.display_name || 'Unnamed clipper'}</p><p className="truncate text-xs text-slate-500">{user.instagram_handle ? `@${user.instagram_handle}` : 'No Instagram handle'}</p></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{user.enabled ? <Badge variant="secondary" className="bg-emerald-300/10 text-emerald-100"><Check className="mr-1 h-3 w-3" />Allowed</Badge> : <Badge variant="secondary" className="bg-white/[0.06] text-slate-400">Not allowed</Badge>}{user.optedIn && <Badge variant="secondary" className="bg-sky-300/10 text-sky-100"><Trophy className="mr-1 h-3 w-3" />Opted in</Badge>}{user.enabled && <Badge variant="secondary" className="bg-violet-300/10 capitalize text-violet-100">{user.visibilityScope === 'selected' ? 'Selected viewers' : user.visibilityScope === 'participants' ? 'Participants' : 'Private'}</Badge>}{user.featuredOnSite && <Badge variant="secondary" className="bg-emerald-300/10 text-emerald-100">Featured on site</Badge>}<Button type="button" size="sm" variant={user.enabled ? 'outline' : 'default'} disabled={busyIds.includes(user.user_id)} onClick={() => void updateUsers([user.user_id], !user.enabled)} className={user.enabled ? 'border-white/10' : 'bg-violet-300 text-slate-950 hover:bg-violet-200'}>{busyIds.includes(user.user_id) ? <Loader2 className="h-4 w-4 animate-spin" /> : user.enabled ? 'Disable' : 'Allow'}</Button></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:pl-7"><div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Approved clips</p><p className="mt-1 text-sm font-black tabular-nums text-white">{user.approvedClips.toLocaleString('en-IN')}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Eligible views</p><p className="mt-1 text-sm font-black tabular-nums text-white">{user.eligibleViews.toLocaleString('en-IN')}</p></div><div className="rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2 sm:col-span-1 col-span-2"><p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">Stats sharing</p><p className="mt-1 text-xs font-semibold text-slate-300">{user.optedIn ? user.visibilityScope === 'participants' ? 'Opted-in participants' : user.visibilityScope === 'selected' ? 'Selected viewers only' : 'Private' : 'Not opted in'}</p></div></div></div>)}</div>}
        <div className="border-t border-white/[0.06] px-4 py-3 text-[11px] leading-5 text-slate-500 sm:px-5"><Sparkles className="mr-1 inline h-3.5 w-3.5 text-violet-200" />Feature stats only for users who have opted in and chosen to share beyond private. The website spotlight still obeys their visibility setting: private users stay hidden from others, while selected viewers/participants are honored.</div>
      </section>
    </div>
  );
}
