'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { getSubscriptionPlans } from '@/lib/api';
import { ROUTES } from '@/lib/constants';

interface Plan {
  id: string;
  key: string;
  name: string;
  priceMinor: bigint;
  currency: string;
  period: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  active: boolean;
}

interface Feature {
  name: string;
  included: boolean;
}

const FEATURES: Feature[] = [
  { name: 'Create Auctions', included: true },
  { name: 'Unlimited Rooms', included: true },
  { name: 'Team Customization', included: true },
  { name: 'Advanced Analytics', included: true },
  { name: 'Priority Support', included: true },
  { name: 'API Access', included: true },
  { name: 'Custom Branding', included: true },
  { name: 'Team Collaboration', included: true },
];

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await getSubscriptionPlans();
        if (response.success && response.data?.plans) {
          setPlans(response.data.plans.filter((p: any) => p.active));
        } else {
          setError('Could not load subscription plans');
        }
      } catch (err) {
        setError('Failed to fetch plans');
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const formatPrice = (minor: bigint, currency: string): string => {
    const major = Number(minor) / 100;
    return `${currency} ${major.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const getPeriodLabel = (period: string): string => {
    switch (period) {
      case 'MONTHLY':
        return 'per month';
      case 'ANNUAL':
        return 'per year';
      case 'LIFETIME':
        return 'one-time';
      default:
        return period;
    }
  };

  const sortedPlans = [...plans].sort((a, b) => {
    // Sort by price: free first, then ascending
    const priceA = Number(a.priceMinor);
    const priceB = Number(b.priceMinor);
    return priceA - priceB;
  });

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Subscription Plans"
            description="Choose the perfect plan for your cricket auctions"
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Subscription', href: '/subscription' },
              { label: 'Plans' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
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

          {!loading && sortedPlans.length === 0 && (
            <Card className="border-info/20 bg-info/5">
              <p className="text-center text-text-muted">No plans available at the moment.</p>
            </Card>
          )}

          {!loading && sortedPlans.length > 0 && (
            <>
              {/* Plans Grid */}
              <div className="mb-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {sortedPlans.map((plan) => {
                  const isFree = Number(plan.priceMinor) === 0;
                  return (
                    <Card
                      key={plan.id}
                      className={`flex flex-col border-2 transition-all duration-200 ${
                        isFree
                          ? 'border-border bg-surface'
                          : 'border-accent/50 bg-accent/5 shadow-lg'
                      }`}
                    >
                      {/* Plan Header */}
                      <div className="mb-6 border-b border-border pb-6">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h3 className="text-xl font-bold">{plan.name}</h3>
                          {!isFree && <Badge variant="success">Popular</Badge>}
                        </div>
                        <div className="text-sm text-text-muted">
                          {isFree ? (
                            <span>Get started for free</span>
                          ) : (
                            <span>
                              {formatPrice(plan.priceMinor, plan.currency)}{' '}
                              <span className="text-xs">{getPeriodLabel(plan.period)}</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Features List */}
                      <div className="mb-6 flex-1 space-y-3">
                        {FEATURES.map((feature, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <CheckCircle2
                              size={18}
                              className={feature.included ? 'text-success' : 'text-border'}
                            />
                            <span
                              className={`text-sm ${
                                feature.included ? 'text-primary' : 'text-text-muted'
                              }`}
                            >
                              {feature.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* CTA Button */}
                      <Button
                        variant={isFree ? 'outline' : 'primary'}
                        size="md"
                        className="w-full"
                        disabled
                      >
                        {isFree ? 'Your Current Plan' : 'Upgrade'}
                      </Button>
                      <p className="mt-2 text-center text-xs text-text-muted">
                        Coming soon in Phase L
                      </p>
                    </Card>
                  );
                })}
              </div>

              {/* FAQ or Info */}
              <Card className="border-info/20 bg-info/5">
                <h3 className="mb-4 font-semibold">About Plans</h3>
                <ul className="space-y-2 text-sm text-text-muted">
                  <li>
                    • <strong>Free Plan:</strong> Perfect for trying out Under The Hammer
                  </li>
                  <li>
                    • <strong>Paid Plans:</strong> Unlock unlimited auctions and advanced features
                  </li>
                  <li>• Payment processing is coming in Phase L</li>
                  <li>• All features and pricing are subject to change</li>
                </ul>
              </Card>
            </>
          )}

          {/* Back Button */}
          <div className="mt-12">
            <Link href={ROUTES.home}>
              <Button variant="outline" size="md">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
