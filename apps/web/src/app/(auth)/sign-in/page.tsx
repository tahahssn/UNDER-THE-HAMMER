'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import { signInSchema, type SignInInput } from '@/lib/schemas/auth';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  });

  const onSubmit = async (data: SignInInput) => {
    try {
      setIsLoading(true);
      setError(null);
      await signIn(data.email, data.password);
      router.push(ROUTES.auctionWorkspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-3xl font-bold">Sign In</h1>
        <p className="text-text-muted">Welcome back to Under The Hammer</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Email */}
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            {...register('email')}
            className="w-full"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-danger">{errors.email.message}</p>
          )}
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            {...register('password')}
            className="w-full"
          />
          {errors.password && (
            <p className="mt-1 text-sm text-danger">{errors.password.message}</p>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 p-3">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" variant="primary" size="md" className="w-full" loading={isLoading}>
          Sign In
        </Button>
      </form>

      {/* Links */}
      <div className="mt-6 space-y-3 border-t border-border pt-6 text-center text-sm">
        <div>
          Don&apos;t have an account?{' '}
          <Link href={ROUTES.signUp} className="font-semibold">
            Sign Up
          </Link>
        </div>
        <div>
          <Link href={ROUTES.forgotPassword} className="text-text-muted hover:text-accent">
            Forgot password?
          </Link>
        </div>
      </div>
    </Card>
  );
}
