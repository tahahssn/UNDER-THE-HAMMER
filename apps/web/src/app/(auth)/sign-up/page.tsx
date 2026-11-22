'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/lib/constants';
import { signUpSchema, type SignUpInput } from '@/lib/schemas/auth';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function SignUp() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = async (data: SignUpInput) => {
    try {
      setIsLoading(true);
      setError(null);
      await signUp(data.email, data.password, data.firstName, data.lastName);
      router.push(ROUTES.auctionWorkspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <div className="mb-6 text-center">
        <h1 className="mb-2 text-3xl font-bold">Create Account</h1>
        <p className="text-text-muted">Join Under The Hammer today</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* First Name */}
        <div>
          <label htmlFor="firstName" className="mb-2 block text-sm font-medium">
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            placeholder="John"
            {...register('firstName')}
            className="w-full"
          />
        </div>

        {/* Last Name */}
        <div>
          <label htmlFor="lastName" className="mb-2 block text-sm font-medium">
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            placeholder="Doe"
            {...register('lastName')}
            className="w-full"
          />
        </div>

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

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="••••••••"
            {...register('confirmPassword')}
            className="w-full"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-danger">{errors.confirmPassword.message}</p>
          )}
        </div>

        {/* Terms checkbox */}
        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            {...register('terms')}
            className="mt-1"
          />
          <label htmlFor="terms" className="text-sm text-text-muted">
            I agree to the{' '}
            <a href="#terms" className="font-semibold text-accent hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#privacy" className="font-semibold text-accent hover:underline">
              Privacy Policy
            </a>
          </label>
        </div>
        {errors.terms && (
          <p className="text-sm text-danger">{errors.terms.message}</p>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 p-3">
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Submit */}
        <Button type="submit" variant="primary" size="md" className="w-full" loading={isLoading}>
          Create Account
        </Button>
      </form>

      {/* Links */}
      <div className="mt-6 border-t border-border pt-6 text-center text-sm">
        <div>
          Already have an account?{' '}
          <Link href={ROUTES.signIn} className="font-semibold">
            Sign In
          </Link>
        </div>
      </div>
    </Card>
  );
}
