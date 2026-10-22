'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { Profile } from '@/lib/types';

const SignUpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters'),
  instagramHandle: z
    .string()
    .transform((val) => val.replace(/^@/, '').trim())
    .optional(),
});

const SignInSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type AuthActionResult = {
  success: boolean;
  error?: string;
  message?: string;
  requiresEmailVerification?: boolean;
};

/**
 * Public Signup:
 * Requirement: New users must ALWAYS receive the 'clipper' role.
 * Admin privileges must NEVER be assigned through public signup.
 */
export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
    instagramHandle: formData.get('instagramHandle') || undefined,
  };

  const parseResult = SignUpSchema.safeParse(rawData);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message || 'Invalid form input',
    };
  }

  const { email, password, displayName, instagramHandle } = parseResult.data;
  const supabase = await createServerSupabaseClient();

  // Create user with Supabase Auth
  // Notice: raw_user_meta_data deliberately assigns role: 'clipper'
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        instagram_handle: instagramHandle || null,
        role: 'clipper', // Enforce role: 'clipper' unconditionally
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`,
    },
  });

  if (authError) {
    return {
      success: false,
      error: authError.message,
    };
  }

  if (!authData.user) {
    return {
      success: false,
      error: 'Failed to create user account.',
    };
  }

  // Ensure public.profiles has the user with role: 'clipper'
  try {
    const adminSupabase = createAdminClient();
    await adminSupabase.from('profiles').upsert(
      {
        user_id: authData.user.id,
        role: 'clipper', // ALWAYS clipper, never admin
        display_name: displayName,
        instagram_handle: instagramHandle || null,
      },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    console.warn('Profile sync fallback note:', err);
  }

  // Check if email confirmation is required by Supabase
  const requiresEmailVerification =
    authData.user.identities &&
    authData.user.identities.length > 0 &&
    !authData.user.confirmed_at;

  return {
    success: true,
    message: requiresEmailVerification
      ? 'Account created! Please check your email to verify your address before logging in.'
      : 'Account created successfully!',
    requiresEmailVerification,
  };
}

/**
 * Public Login
 */
export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const rawData = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parseResult = SignInSchema.safeParse(rawData);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message || 'Invalid email or password',
    };
  }

  const { email, password } = parseResult.data;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Provide user-friendly hints for unconfirmed emails
    if (
      error.message.toLowerCase().includes('email not confirmed') ||
      error.message.toLowerCase().includes('confirm your email')
    ) {
      return {
        success: false,
        error: 'Please verify your email address before logging in.',
        requiresEmailVerification: true,
      };
    }
    return {
      success: false,
      error: error.message,
    };
  }

  return {
    success: true,
    message: 'Signed in successfully!',
  };
}

/**
 * Logout
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Get current profile and role safely from server
 */
export async function getCurrentProfile(): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  isAdmin: boolean;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null, isAdmin: false };
  }

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const profile = data as Profile | null;

  return {
    user: { id: user.id, email: user.email },
    profile: profile || null,
    isAdmin: profile?.role === 'admin',
  };
}
