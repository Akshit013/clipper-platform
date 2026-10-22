import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClipStatusBadge } from '@/components/ClipStatusBadge';
import {
  Film,
  Eye,
  CheckCircle2,
  DollarSign,
  Wallet,
  PlusCircle,
  ExternalLink,
  ArrowRight,
  Play,
  ShieldCheck,
  Sparkles,
  CircleHelp,
} from 'lucide-react';
import { getClipperDashboardDataAction } from '@/actions/clips';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';

export default async function ClipperDashboardPage() {
  const { stats, recentClips } = await getClipperDashboardDataAction();

  const metrics = [
    {
      title: 'Total clips',
      value: formatNumber(stats.totalClips),
      caption: 'All-time submissions',
      icon: Film,
      iconTone: 'bg-sky-400/10 text-sky-300',
      accent: 'from-sky-400/15',
    },
    {
      title: 'Observed views',
      value: formatNumber(stats.observedViews),
      caption: 'Latest reported / observed',
      icon: Eye,
      iconTone: 'bg-violet-400/10 text-violet-300',
      accent: 'from-violet-400/15',
    },
    {
      title: 'Eligible views',
      value: formatNumber(stats.eligibleViews),
      caption: 'Verified for rewards',
      icon: CheckCircle2,
      iconTone: 'bg-emerald-400/10 text-emerald-300',
      accent: 'from-emerald-400/15',
    },
    {
      title: 'Approved earnings',
      value: formatCurrency(stats.approvedEarnings),
      caption: 'Confirmed rewards',
      icon: DollarSign,
      iconTone: 'bg-amber-400/10 text-amber-300',
      accent: 'from-amber-400/15',
    },
  ];

  return (
    <div className="space-y-8 pb-8">
      {/* High-contrast overview banner: intentionally changes the first screen of the dashboard. */}
      <section className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(120deg,#101f3b_0%,#0b1428_52%,#1b1740_100%)] px-6 py-7 shadow-2xl shadow-black/20 sm:px-9 sm:py-9 lg:px-11 lg:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[-150px] right-[22%] h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,.75fr)] lg:items-center">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.08] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-sky-200">
              <Sparkles className="h-3.5 w-3.5" /> Creator workspace
            </div>
            <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-[-.045em] text-white sm:text-4xl lg:text-[44px]">
              Your clips. Your reach. <span className="text-sky-300">Your rewards.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
              Keep every Reel organised, follow its review status, and see the earnings that have been approved for you.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/dashboard/submit">
                <Button className="h-11 gap-2 rounded-xl bg-sky-400 px-5 font-semibold text-slate-950 shadow-lg shadow-sky-950/25 hover:bg-sky-300">
                  <PlusCircle className="h-4 w-4" /> Submit a Reel
                </Button>
              </Link>
              <Link href="/dashboard/clips">
                <Button variant="outline" className="h-11 gap-2 rounded-xl border-white/15 bg-white/[0.04] px-5 text-white hover:bg-white/[0.09] hover:text-white">
                  View my clips <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Admin-verified eligible views</span>
              <span className="inline-flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-sky-300" /> Earnings shown in INR</span>
            </div>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-xl backdrop-blur-md sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">Available balance</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{formatCurrency(stats.availableBalance)}</p>
                <p className="mt-2 text-xs text-slate-400">Ready to request, subject to payout rules</p>
              </div>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-300/15 bg-emerald-300/10 text-emerald-300">
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <div className="my-5 border-t border-white/10" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/[0.045] p-3.5">
                <p className="text-xs text-slate-400">Pending payouts</p>
                <p className="mt-1.5 text-lg font-bold text-white">{formatCurrency(stats.pendingPayouts)}</p>
              </div>
              <div className="rounded-xl bg-white/[0.045] p-3.5">
                <p className="text-xs text-slate-400">Eligible views</p>
                <p className="mt-1.5 text-lg font-bold text-white">{formatNumber(stats.eligibleViews)}</p>
              </div>
            </div>
            <Link href="/dashboard/payouts" className="mt-4 flex items-center justify-between rounded-xl border border-sky-300/15 bg-sky-300/[0.07] px-4 py-3 text-sm font-semibold text-sky-200 transition hover:bg-sky-300/[0.12]">
              Open payout centre <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-sky-300">Performance snapshot</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">Your numbers at a glance</h2>
            <p className="mt-1 text-sm text-muted-foreground">A quick view of your activity and verified results.</p>
          </div>
          <Link href="/dashboard/clips" className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-300 transition hover:text-sky-200">
            See all activity <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.title} className="group relative overflow-hidden rounded-2xl border-white/[0.09] bg-slate-950/35 transition duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:bg-slate-900/60">
                <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${metric.accent} to-transparent opacity-70`} />
                <CardContent className="relative p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-400">{metric.title}</span>
                    <span className={`grid h-10 w-10 place-items-center rounded-xl ${metric.iconTone}`}><Icon className="h-[18px] w-[18px]" /></span>
                  </div>
                  <p className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-[28px]">{metric.value}</p>
                  <p className="mt-1.5 text-xs text-slate-500">{metric.caption}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-slate-950/30">
        <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-400/10 text-sky-300"><Film className="h-4 w-4" /></div>
              <h2 className="text-lg font-bold text-foreground">Recent submissions</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">See what you submitted recently and what needs attention.</p>
          </div>
          <Link href="/dashboard/clips">
            <Button variant="outline" size="sm" className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">All clips <ArrowRight className="h-3.5 w-3.5" /></Button>
          </Link>
        </div>

        {recentClips.length === 0 ? (
          <div className="px-5 py-14 text-center sm:px-8">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-sky-300/15 bg-sky-300/[0.07] text-sky-300"><Play className="h-6 w-6" /></div>
            <h3 className="mt-4 text-base font-semibold text-foreground">Your first Reel starts here</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Submit a public Instagram Reel to start building your clip history. You can track its review status from this dashboard.</p>
            <Link href="/dashboard/submit" className="mt-5 inline-flex">
              <Button className="gap-2 rounded-xl"><PlusCircle className="h-4 w-4" /> Submit your first Reel</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[0.025] text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Reel</th>
                    <th className="px-4 py-4">Campaign</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-right">Observed views</th>
                    <th className="px-4 py-4 text-right">Eligible views</th>
                    <th className="px-4 py-4 text-right">Earnings</th>
                    <th className="px-6 py-4 text-right">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {recentClips.map((clip) => (
                    <tr key={clip.id} className="transition hover:bg-white/[0.025]">
                      <td className="px-6 py-4">
                        <a href={clip.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-sky-300 hover:text-sky-200">
                          {clip.shortcode}<ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="px-4 py-4 font-medium text-slate-300">{clip.campaign?.name || 'General Campaign'}</td>
                      <td className="px-4 py-4"><ClipStatusBadge status={clip.status} /></td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-400">{clip.latestSnapshot?.observed_views != null ? formatNumber(clip.latestSnapshot.observed_views) : '—'}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-300">{clip.earnings?.eligible_views != null ? formatNumber(clip.earnings.eligible_views) : clip.status === 'pending' ? 'Under review' : clip.status === 'reviewing' ? 'Update requested' : '0'}</td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums text-white">{clip.earnings?.amount != null ? formatCurrency(clip.earnings.amount) : '₹0.00'}</td>
                      <td className="px-6 py-4 text-right text-xs text-slate-500">{formatDate(clip.submitted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {recentClips.map((clip) => (
                <article key={clip.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a href={clip.instagram_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-sky-300">{clip.shortcode}<ExternalLink className="h-3 w-3 shrink-0" /></a>
                      <p className="mt-1 truncate text-xs text-slate-500">{clip.campaign?.name || 'General Campaign'}</p>
                    </div>
                    <ClipStatusBadge status={clip.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div><p className="text-xs text-slate-500">Observed views</p><p className="mt-1 text-sm font-semibold text-slate-200">{clip.latestSnapshot?.observed_views != null ? formatNumber(clip.latestSnapshot.observed_views) : '—'}</p></div>
                    <div><p className="text-xs text-slate-500">Earnings</p><p className="mt-1 text-sm font-semibold text-white">{clip.earnings?.amount != null ? formatCurrency(clip.earnings.amount) : '₹0.00'}</p></div>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Submitted {formatDate(clip.submitted_at)}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/10 bg-amber-200/[0.035] p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><CircleHelp className="h-5 w-5" /></div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-100">A quick note about views and rewards</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Views and likes entered during submission help with review. They are self-reported and do not by themselves change your earnings; rewards use eligible views approved by an admin.</p>
        </div>
        <Link href="/dashboard/how-to-edit" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-amber-200 hover:text-amber-100">Creator guide <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
    </div>
  );
}
