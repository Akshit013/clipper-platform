import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Film,
  TrendingUp,
  ShieldCheck,
  Zap,
  ArrowRight,
  Eye,
  DollarSign,
  CheckCircle,
  Play,
  Instagram,
  Wallet,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { getCurrentProfile } from '@/actions/auth';
import { getActiveCampaignsAction } from '@/actions/campaigns';
import { formatCurrency, formatDate } from '@/lib/utils';

export default async function LandingPage() {
  const { user, profile } = await getCurrentProfile();
  const campaigns = await getActiveCampaignsAction();
  const highestRate = campaigns.reduce((highest, campaign) => Math.max(highest, Number(campaign.rate_per_1000) || 0), 0);

  return (
    <div className="min-h-screen overflow-hidden bg-[#070b14] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#070b14]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-7">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-sky-300 to-blue-600 text-slate-950 shadow-lg shadow-blue-950/40"><Film className="h-5 w-5" /></span>
            <span className="leading-tight"><span className="block text-base font-bold tracking-tight text-white sm:text-lg">Clipper<span className="text-sky-300">Platform</span></span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[.19em] text-slate-500">Creator rewards network</span></span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex">
            <Link href="#how-it-works" className="text-sm font-medium text-slate-400 transition hover:text-white">How it works</Link>
            <Link href="#campaigns" className="text-sm font-medium text-slate-400 transition hover:text-white">Campaigns</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {user ? (
              <Link href={profile?.role === 'admin' ? '/admin' : '/dashboard'}>
                <Button className="h-10 gap-2 rounded-xl bg-sky-300 px-3 font-semibold text-slate-950 hover:bg-sky-200 sm:px-4">Go to dashboard <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            ) : (
              <>
                <Link href="/login"><Button variant="ghost" className="h-10 rounded-xl px-3 text-slate-300 hover:bg-white/[0.06] hover:text-white">Log in</Button></Link>
                <Link href="/signup"><Button className="h-10 gap-2 rounded-xl bg-sky-300 px-3 font-semibold text-slate-950 hover:bg-sky-200 sm:px-4">Join as clipper <ArrowRight className="h-4 w-4" /></Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate border-b border-white/[0.07]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_15%_10%,rgba(14,165,233,.15),transparent_38%),radial-gradient(ellipse_at_90%_65%,rgba(99,102,241,.15),transparent_35%)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-7 sm:py-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:py-24">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.07] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[.17em] text-sky-200"><Sparkles className="h-3.5 w-3.5" /> Built for short-form creators</div>
              <h1 className="max-w-3xl text-[42px] font-bold leading-[1.04] tracking-[-.055em] text-white sm:text-6xl lg:text-[68px]">Turn great clips into <span className="bg-gradient-to-r from-sky-300 via-blue-300 to-violet-300 bg-clip-text text-transparent">real rewards.</span></h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">Submit public Instagram Reels for active campaigns, follow the review process, and track the rewards approved for your eligible views.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={user ? (profile?.role === 'admin' ? '/admin' : '/dashboard/submit') : '/signup'}><Button size="lg" className="h-12 w-full gap-2 rounded-xl bg-sky-300 px-6 font-semibold text-slate-950 shadow-lg shadow-sky-950/30 hover:bg-sky-200 sm:w-auto">{user ? 'Open your workspace' : 'Start clipping'} <ArrowRight className="h-4 w-4" /></Button></Link>
                <Link href="#campaigns"><Button variant="outline" size="lg" className="h-12 w-full gap-2 rounded-xl border-white/10 bg-white/[0.03] px-6 text-slate-200 hover:bg-white/[0.07] hover:text-white sm:w-auto"><Play className="h-4 w-4" /> Explore campaigns</Button></Link>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/[0.08] pt-6 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-300" /> Clear review statuses</span>
                <span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4 text-sky-300" /> INR earnings ledger</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-300" /> Public Reel URLs only</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none">
              <div aria-hidden="true" className="absolute -inset-5 rounded-[34px] bg-gradient-to-br from-sky-400/10 via-blue-500/5 to-violet-500/15 blur-2xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/[0.12] bg-[#0d1423]/90 p-4 shadow-2xl shadow-black/30 sm:p-5">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-1 pb-4">
                  <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-300/10 text-sky-200"><Instagram className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-white">Creator overview</p><p className="mt-0.5 text-[11px] text-slate-500">A clearer path from clip to payout</p></div></div>
                  <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">Workflow</span>
                </div>
                <div className="mt-4 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#172b49] via-[#101d34] to-[#171934] p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[.15em] text-sky-200/80">Campaign participation</p><p className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">One clip at a time.</p></div>
                    <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-sky-200"><Play className="ml-0.5 h-5 w-5" /></span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-300/10 text-sky-200"><ExternalLink className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-100">Submit a public Reel</p><p className="mt-0.5 text-xs text-slate-400">Add the link, campaign and current metrics</p></div><span className="h-2 w-2 rounded-full bg-sky-300" /></div>
                    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><Eye className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-100">Follow the review</p><p className="mt-0.5 text-xs text-slate-400">Update counts if the admin requests it</p></div><span className="h-2 w-2 rounded-full bg-amber-300" /></div>
                    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-300/10 text-emerald-200"><DollarSign className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-100">Track approved rewards</p><p className="mt-0.5 text-xs text-slate-400">See eligible views and available balance</p></div><span className="h-2 w-2 rounded-full bg-emerald-300" /></div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-slate-400"><TrendingUp className="h-4 w-4 text-sky-300" /><span className="text-xs">Active campaigns</span></div><p className="mt-2 text-2xl font-bold text-white">{campaigns.length}</p><p className="mt-1 text-[11px] text-slate-500">Currently available</p></div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-center gap-2 text-slate-400"><DollarSign className="h-4 w-4 text-emerald-300" /><span className="text-xs">Top listed rate</span></div><p className="mt-2 text-2xl font-bold text-white">{highestRate > 0 ? formatCurrency(highestRate) : '—'}</p><p className="mt-1 text-[11px] text-slate-500">Per 1,000 eligible views</p></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-white/[0.07] bg-white/[0.015] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-7">
            <div className="max-w-2xl"><p className="text-[11px] font-bold uppercase tracking-[.2em] text-sky-300">Simple by design</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">From Reel link to reviewed reward.</h2><p className="mt-3 text-sm leading-6 text-slate-400 sm:text-base">Know what happens at each step, and keep an eye on your clip and payout status in one place.</p></div>
            <div className="mt-9 grid gap-4 md:grid-cols-3">
              <Card className="rounded-2xl border-white/[0.08] bg-[#0b1220] p-6 transition hover:border-sky-300/20"><CardContent className="p-0"><span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-300/10 text-sky-200"><Zap className="h-5 w-5" /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.17em] text-slate-500">01 / Submit</p><h3 className="mt-2 text-lg font-bold text-white">Share the public Reel</h3><p className="mt-2 text-sm leading-6 text-slate-400">Choose an active campaign and linked Instagram account, then enter the Reel URL and current views and likes.</p></CardContent></Card>
              <Card className="rounded-2xl border-white/[0.08] bg-[#0b1220] p-6 transition hover:border-amber-300/20"><CardContent className="p-0"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Eye className="h-5 w-5" /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.17em] text-slate-500">02 / Review</p><h3 className="mt-2 text-lg font-bold text-white">Keep metrics up to date</h3><p className="mt-2 text-sm leading-6 text-slate-400">Follow the status in your workspace. If an admin asks for fresh counts, update them and send the Reel back for review.</p></CardContent></Card>
              <Card className="rounded-2xl border-white/[0.08] bg-[#0b1220] p-6 transition hover:border-emerald-300/20"><CardContent className="p-0"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200"><Wallet className="h-5 w-5" /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.17em] text-slate-500">03 / Track</p><h3 className="mt-2 text-lg font-bold text-white">See approved earnings</h3><p className="mt-2 text-sm leading-6 text-slate-400">Rewards use eligible views approved by an admin. Your wallet keeps approved earnings and payout requests visible.</p></CardContent></Card>
            </div>
          </div>
        </section>

        <section id="campaigns" className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-[11px] font-bold uppercase tracking-[.2em] text-sky-300">Find your next clip</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Active campaigns</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Browse the currently available briefs and check the listed reward rate before submitting.</p></div>
              <Link href={user ? (profile?.role === 'admin' ? '/admin/campaigns' : '/dashboard/submit') : '/signup'}><Button variant="outline" className="h-10 gap-2 rounded-xl border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.07] hover:text-white">{user ? 'Open workspace' : 'Join the network'} <ArrowRight className="h-4 w-4" /></Button></Link>
            </div>
            {campaigns.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] text-slate-400"><Film className="h-6 w-6" /></span><h3 className="mt-4 text-lg font-semibold text-white">No active public campaigns yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">Check back soon for new briefs. You can create an account now to prepare your creator workspace.</p><Link href="/signup" className="mt-5 inline-flex"><Button className="gap-2 rounded-xl bg-sky-300 font-semibold text-slate-950 hover:bg-sky-200">Create clipper account <ArrowRight className="h-4 w-4" /></Button></Link></div>
            ) : (
              <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {campaigns.map((camp) => (
                  <Card key={camp.id} className="group flex flex-col justify-between overflow-hidden rounded-2xl border-white/[0.09] bg-[#0b1220] transition duration-200 hover:-translate-y-1 hover:border-sky-300/25 hover:shadow-xl hover:shadow-sky-950/20">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-300/10 text-sky-200"><Film className="h-5 w-5" /></span><Badge variant="success" className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.08] text-[10px] font-bold uppercase tracking-wider text-emerald-200">Active</Badge></div>
                      <h3 className="mt-5 text-xl font-bold leading-snug text-white">{camp.name}</h3>
                      <p className="mt-2 min-h-[44px] text-sm leading-6 text-slate-400">{camp.description || 'Promote this campaign through engaging public Instagram Reels.'}</p>
                      <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-xs font-medium text-slate-500">Listed reward rate</p><p className="mt-1 text-lg font-bold text-sky-200">{formatCurrency(camp.rate_per_1000)} <span className="text-xs font-medium text-slate-400">/ 1,000 eligible views</span></p></div>
                      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500"><span>Campaign ends</span><span className="font-medium text-slate-300">{formatDate(camp.end_date)}</span></div>
                    </CardContent>
                    <div className="px-6 pb-6"><Link href={user ? (profile?.role === 'admin' ? '/admin/campaigns' : '/dashboard/submit') : '/signup'}><Button className="h-10 w-full gap-2 rounded-xl bg-white/[0.06] font-semibold text-white hover:bg-sky-300 hover:text-slate-950">{user ? 'Open submission form' : 'Join to participate'} <ArrowRight className="h-4 w-4" /></Button></Link></div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] bg-[#050810] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:flex-row sm:px-7"><Link href="/" className="flex items-center gap-2 font-semibold text-slate-300"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-sky-300 to-blue-600 text-slate-950"><Film className="h-3.5 w-3.5" /></span> ClipperPlatform</Link><span>Rewards are calculated from eligible views approved by an admin.</span><div className="flex items-center gap-5"><Link href="/login" className="transition hover:text-white">Sign in</Link><Link href="/signup" className="transition hover:text-white">Register</Link></div></div>
      </footer>
    </div>
  );
}
