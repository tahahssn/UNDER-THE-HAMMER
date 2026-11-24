'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { getSubscription } from '@/lib/api';
import { ROUTES } from '@/lib/constants';

interface Subscription {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED';
  plan: {
    id: string;
    name: string;
    priceMinor: bigint;
    currency: string;
    period: string;
  };
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const response = await getSubscription();
        if (response.success && response.data?.subscriptions?.[0]) {
          setSubscription(response.data.subscriptions[0]);
        } else if (!response.success) {
          setError('Could not load subscription information');
        }
      } catch (err) {
        setError('Failed to fetch subscription');
      } finally {
        setLoading(false);
      }
    };

    fetchSubscription();
  }, []);

  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'info' => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'GRACE':
      case 'PENDING':
        return 'warning';
      case 'CANCELLED':
      case 'EXPIRED':
        return 'danger';
      default:
        return 'info';
    }
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPrice = (minor: bigint, currency: string): string => {
    const major = Number(minor) / 100;
    return `${currency} ${major.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <PageHeader
            title="Subscription"
            description="Manage your hosting subscription"
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Subscription' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          {loading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {error && (
            <Card className="mb-8 border-danger/20 bg-danger/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 flex-shrink-0 text-danger" size={20} />
                <div>
                  <h3 className="font-semibold text-danger">Error</h3>
                  <p className="text-sm text-text-muted">{error}</p>
                </div>
              </div>
            </Card>
          )}

          {!loading && !subscription && (
            <Card className="mb-8 border-info/20 bg-info/5">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-semibold text-lg mb-1">No Active Subscription</h3>
                  <p className="text-sm text-text-muted">
                    You don't have an active subscription. Host auctions by upgrading to a plan.
                  </p>
                </div>
                <Link href="/subscription/plans">
                  <Button variant="primary" size="sm" className="flex-shrink-0">
                    View Plans
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {!loading && subscription && (
            <>
              {/* Current Subscription */}
              <div className="mb-12">
                <h2 className="mb-6 text-2xl font-bold">Current Plan</h2>
                <Card className="border-accent/20 bg-accent/5 p-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* Plan Info */}
                    <div>
                      <div className="mb-4 flex items-center gap-3">
                        <div>
                          <h3 className="text-xl font-bold">{subscription.plan.name}</h3>
                          <p className="text-sm text-text-muted">
                            {formatPrice(subscription.plan.priceMinor, subscription.plan.currency)} /{' '}
                            {subscription.plan.period.toLowerCase()}
                          </p>
                        </div>
                      </div>
                      <Badge variant={getStatusColor(subscription.status)}>
                        {subscription.status}
                      </Badge>
                    </div>

                    {/* Period Info */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-text-muted" />
                        <span>
                          <strong>Renewal Date:</strong> {formatDate(subscription.currentPeriodEnd)}
                        </span>
                      </div>
                      {subscription.cancelAtPeriodEnd && (
                        <div className="text-sm text-warning">
                          <strong>Note:</strong> Your subscription will cancel at the end of this period.
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </div>

              {/* Subscription Features */}
              <div className="mb-12">
                <h2 className="mb-6 text-2xl font-bold">Plan Features</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-1 flex-shrink-0 text-success" size={20} />
                      <div>
                        <h4 className="font-semibold">Host Auctions</h4>
                        <p className="text-sm text-text-muted">Create and manage cricket auctions</p>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-1 flex-shrink-0 text-success" size={20} />
                      <div>
                        <h4 className="font-semibold">Unlimited Rooms</h4>
                        <p className="text-sm text-text-muted">Create as many auction rooms as you need</p>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-1 flex-shrink-0 text-success" size={20} />
                      <div>
                        <h4 className="font-semibold">Advanced Settings</h4>
                        <p className="text-sm text-text-muted">Configure custom auction formats and rules</p>
                      </div>
                    </div>
                  </Card>
                  <Card>
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-1 flex-shrink-0 text-success" size={20} />
                      <div>
                        <h4 className="font-semibold">Priority Support</h4>
                        <p className="text-sm text-text-muted">Dedicated support for your auctions</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link href="/subscription/plans" className="flex-1">
                  <Button variant="outline" size="md" className="w-full">
                    View All Plans
                  </Button>
                </Link>
                <Link href={ROUTES.auctionWorkspace} className="flex-1">
                  <Button variant="primary" size="md" className="w-full">
                    Go to Auction Workspace
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
