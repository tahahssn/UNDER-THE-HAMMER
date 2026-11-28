'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import PricingCard from '@/components/PricingCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useSubscription } from '@/hooks/useSubscription';
import { getSubscriptionPlans } from '@/lib/api';
import { SubscriptionPlan } from '@uth/contracts';
import { ROUTES } from '@/lib/constants';

/**
 * Public pricing page component.
 * Fetches plans via GET /v1/subscriptions/plans (public, no auth).
 * Displays plans in responsive grid with current subscription highlight.
 * Features include: hero section, plan cards, FAQ.
 */
export default function PricingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const { subscription, isLoading: subscriptionLoading } = useSubscription();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setPlansLoading(true);
        setPlansError(null);
        const response = await getSubscriptionPlans();

        if (response.success && response.data?.plans) {
          // Filter active plans and sort by price
          const activePlans = response.data.plans
            .filter((p: any) => p.active)
            .sort((a: any, b: any) => Number(a.priceMinor) - Number(b.priceMinor));
          setPlans(activePlans);
        } else {
          setPlansError(response.error || 'Failed to load plans');
        }
      } catch (err) {
        console.error('Plans fetch error:', err);
        setPlansError('Failed to fetch pricing plans');
      } finally {
        setPlansLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const faqItems = [
    {
      question: 'Can I change my plan later?',
      answer:
        'Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.',
    },
    {
      question: 'What payment methods do you accept?',
      answer:
        'We accept all major credit and debit cards, as well as SafePay for Pakistan-based users.',
    },
    {
      question: 'Is there a free trial?',
      answer:
        'Yes, the Free plan allows you to try out Under The Hammer with limited features. Upgrade anytime to unlock more.',
    },
    {
      question: 'What if I cancel my subscription?',
      answer:
        'You can cancel anytime. Access to paid features will end at the end of your current billing period.',
    },
    {
      question: 'Do you offer refunds?',
      answer:
        'We offer a 30-day money-back guarantee if you are not satisfied with our service.',
    },
  ];

  const toggleFAQ = (index: number) => {
    setExpandedFAQ(expandedFAQ === index ? null : index);
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="border-b border-border bg-gradient-to-b from-surface-raised to-surface px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-4 text-4xl font-bold md:text-5xl">Simple, Transparent Pricing</h1>
          <p className="mb-8 text-lg text-text-muted">
            Choose the perfect plan to host your cricket auctions. No hidden fees, no surprises.
          </p>
        </div>
      </section>

      {/* Plans Section */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          {/* Loading State */}
          {plansLoading && (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          )}

          {/* Error State */}
          {plansError && !plansLoading && (
            <Card className="mb-8 border-danger/20 bg-danger/5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 flex-shrink-0 text-danger" size={20} />
                <div className="flex-1">
                  <h3 className="font-semibold text-danger">Error Loading Plans</h3>
                  <p className="text-sm text-text-muted">{plansError}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.reload()}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Plans Grid */}
          {!plansLoading && plans.length > 0 && (
            <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <PricingCard
                  key={plan.id}
                  plan={plan}
                  isCurrentPlan={subscription?.planId === plan.id && subscription?.status === 'ACTIVE'}
                />
              ))}
            </div>
          )}

          {/* No Plans */}
          {!plansLoading && plans.length === 0 && !plansError && (
            <Card className="border-info/20 bg-info/5 p-8 text-center">
              <p className="text-text-muted">Plans are not available at the moment. Please check back soon.</p>
            </Card>
          )}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-t border-border bg-surface-raised px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold">Frequently Asked Questions</h2>

          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <Card
                key={idx}
                className={`transition-all duration-200 ${
                  expandedFAQ === idx ? 'border-accent bg-accent/5' : ''
                }`}
              >
                <button
                  onClick={() => toggleFAQ(idx)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:text-accent cursor-pointer"
                >
                  <span className="font-semibold text-text">{item.question}</span>
                  <ChevronDown
                    size={20}
                    className={`flex-shrink-0 transition-transform duration-200 text-text-muted ${
                      expandedFAQ === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFAQ === idx && (
                  <div className="border-t border-border px-6 py-4">
                    <p className="text-sm text-text-muted">{item.answer}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-gradient-to-b from-surface-raised to-surface px-4 py-12">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-2xl font-bold">Ready to get started?</h2>
          <p className="mb-8 text-text-muted">
            {subscription?.status === 'ACTIVE'
              ? 'You have an active subscription. Visit the billing page to manage it.'
              : 'Choose a plan above and start hosting auctions today.'}
          </p>
          {subscription?.status === 'ACTIVE' ? (
            <Link href="/billing">
              <Button variant="primary" size="lg">
                Go to Billing
              </Button>
            </Link>
          ) : (
            <Link href={ROUTES.home}>
              <Button variant="primary" size="lg">
                Back to Home
              </Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
