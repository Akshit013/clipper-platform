'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { signUpAction } from '@/actions/auth';
import { toast } from 'sonner';
import { Film, Lock, Mail, User, Instagram, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function SignUpPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSuccessInfo(null);

    const formData = new FormData(e.currentTarget);
    const result = await signUpAction(formData);

    setLoading(false);

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to create account.');
      toast.error(result.error || 'Signup failed');
      return;
    }

    if (result.requiresEmailVerification) {
      setSuccessInfo(
        'Account created! A verification link has been sent to your email. Please click the link to activate your clipper account.'
      );
      toast.success('Verification email sent');
    } else {
      toast.success('Account created successfully!');
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background relative overflow-hidden">
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
          <h2 className="text-xl font-semibold text-foreground">Join as a Clipper</h2>
          <p className="text-sm text-muted-foreground">
            Get paid per 1,000 eligible views on public Instagram Reels
          </p>
        </div>

        <Card className="border-border/80 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Create Clipper Account</CardTitle>
            <CardDescription>
              New accounts automatically receive clipper privileges
            </CardDescription>
          </CardHeader>

          {successInfo ? (
            <CardContent className="space-y-4 py-6">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>Check Your Inbox</span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {successInfo}
                </p>
              </div>
              <div className="pt-2">
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    Return to Sign In
                  </Button>
                </Link>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {errorMessage && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="displayName">Full Name or Creator Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="displayName"
                      name="displayName"
                      type="text"
                      placeholder="Alex Rivera"
                      required
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagramHandle">Instagram Handle (Optional)</Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="instagramHandle"
                      name="instagramHandle"
                      type="text"
                      placeholder="alex.clips"
                      className="pl-9"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Helps admins attribute clips to your profile
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="alex@example.com"
                      required
                      className="pl-9"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="At least 8 chars, 1 uppercase, 1 number"
                      required
                      className="pl-9"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    'Register as Clipper'
                  )}
                </Button>

                <div className="text-center text-xs text-muted-foreground">
                  Already have an account?{' '}
                  <Link
                    href="/login"
                    className="font-semibold text-primary hover:underline"
                  >
                    Sign In
                  </Link>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
