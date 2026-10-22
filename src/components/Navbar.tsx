'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Film,
  LayoutDashboard,
  PlusCircle,
  Wallet,
  ShieldAlert,
  LogOut,
  FolderKanban,
  CheckSquare,
  FileText,
  Menu,
  X,
  Trophy,
  Medal,
} from 'lucide-react';
import { signOutAction } from '@/actions/auth';
import { formatCurrency } from '@/lib/utils';
import type { Profile } from '@/lib/types';

interface NavbarProps {
  profile: Profile | null;
  availableBalance?: number;
}

export function Navbar({ profile, availableBalance = 0 }: NavbarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const isAdmin = profile?.role === 'admin';

  const clipperNav = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Submit Clip', href: '/dashboard/submit', icon: PlusCircle },
    { label: 'My Clips', href: '/dashboard/clips', icon: Film },
    { label: 'Payouts', href: '/dashboard/payouts', icon: Wallet },
    { label: 'Community', href: '/dashboard/community', icon: Trophy },
  ];

  const adminNav = [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'Review Clips', href: '/admin/clips', icon: CheckSquare },
    { label: 'Campaigns', href: '/admin/campaigns', icon: FolderKanban },
    { label: 'Prize Races', href: '/admin/contests', icon: Trophy },
    { label: 'Leaderboard', href: '/admin/leaderboard', icon: Medal },
    { label: 'Payouts', href: '/admin/payouts', icon: Wallet },
    { label: 'Audit Log', href: '/admin/audit-log', icon: FileText },
  ];

  const navItems = isAdmin ? adminNav : clipperNav;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/[0.07] bg-slate-950/85 shadow-[0_10px_36px_rgba(0,0,0,.18)] backdrop-blur-2xl">
      <div className="container flex h-16 items-center justify-between gap-2 px-3 sm:px-8">
        <div className="flex items-center gap-6">
          <Link href={isAdmin ? '/admin' : '/dashboard'} className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300 via-sky-500 to-indigo-500 font-black text-slate-950 shadow-[0_7px_24px_rgba(14,165,233,.23)]">
              C
            </div>
            <span className="whitespace-nowrap bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-base font-black tracking-tight text-transparent sm:text-lg">
              ClipperPlatform
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === '/dashboard' || item.href === '/admin'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-400/15 to-indigo-400/10 text-sky-200 font-bold ring-1 ring-sky-300/15 shadow-[0_4px_18px_rgba(14,165,233,.06)]'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground transition hover:border-primary/40 hover:bg-secondary md:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-main-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {profile ? (
            <>
              {!isAdmin && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                  <Wallet className="h-3.5 w-3.5" />
                  <span>Available: {formatCurrency(availableBalance)}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold leading-tight text-foreground">
                    {profile.display_name || 'Clipper User'}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {profile.instagram_handle ? `@${profile.instagram_handle}` : profile.role}
                  </p>
                </div>

                <Badge
                  variant={isAdmin ? 'destructive' : 'info'}
                  className="hidden capitalize font-mono text-[10px] uppercase tracking-wider sm:inline-flex"
                >
                  {isAdmin ? (
                    <span className="flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    'Clipper'
                  )}
                </Badge>
              </div>

              <form action={signOutAction}>
                <Button
                  variant="ghost"
                  size="icon"
                  type="submit"
                  title="Sign out"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Log in
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
      {mobileMenuOpen && (
        <nav id="mobile-main-navigation" aria-label="Mobile main navigation" className="border-t border-white/[0.08] bg-slate-950/95 px-3 py-3 shadow-2xl backdrop-blur-2xl md:hidden">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/dashboard' || item.href === '/admin'
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'border-sky-300/25 bg-sky-300/10 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,.07)]' : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          {!isAdmin && (
            <Link href="/dashboard/payouts" onClick={() => setMobileMenuOpen(false)} className="mt-3 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-3 text-sm text-primary">
              <span className="inline-flex items-center gap-2"><Wallet className="h-4 w-4" /> Available balance</span>
              <strong className="tabular-nums">{formatCurrency(availableBalance)}</strong>
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
