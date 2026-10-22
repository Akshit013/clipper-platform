import ClipperToolsNav from "@/components/ClipperToolsNav";
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'ClipperPlatform — Production Clipping Company Rewards',
  description:
    'Monetize your public Instagram Reels. Submit clips to active brand campaigns, track verified views, and request instant payouts.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased text-foreground flex flex-col font-sans">
      <ClipperToolsNav />
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
