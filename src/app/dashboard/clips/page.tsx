'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ClipStatusBadge } from '@/components/ClipStatusBadge';
import { getClipperClipsAction, syncClipMetricsAction, type ClipperClipView } from '@/actions/clips';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Film,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';

export default function ClipperClipsPage() {
  const [clips, setClips] = useState<ClipperClipView[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [syncingClipId, setSyncingClipId] = useState<string | null>(null);
  const [metricEditClip, setMetricEditClip] = useState<ClipperClipView | null>(null);
  const [metricViews, setMetricViews] = useState('');
  const [metricLikes, setMetricLikes] = useState('');
  const [savingMetrics, setSavingMetrics] = useState(false);

  const loadClips = useCallback(async () => {
    setLoading(true);
    // Load once; the status tabs below filter locally so switching views feels instant.
    const res = await getClipperClipsAction();
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      setClips(res.clips);
    }
  }, []);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  async function handleSyncMetrics(clipId: string) {
    setSyncingClipId(clipId);
    const res = await syncClipMetricsAction(clipId);
    setSyncingClipId(null);

    if (!res.success) {
      toast.error(res.error || 'Failed to synchronize Instagram metrics.');
    } else {
      toast.success('Instagram metrics synchronized!');
      loadClips();
    }
  }

  const counts = {
    all: clips.length,
    pending: clips.filter((c) => c.status === 'pending').length,
    reviewing: clips.filter((c) => c.status === 'reviewing').length,
    approved: clips.filter((c) => c.status === 'approved').length,
    rejected: clips.filter((c) => c.status === 'rejected').length,
  };
  const visibleClips = statusFilter === 'all' ? clips : clips.filter((clip) => clip.status === statusFilter);

  return (
    <div className="cp-clipper-clips space-y-6 sm:space-y-7">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-sky-300/15 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,.19),transparent_43%),radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,.14),transparent_45%),linear-gradient(130deg,#101b34,#080e1c_72%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.22)] sm:p-7 lg:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full border border-sky-200/10 sm:h-64 sm:w-64" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.19em] text-sky-200"><Sparkles className="h-3.5 w-3.5" /> Your creator workspace</div>
            <h1 className="text-3xl font-black tracking-[-.055em] text-white sm:text-4xl lg:text-5xl">Every Reel. <span className="text-sky-300">One clear status.</span></h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">Track reviews, update requested metrics, and see approved performance without hunting through pages.</p>
          </div>
          <Link href="/dashboard/submit" className="inline-flex shrink-0"><Button className="h-12 w-full gap-2 rounded-xl bg-sky-300 px-5 font-extrabold text-slate-950 shadow-lg shadow-sky-950/20 hover:bg-sky-200 sm:w-auto"><PlusCircle className="h-4 w-4" /> Submit New Reel <ArrowUpRight className="h-4 w-4" /></Button></Link>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total Reels', value: counts.all, tone: 'text-white', sub: 'All submissions' },
            { label: 'In review', value: counts.pending, tone: 'text-sky-200', sub: 'Waiting on admin' },
            { label: 'Update needed', value: counts.reviewing, tone: 'text-amber-200', sub: 'Views & likes' },
            { label: 'Approved', value: counts.approved, tone: 'text-emerald-200', sub: 'Earnings finalized' },
          ].map((item) => <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3.5 backdrop-blur sm:p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-500">{item.label}</p><p className={`mt-2 text-2xl font-black tabular-nums sm:text-3xl ${item.tone}`}>{item.value.toLocaleString('en-IN')}</p><p className="mt-1 text-[10px] text-slate-500 sm:text-xs">{item.sub}</p></div>)}
        </div>
      </section>

      {/* Filter tabs stay local for instant switching after the initial load. */}
      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950/45 p-2.5 sm:flex-wrap sm:overflow-visible sm:p-3">
        {[
          { key: 'all', label: 'All Clips' },
          { key: 'pending', label: 'Pending Review' },
          { key: 'reviewing', label: 'Reviewing — Update Metrics' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`min-h-10 shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-colors sm:text-sm ${
              statusFilter === tab.key
                ? 'border-sky-300/25 bg-sky-300/10 text-sky-200 shadow-[0_0_20px_rgba(56,189,248,.07)]'
                : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Loading your clips...</p>
            </div>
          ) : visibleClips.length === 0 ? (
            <div className="py-20 text-center space-y-4">
              <Film className="h-12 w-12 text-muted-foreground mx-auto opacity-30" />
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  No {statusFilter !== 'all' ? statusFilter : ''} clips found
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Submit a public Instagram Reel to earn from active brand campaigns.
                </p>
              </div>
              <Link href="/dashboard/submit">
                <Button size="sm">Submit Reel</Button>
              </Link>
            </div>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase tracking-wider bg-muted/20">
                    <th className="py-3 px-4 font-medium">Reel Shortcode</th>
                    <th className="py-3 px-4 font-medium">Campaign</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">Observed Views</th>
                    <th className="py-3 px-4 font-medium">Eligible Views</th>
                    <th className="py-3 px-4 font-medium">Earnings</th>
                    <th className="py-3 px-4 font-medium">Last Synced</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visibleClips.map((clip) => (
                    <tr key={clip.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-4 px-4 font-mono text-xs">
                        <div className="space-y-1">
                          <a
                            href={clip.instagram_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold"
                          >
                            {clip.shortcode}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <div className="text-[11px] text-muted-foreground font-sans">
                            Submitted {formatDate(clip.submitted_at)}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-medium">
                        <div>
                          <span>{clip.campaign?.name || 'General Campaign'}</span>
                          <div className="text-xs text-muted-foreground">
                            {clip.campaign ? `${formatCurrency(clip.campaign.rate_per_1000)} / 1k` : ''}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <ClipStatusBadge status={clip.status} />
                        {clip.status === 'reviewing' && <div className="mt-2 max-w-[240px] space-y-2"><p className="text-xs text-amber-300">Admin requested updated views and likes for this Reel.</p><button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" onClick={() => { setMetricEditClip(clip); setMetricViews(String((clip as any).self_reported_views ?? '')); setMetricLikes(String((clip as any).self_reported_likes ?? '')); }}>Update views & likes</button></div>}
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                          {clip.latestSnapshot?.observed_views != null ? (
                            <span className="font-semibold">
                              {formatNumber(clip.latestSnapshot.observed_views)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              Pending initial sync
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        {clip.earnings?.eligible_views != null ? (
                          <span className="font-semibold text-emerald-400">
                            {formatNumber(clip.earnings.eligible_views)}
                          </span>
                        ) : clip.status === 'pending' ? (
                          <span className="text-xs text-muted-foreground">
                            Awaiting review
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        {clip.earnings?.amount != null ? (
                          <span className="font-bold text-foreground">
                            {formatCurrency(clip.earnings.amount)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">₹0.00</span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-xs text-muted-foreground">
                        {clip.latestSnapshot?.fetched_at ? (
                          formatDateTime(clip.latestSnapshot.fetched_at)
                        ) : (
                          <span className="italic">Never</span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={syncingClipId === clip.id}
                          onClick={() => handleSyncMetrics(clip.id)}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${
                              syncingClipId === clip.id ? 'animate-spin' : ''
                            }`}
                          />
                          Sync
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 md:hidden sm:p-4">
              {visibleClips.map((clip) => (
                <article key={clip.id} className={`overflow-hidden rounded-2xl border bg-slate-950/70 shadow-lg ${clip.status === 'reviewing' ? 'border-amber-300/25' : clip.status === 'approved' ? 'border-emerald-300/15' : 'border-white/10'}`}>
                  <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] bg-white/[0.025] px-4 py-3">
                    <div className="min-w-0"><a href={clip.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-sky-200">{clip.shortcode}<ExternalLink className="h-3 w-3" /></a><p className="mt-1 truncate text-xs text-slate-400">{clip.campaign?.name || 'General Campaign'}</p><p className="mt-1 text-[10px] text-slate-600">Submitted {formatDate(clip.submitted_at)}</p></div><ClipStatusBadge status={clip.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-4">
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Observed views</p><p className="mt-1 text-lg font-black tabular-nums text-white">{clip.latestSnapshot?.observed_views != null ? formatNumber(clip.latestSnapshot.observed_views) : '—'}</p></div>
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Approved earnings</p><p className="mt-1 text-lg font-black tabular-nums text-emerald-200">{clip.earnings?.amount != null ? formatCurrency(clip.earnings.amount) : '₹0.00'}</p></div>
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Your reported views</p><p className="mt-1 text-base font-bold tabular-nums text-slate-200">{formatNumber(Number((clip as any).self_reported_views ?? 0))}</p></div>
                    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Your reported likes</p><p className="mt-1 text-base font-bold tabular-nums text-slate-200">{formatNumber(Number((clip as any).self_reported_likes ?? 0))}</p></div>
                    {clip.status === 'reviewing' && <div className="col-span-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3"><p className="text-xs font-bold text-amber-200">Action needed: update your views and likes</p><p className="mt-1 text-xs leading-5 text-slate-400">Admin requested fresh Reel metrics. Update the numbers shown on Instagram and resubmit.</p><button className="mt-3 min-h-11 w-full rounded-xl bg-amber-300 px-4 py-2 text-sm font-extrabold text-slate-950" onClick={() => { setMetricEditClip(clip); setMetricViews(String((clip as any).self_reported_views ?? '')); setMetricLikes(String((clip as any).self_reported_likes ?? '')); }}>Update views & likes</button></div>}
                    {clip.status === 'pending' && <p className="col-span-2 text-xs leading-5 text-sky-100/70">Your Reel is in the admin approval queue. Earnings update only after approval.</p>}
                  </div>
                </article>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>
      {metricEditClip && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-2xl" onSubmit={async (event) => { event.preventDefault(); const views = Number(metricViews), likes = Number(metricLikes); if (!Number.isSafeInteger(views) || views < 0 || views > 1_000_000_000 || !Number.isSafeInteger(likes) || likes < 0 || likes > 1_000_000_000) { toast.error('Enter valid whole-number counts.'); return; } setSavingMetrics(true); try { const response = await fetch(`/api/clips/${encodeURIComponent(metricEditClip.id)}/metrics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ views, likes }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Could not submit updated metrics.'); toast.success(body.message || 'Updated metrics submitted.'); setMetricEditClip(null); await loadClips(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not submit updated metrics.'); } finally { setSavingMetrics(false); } }}><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin requested an update</p><h2 className="mt-1 text-lg font-bold">Update Reel views & likes</h2><p className="mt-1 text-sm text-muted-foreground">Enter the current counts shown on Instagram. They are self-reported and will be reviewed by the admin.</p></div><label className="block space-y-1 text-sm font-medium">Current views<input required type="number" min="0" max="1000000000" step="1" value={metricViews} onChange={e => setMetricViews(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="block space-y-1 text-sm font-medium">Current likes<input required type="number" min="0" max="1000000000" step="1" value={metricLikes} onChange={e => setMetricLikes(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMetricEditClip(null)} disabled={savingMetrics}>Cancel</Button><Button type="submit" disabled={savingMetrics}>{savingMetrics ? 'Submitting…' : 'Submit updated metrics'}</Button></div></form></div>}
    </div>
  );
}
