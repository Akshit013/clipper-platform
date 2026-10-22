'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ClipStatusBadge } from '@/components/ClipStatusBadge';
import {
  getAdminClipsAction,
  approveClipAction,
  rejectClipAction,
  type AdminClipView,
} from '@/actions/admin';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Film,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Eye,
  DollarSign,
  AlertCircle,
  Loader2,
  Instagram,
  User,
  RefreshCw,
  Search,
  Sparkles,
  ArrowUpRight,
  CheckCheck,
} from 'lucide-react';

export default function AdminClipsReviewPage() {
  const [clips, setClips] = useState<AdminClipView[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [eligibleViewsMap, setEligibleViewsMap] = useState<Record<string, string>>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [bulkReviewLoading, setBulkReviewLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const pendingClipIds = useMemo(() => clips.filter((clip) => clip.status === 'pending' && !clip.review_note).map((clip) => clip.id), [clips]);
  const returnedForApprovalCount = useMemo(() => clips.filter((clip) => clip.status === 'pending' && Boolean(clip.review_note)).length, [clips]);
  const newPendingCount = useMemo(() => clips.filter((clip) => clip.status === 'pending' && !clip.review_note).length, [clips]);
  const visibleClips = useMemo(() => {
    let rows = clips;
    if (statusFilter === 'updated') rows = rows.filter((clip) => clip.status === 'pending' && Boolean(clip.review_note));
    else if (statusFilter === 'pending') rows = rows.filter((clip) => clip.status === 'pending' && !clip.review_note);
    const q = searchText.trim().toLowerCase();
    if (q) rows = rows.filter((clip) => [clip.shortcode, clip.instagram_url, clip.clipper.displayName, clip.clipper.instagramHandle, clip.campaign?.name].some((value) => String(value ?? '').toLowerCase().includes(q)));
    return rows;
  }, [clips, statusFilter, searchText]);
  const firstBulkPageIds = pendingClipIds.slice(0, 100);
  const allPendingSelected = firstBulkPageIds.length > 0 && firstBulkPageIds.every((id) => selectedClipIds.includes(id));

  async function loadClips(filter?: string) {
    setLoading(true);
    // 'updated' is a sub-queue of pending clips, marked by the persistent review note.
    const queryFilter = filter === 'updated' ? 'pending' : filter;
    const filterParam = queryFilter && queryFilter !== 'all' ? queryFilter : undefined;
    const res = await getAdminClipsAction(filterParam);
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      setClips(res.clips);
      // Prepopulate eligible views map with observed views if available
      const initialMap: Record<string, string> = {};
      res.clips.forEach((c) => {
        if (c.earnings?.eligible_views != null) {
          initialMap[c.id] = c.earnings.eligible_views.toString();
        } else if (c.latestSnapshot?.observed_views != null) {
          initialMap[c.id] = c.latestSnapshot.observed_views.toString();
        } else {
          initialMap[c.id] = '0';
        }
      });
      setEligibleViewsMap(initialMap);
    }
  }

  useEffect(() => {
    setSelectedClipIds([]);
    loadClips(statusFilter);
  }, [statusFilter]);

  async function handleApprove(clip: AdminClipView) {
    const rawViews = eligibleViewsMap[clip.id];
    const views = parseInt(rawViews || '0', 10);

    if (isNaN(views) || views < 0) {
      toast.error('Please enter a valid non-negative number for eligible views.');
      return;
    }

    setActionLoadingId(clip.id);
    const result = await approveClipAction(clip.id, views);
    setActionLoadingId(null);

    if (!result.success) {
      toast.error(result.error || 'Failed to approve clip.');
    } else {
      toast.success(
        `Clip approved! Credited ${formatCurrency(result.amount || 0)} to clipper.`
      );
      loadClips(statusFilter);
    }
  }

  async function handleReject(clipId: string) {
    const reason = prompt('Please specify a rejection reason (optional):');
    if (reason === null) return; // User cancelled prompt

    setActionLoadingId(clipId);
    const result = await rejectClipAction(clipId, reason);
    setActionLoadingId(null);

    if (!result.success) {
      toast.error(result.error || 'Failed to reject clip.');
    } else {
      toast.success('Clip has been marked as rejected.');
      loadClips(statusFilter);
    }
  }

  async function handleSendToReview(clip: AdminClipView) {
    const reason = prompt(
      'Send this Reel back to the clipper to update views and likes. Add a note for them:',
      'Please update the current views and likes shown on Instagram, then resubmit for approval.'
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      toast.error('Please enter a short note explaining what the clipper should update.');
      return;
    }

    setActionLoadingId(clip.id);
    try {
      const response = await fetch('/api/admin/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_reviewing', id: clip.id, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not send this Reel for a metrics update.');
      toast.success('Sent back to the clipper. They can now update views and likes; the Reel will return to Pending Review after resubmission.');
      await loadClips(statusFilter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send this Reel for review.');
    } finally {
      setActionLoadingId(null);
    }
  }

  function handleSelectClip(clipId: string, selected: boolean) {
    if (!selected) {
      setSelectedClipIds((current) => current.filter((id) => id !== clipId));
      return;
    }
    if (selectedClipIds.includes(clipId)) return;
    if (selectedClipIds.length >= 100) {
      toast.error('Select up to 100 Reels per bulk review action.');
      return;
    }
    setSelectedClipIds((current) => current.includes(clipId) ? current : [...current, clipId]);
  }

  async function handleBulkSendToReview() {
    const ids = selectedClipIds.filter((id) => pendingClipIds.includes(id));
    if (!ids.length) {
      toast.error('Select at least one pending Reel first.');
      return;
    }
    const reason = window.prompt(
      `Send ${ids.length} Reel(s) back to their clippers to update views and likes. Add a note:`,
      'Please update the current views and likes shown on Instagram, then resubmit.'
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      toast.error('Please enter a note of at least 3 characters.');
      return;
    }

    setBulkReviewLoading(true);
    try {
      const response = await fetch('/api/admin/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_reviewing_bulk', ids, reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not send selected Reels for review.');
      toast.success(body.message || `${ids.length} Reel(s) sent for updated metrics.`);
      setSelectedClipIds([]);
      await loadClips(statusFilter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send selected Reels for review.');
    } finally {
      setBulkReviewLoading(false);
    }
  }

  return (
    <div className="cp-admin-review space-y-6 sm:space-y-7">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-sky-300/15 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,.19),transparent_42%),radial-gradient(ellipse_at_bottom_left,rgba(99,102,241,.17),transparent_45%),linear-gradient(130deg,#101a31,#080e1d_70%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,.24)] sm:p-7 lg:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full border border-sky-200/10 sm:h-72 sm:w-72" />
        <div aria-hidden="true" className="pointer-events-none absolute right-10 top-8 h-28 w-28 rounded-full bg-sky-400/10 blur-3xl sm:right-24 sm:top-10 sm:h-40 sm:w-40" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.2em] text-sky-200"><Sparkles className="h-3.5 w-3.5" /> Creator operations · Live queue</div>
            <h1 className="text-3xl font-black tracking-[-.055em] text-white sm:text-4xl lg:text-5xl">Reel review <span className="text-sky-300">control room.</span></h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Check the clipper&apos;s latest views and likes, send a Reel back for correction, and approve only the eligible views that should affect their balance.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-300">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2"><CheckCheck className="h-3.5 w-3.5 text-emerald-300" /> Approval controls earnings</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2"><RefreshCw className="h-3.5 w-3.5 text-amber-300" /> Updated clips are separated</span>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3 xl:w-[410px] xl:shrink-0">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Loaded in queue</p><p className="mt-2 text-3xl font-black tabular-nums text-white">{clips.length.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-slate-500">{statusFilter === 'pending' || statusFilter === 'updated' ? `${newPendingCount} new · ${returnedForApprovalCount} updated` : 'Current filter'}</p></div>
            <button type="button" onClick={() => setStatusFilter('updated')} aria-label="Open Reels returned by clippers for approval" className="rounded-2xl border border-amber-200/15 bg-amber-300/[0.07] p-4 text-left backdrop-blur transition hover:border-amber-200/30 hover:bg-amber-300/[0.11]"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-200/75">Returned by clippers</p><p className="mt-2 text-3xl font-black tabular-nums text-amber-100">{(statusFilter === 'pending' || statusFilter === 'updated' ? returnedForApprovalCount : 0).toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-amber-100/60">Ready for final check · Open queue ↗</p></button>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/45 p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Clip review queues">
          {[
            { key: 'pending', label: 'New submissions', icon: Film },
            { key: 'updated', label: 'Updated · Ready to approve', icon: CheckCircle2 },
            { key: 'reviewing', label: 'Awaiting clipper', icon: RefreshCw },
            { key: 'approved', label: 'Approved', icon: CheckCheck },
            { key: 'rejected', label: 'Rejected', icon: XCircle },
            { key: 'all', label: 'All clips', icon: Eye },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = statusFilter === tab.key;
            return <button key={tab.key} role="tab" aria-selected={active} onClick={() => setStatusFilter(tab.key)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition sm:text-sm ${active ? 'border-sky-300/30 bg-sky-300/10 text-sky-200 shadow-[0_0_24px_rgba(56,189,248,.08)]' : 'border-transparent text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white'}`}><Icon className="h-3.5 w-3.5" />{tab.label}</button>;
          })}
        </div>
        <label className="relative block w-full sm:w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search Reel, clipper, campaign…" className="h-10 rounded-xl border-white/10 bg-black/20 pl-9 text-sm placeholder:text-slate-600 focus-visible:ring-sky-400/30" />
        </label>
      </div>

      {statusFilter === 'updated' && (
        <section className="relative overflow-hidden rounded-2xl border border-emerald-300/20 bg-[linear-gradient(100deg,rgba(16,185,129,.11),rgba(8,15,29,.88)_72%)] p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-200"><CheckCheck className="h-5 w-5" /></div><div className="min-w-0"><p className="text-sm font-extrabold text-emerald-100 sm:text-base">Updated by clippers · Final approval needed</p><p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm">These Reels were sent back for fresh metrics and resubmitted. Check the newest reported views and likes below, enter the eligible views you verified, then Approve or Reject.</p></div></div>
        </section>
      )}

      {statusFilter === 'pending' && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={(event) => setSelectedClipIds(event.target.checked ? firstBulkPageIds : [])}
              disabled={pendingClipIds.length === 0 || bulkReviewLoading}
              className="h-4 w-4 accent-sky-400"
              aria-label="Select all pending Reels"
            />
            <span>Select first 100 pending Reels <span className="text-muted-foreground">({pendingClipIds.length} available)</span></span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">{selectedClipIds.filter((id) => pendingClipIds.includes(id)).length} selected</span>
            <Button size="sm" onClick={handleBulkSendToReview} disabled={bulkReviewLoading || selectedClipIds.filter((id) => pendingClipIds.includes(id)).length === 0} className="gap-2">
              {bulkReviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {bulkReviewLoading ? 'Sending…' : 'Send selected to Review'}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-muted-foreground space-y-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Loading review queue...</p>
            </div>
          ) : visibleClips.length === 0 ? (
            <div className="py-20 text-center space-y-2 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto opacity-30 text-emerald-400" />
              <p className="text-base font-semibold text-foreground">
                {searchText ? 'No matching Reels found' : statusFilter === 'updated' ? 'No updated Reels awaiting approval' : `No clips in the ${statusFilter} queue`}
              </p>
              <p className="text-xs">All caught up! Check back when new submissions arrive.</p>
            </div>
          ) : (
            <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1320px] table-fixed text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs text-muted-foreground uppercase tracking-wider bg-muted/20">
                    <th className="py-3 px-4 font-medium">Reel / Clipper</th>
                    <th className="py-3 px-4 font-medium">Campaign & Rate</th>
                    <th className="w-[150px] py-3 px-3 font-medium">Status</th>
                    <th className="w-[190px] py-3 px-3 font-medium">Clipper Reported Views / Likes</th>
                    <th className="py-3 px-4 font-medium">Observed Views</th>
                    <th className="py-3 px-4 font-medium">Verify Eligible Views</th>
                    <th className="py-3 px-4 font-medium">Calculated Earnings</th>
                    <th className="w-[300px] py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visibleClips.map((clip) => {
                    const currentEnteredViews = parseInt(
                      eligibleViewsMap[clip.id] || '0',
                      10
                    );
                    const rate = Number(clip.campaign?.rate_per_1000 || 0);
                    const calculated = isNaN(currentEnteredViews)
                      ? 0
                      : (currentEnteredViews / 1000) * rate;

                    const isActionLoading = actionLoadingId === clip.id;

                    return (
                      <tr key={clip.id} className={`transition-colors hover:bg-white/[0.035] ${statusFilter === 'updated' ? 'bg-emerald-300/[0.035]' : ''}`}>
                        <td className="py-4 px-4 font-mono text-xs">
                          <div className="flex min-w-[220px] items-start gap-3">
                            {statusFilter === 'pending' && clip.status === 'pending' && !clip.review_note && (
                              <input
                                type="checkbox"
                                checked={selectedClipIds.includes(clip.id)}
                                onChange={(event) => handleSelectClip(clip.id, event.target.checked)}
                                disabled={bulkReviewLoading || actionLoadingId === clip.id}
                                aria-label={`Select Reel ${clip.shortcode}`}
                                className="mt-1 h-4 w-4 shrink-0 accent-sky-400"
                              />
                            )}
                            <div className="min-w-0 space-y-1">
                            <a
                              href={clip.instagram_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-primary hover:underline font-semibold"
                            >
                              {clip.shortcode}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <div className="text-xs font-sans text-foreground flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span>{clip.clipper.displayName}</span>
                              {clip.clipper.instagramHandle && (
                                <span className="text-muted-foreground text-[11px]">
                                  (@{clip.clipper.instagramHandle})
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-sans">
                              {formatDateTime(clip.submitted_at)}
                            </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-4 px-4 font-medium">
                          <div>
                            <span>{clip.campaign?.name || 'Campaign'}</span>
                            <div className="text-xs font-mono font-semibold text-primary">
                              {formatCurrency(clip.campaign?.rate_per_1000 || 0)} / 1,000
                            </div>
                          </div>
                        </td>

                        <td className="w-[150px] py-3 px-3 align-top">
                          {statusFilter === 'updated' && clip.status === 'pending' && clip.review_note ? (
                            <span className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-200" title="Updated metrics submitted · ready for final approval"><CheckCircle2 className="h-3 w-3 shrink-0" /> Updated</span>
                          ) : <ClipStatusBadge status={clip.status} />}
                          {clip.review_note && (clip.status === 'reviewing' || statusFilter === 'updated') && (
                            <details className="mt-1.5 max-w-[132px] text-[10px] text-amber-100/80">
                              <summary className="cursor-pointer list-none whitespace-nowrap rounded-md border border-amber-200/10 bg-amber-200/[0.04] px-2 py-1 font-semibold text-amber-200 hover:bg-amber-200/[0.08]">View admin note</summary>
                              <p className="mt-1.5 max-w-[240px] rounded-lg border border-amber-200/10 bg-slate-950 p-2 text-[11px] leading-4 text-amber-100/80">{clip.review_note}</p>
                            </details>
                          )}
                        </td>

                        <td className="py-3 px-3 align-top">
                          <div className={`min-w-[130px] space-y-1 rounded-lg p-2 ${statusFilter === 'updated' ? 'border border-emerald-300/15 bg-emerald-300/[0.045]' : ''}`}>
                            {statusFilter === 'updated' && <div className="mb-1 text-[9px] font-extrabold uppercase tracking-[.14em] text-emerald-200">Latest update</div>}
                            <div className="text-xs"><span className="text-muted-foreground">Views:</span> <strong className="font-mono text-foreground">{formatNumber(clip.self_reported_views ?? 0)}</strong></div>
                            <div className="text-xs"><span className="text-muted-foreground">Likes:</span> <strong className="font-mono text-foreground">{formatNumber(clip.self_reported_likes ?? 0)}</strong></div>
                          </div>
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
                                Unavailable
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          {clip.status === 'pending' ? (
                            <div className="w-32">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                value={eligibleViewsMap[clip.id] ?? ''}
                                onChange={(e) =>
                                  setEligibleViewsMap((prev) => ({
                                    ...prev,
                                    [clip.id]: e.target.value,
                                  }))
                                }
                                placeholder="0"
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                          ) : (
                            <span className="font-semibold font-mono text-emerald-400">
                              {clip.earnings?.eligible_views != null
                                ? formatNumber(clip.earnings.eligible_views)
                                : '0'}
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="space-y-0.5">
                            <span className="font-bold text-foreground font-mono">
                              {clip.status === 'approved' && clip.earnings?.amount != null
                                ? formatCurrency(clip.earnings.amount)
                                : formatCurrency(calculated)}
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              {clip.status === 'pending' ? 'Preview' : 'Approved'}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right align-top">
                          {clip.status === 'pending' ? (
                            <div className="flex min-w-[270px] items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isActionLoading || bulkReviewLoading}
                                onClick={() => handleSendToReview(clip)}
                                title="Send back to the clipper to update current views and likes"
                                className="h-8 text-xs gap-1"
                              >
                                {isActionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                Review
                              </Button>
                              <Button
                                size="sm"
                                variant="success"
                                disabled={isActionLoading || bulkReviewLoading}
                                onClick={() => handleApprove(clip)}
                                className="h-8 text-xs gap-1"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={isActionLoading || bulkReviewLoading}
                                onClick={() => handleReject(clip.id)}
                                className="h-8 text-xs gap-1"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </div>
                          ) : clip.status === 'reviewing' ? (
                            <div className="min-w-[180px] text-xs text-amber-300">
                              Waiting for clipper to update views and likes.
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">
                              {clip.reviewed_at ? formatDate(clip.reviewed_at) : 'Reviewed'}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 md:hidden sm:p-4">
              {visibleClips.map((clip) => {
                const rawViews = eligibleViewsMap[clip.id] || '0';
                const views = Number.parseInt(rawViews, 10);
                const rate = Number(clip.campaign?.rate_per_1000 || 0);
                const estimate = Number.isFinite(views) && views >= 0 ? (views / 1000) * rate : 0;
                const isUpdated = statusFilter === 'updated' && clip.status === 'pending' && Boolean(clip.review_note);
                const busy = actionLoadingId === clip.id;
                return <article key={clip.id} className={`overflow-hidden rounded-2xl border bg-slate-950/70 shadow-lg ${isUpdated ? 'border-emerald-300/25' : 'border-white/10'}`}>
                  <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${isUpdated ? 'border-emerald-300/15 bg-emerald-300/[0.055]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                    <div className="min-w-0"><a href={clip.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-sky-200">{clip.shortcode}<ExternalLink className="h-3 w-3" /></a><p className="mt-1 truncate text-xs text-slate-400">{clip.clipper.displayName}{clip.clipper.instagramHandle ? ` · @${clip.clipper.instagramHandle}` : ''}</p><p className="mt-1 text-[10px] text-slate-600">{formatDateTime(clip.submitted_at)}</p></div>
                    {isUpdated ? <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[9px] font-extrabold uppercase text-emerald-200">Updated</span> : <ClipStatusBadge status={clip.status} />}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">{clip.campaign?.name || 'Campaign'}</span><span className="font-bold text-sky-200">{formatCurrency(clip.campaign?.rate_per_1000 || 0)} / 1k</span></div>
                    <div className="grid grid-cols-2 gap-2"><div className={`rounded-xl border p-3 ${isUpdated ? 'border-emerald-300/15 bg-emerald-300/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Latest reported views</p><p className="mt-1 text-lg font-black tabular-nums text-white">{formatNumber(clip.self_reported_views ?? 0)}</p></div><div className={`rounded-xl border p-3 ${isUpdated ? 'border-emerald-300/15 bg-emerald-300/[0.04]' : 'border-white/[0.07] bg-white/[0.025]'}`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Latest reported likes</p><p className="mt-1 text-lg font-black tabular-nums text-white">{formatNumber(clip.self_reported_likes ?? 0)}</p></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Observed views</p><p className="mt-1 text-base font-bold tabular-nums text-slate-200">{clip.latestSnapshot?.observed_views != null ? formatNumber(clip.latestSnapshot.observed_views) : '—'}</p></div><div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.04] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Estimated reward</p><p className="mt-1 text-base font-bold tabular-nums text-sky-200">{formatCurrency(clip.status === 'approved' && clip.earnings?.amount != null ? clip.earnings.amount : estimate)}</p></div></div>
                    {clip.review_note && <p className="rounded-xl border border-amber-300/10 bg-amber-300/[0.045] p-3 text-xs leading-5 text-amber-100/80"><strong className="text-amber-200">Review note:</strong> {clip.review_note}</p>}
                    {clip.status === 'pending' && <div className="space-y-3 border-t border-white/[0.07] pt-3"><label className="block text-xs font-bold text-slate-300">Verified eligible views<input type="number" min="0" step="1" value={eligibleViewsMap[clip.id] ?? ''} onChange={(e) => setEligibleViewsMap((prev) => ({ ...prev, [clip.id]: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 font-mono text-sm text-white outline-none focus:border-sky-300/40" placeholder="Enter verified views" /></label><div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Button className="min-h-11 gap-2 bg-sky-300 font-bold text-slate-950 hover:bg-sky-200" disabled={busy || bulkReviewLoading} onClick={() => handleApprove(clip)}><CheckCircle2 className="h-4 w-4" /> Approve</Button><Button variant="outline" className="min-h-11 gap-2 border-amber-200/20 bg-amber-200/[0.04] text-amber-100 hover:bg-amber-200/10 hover:text-amber-50" disabled={busy || bulkReviewLoading} onClick={() => handleSendToReview(clip)}><RefreshCw className="h-4 w-4" /> Request update</Button><Button variant="destructive" className="min-h-11 gap-2" disabled={busy || bulkReviewLoading} onClick={() => handleReject(clip.id)}><XCircle className="h-4 w-4" /> Reject</Button></div></div>}
                    {clip.status === 'reviewing' && <p className="text-xs text-amber-200">Waiting for the clipper to update views and likes.</p>}
                  </div>
                </article>;
              })}
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
