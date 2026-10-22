import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/actions/auth';
import { getClipperAvailableBalanceAction } from '@/actions/clips';
import { Navbar } from '@/components/Navbar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the session and lightweight wallet total in parallel to avoid a sequential auth/data wait.
  const [{ user, profile }, availableBalance] = await Promise.all([
    getCurrentProfile(),
    getClipperAvailableBalanceAction(),
  ]);

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar profile={profile} availableBalance={availableBalance} />
      <main className="flex-1 container mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7 lg:py-8 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
