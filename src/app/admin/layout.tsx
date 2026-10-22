import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/actions/auth';
import { Navbar } from '@/components/Navbar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, isAdmin } = await getCurrentProfile();

  if (!user) {
    redirect('/login?redirect=/admin');
  }

  // Strict role check: Non-admins must never access /admin
  if (!isAdmin) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar profile={profile} />
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-1.5 text-xs text-rose-300 text-center font-medium">
        🛡️ Admin Control Panel — Privileged Actions are audited and cryptographically verified.
      </div>
      <main className="flex-1 container mx-auto max-w-7xl px-3 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
