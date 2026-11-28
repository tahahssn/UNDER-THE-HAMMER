'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useCheckout } from '@/hooks/useCheckout';
import { useAuth } from '@/hooks/useAuth';

/**
 * Checkout page component.
 * Gets planId from URL params.
 * Displays loading state while checkout URL is being generated.
 * Handles post-checkout redirects: success → /billing?success=true, failure → error state.
 */
export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  const [planId, setPlanId] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Extract planId from URL path
  useEffect(() => {
    // URL format: /checkout/:planId
    const pathSegments = window.location.pathname.split('/');
    const id = pathSegments[pathSegments.length - 1];
    if (id && id !== 'checkout') {
      setPlanId(id);
    }
  }, []);

  // Initialize checkout once planId is set
  const { initiateCheckout, isLoading, checkoutUrl, sessionId, error } = useCheckout(
    planId || ''
  );

  // Handle callback redirects
  useEffect(() => {
    const redirectReason = searchParams.get('redirectReason');

    if (redirectReason === 'success') {
      // Success callback
      setIsRedirecting(true);
      setTimeout(() => {
        router.push('/billing?success=true');
      }, 1500);
    } else if (redirectReason === 'failure') {
      // Failure callback
      setIframeError(searchParams.get('error') || 'Payment failed. Please try again.');
    }
  }, [searchParams, router]);

  // Auto-initiate checkout when planId is ready
  useEffect(() => {
    if (planId && !checkoutUrl && !isLoading && !error) {
      initiateCheckout();
    }
  }, [planId, checkoutUrl, isLoading, error, initiateCheckout]);

  // Check authentication
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="max-w-md">
          <div className="mb-4 flex items-center gap-2 text-warning">
            <AlertCircle size={20} />
            <h2 className="text-lg font-semibold">Authentication Required</h2>
          </div>
          <p className="mb-6 text-sm text-text-muted">
            Please sign in to your account to proceed with checkout.
          </p>
          <Link href="/sign-in">
            <Button variant="primary" className="w-full cursor-pointer">
              Sign In
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // No planId found
  if (!planId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="max-w-md">
          <div className="mb-4 flex items-center gap-2 text-danger">
            <AlertCircle size={20} />
            <h2 className="text-lg font-semibold">Invalid Plan</h2>
          </div>
          <p className="mb-6 text-sm text-text-muted">
            The plan you are trying to subscribe to is not found or invalid.
          </p>
          <Link href="/pricing">
            <Button variant="primary" className="w-full cursor-pointer">
              View Plans
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Success state - redirecting to billing
  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="max-w-md text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-success/20 p-3">
              <CheckCircle2 size={32} className="text-success" />
            </div>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-success">Payment Successful</h2>
          <p className="mb-6 text-sm text-text-muted">
            Your subscription has been activated. Redirecting to billing page...
          </p>
          <LoadingSpinner />
        </Card>
      </div>
    );
  }

  // Error state from checkout initiation or callback
  const hasError = error || iframeError;
  if (hasError && !checkoutUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="max-w-md">
          <div className="mb-4 flex items-center gap-2 text-danger">
            <AlertCircle size={20} />
            <h2 className="text-lg font-semibold">Checkout Error</h2>
          </div>
          <p className="mb-6 text-sm text-text-muted">{hasError}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="primary"
              className="flex-1 cursor-pointer"
              onClick={() => {
                window.location.reload();
              }}
            >
              Retry
            </Button>
            <Link href="/pricing" className="flex-1">
              <Button variant="outline" className="w-full cursor-pointer">
                Choose Plan
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading || !checkoutUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <Card className="max-w-md text-center">
          <LoadingSpinner />
          <p className="mt-4 text-sm text-text-muted">Preparing checkout...</p>
        </Card>
      </div>
    );
  }

  // Checkout ready - display iframe or redirect
  return (
    <div className="min-h-screen bg-surface px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 text-3xl font-bold">Complete Your Subscription</h1>

        {/* Info Card */}
        <Card className="mb-6 border-info/20 bg-info/5">
          <p className="text-sm">
            Session ID: <span className="font-mono text-xs text-text-muted">{sessionId}</span>
          </p>
        </Card>

        {/* SafePay Checkout - will redirect to SafePay hosted checkout */}
        <Card className="p-0 overflow-hidden min-h-[600px]">
          {checkoutUrl && (
            <>
              <p className="p-4 text-sm text-text-muted border-b border-border">
                Redirecting to payment processor...
              </p>
              {/* In production, this would be an iframe or the user would be redirected directly */}
              {/* For now, we'll show the checkout URL and provide a button to proceed */}
              <div className="p-8 text-center">
                <p className="mb-4 text-text-muted">
                  Click the button below to proceed to SafePay checkout.
                </p>
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="lg" className="cursor-pointer">
                    Proceed to Payment
                  </Button>
                </a>
              </div>
            </>
          )}
        </Card>

        {/* Support Info */}
        <Card className="mt-6 border-border/50 p-4 bg-surface-raised">
          <p className="text-sm text-text-muted">
            Need help? Contact our support team at{' '}
            <a href="mailto:support@underthehammer.dev" className="text-accent hover:underline">
              support@underthehammer.dev
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}
