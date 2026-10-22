'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signInAction } from '@/actions/auth';
import { toast } from 'sonner';
import { Film, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    searchParams.get('error') === 'verification_failed'
      ? 'Email verification failed or expired. Please try logging in again.'
      : null
  );
  const [needsVerification, setNeedsVerification] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setNeedsVerification(false);

    const formData = new FormData(e.currentTarget);
    const result = await signInAction(formData);

    setLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to sign in.');
      if (result.requiresEmailVerification) {
        setNeedsVerification(true);
      }
      toast.error(result.error || 'Login failed');
      return;
    }

    toast.success('Signed in successfully!');
    const redirectUrl = searchParams.get('redirect') || '/dashboard';
    router.push(redirectUrl);
    router.refresh();
  }

  return (
    <Card className="border-border/80 shadow-xl">
      <CardHeader>
        <CardTitle className="text-lg">Sign In</CardTitle>
        <CardDescription>
          Enter your registered account credentials
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <span>{errorMessage}</span>
                {needsVerification && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Check your spam folder or wait a moment for the email confirmation link.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="clipper@example.com"
                required
                className="pl-9"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="pl-9"
                autoComplete="current-password"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-semibold text-primary hover:underline"
            >
              Create Clipper Account
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-xl shadow-lg">
              <Film className="h-5 w-5" />
            </div>
            <span className="font-bold text-2xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              ClipperPlatform
            </span>
          </Link>
          <h2 className="text-xl font-semibold text-foreground">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Sign in to track your clips, views, and payout earnings
          </p>
        </div>

        <Suspense
          fallback={
            <Card className="p-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            </Card>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
