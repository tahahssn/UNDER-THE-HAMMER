'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { SubscriptionPlan } from '@uth/contracts';

export interface PricingCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan?: boolean;
}

/**
 * Reusable pricing card component displaying a single subscription plan.
 * Shows plan name, price (formatted from paisa to PKR), period, entitlements.
 * CTA button: 'Subscribe Now' (links to /checkout/:planId) or 'Current Plan' (if isCurrentPlan).
 * Responsive with no hardcoded sizes.
 */
export const PricingCard: React.FC<PricingCardProps> = ({ plan, isCurrentPlan = false }) => {
  /**
   * Format price from paisa (minor units) to PKR (major units).
   * Example: 50000 paisa → 'PKR 500'
   */
  const formatPrice = (minorUnits: number | bigint, currency: string): string => {
    const major = Number(minorUnits) / 100;
    return `${currency} ${major.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  const periodLabel = plan.period === 'MONTH' ? 'month' : 'year';
  const formattedPrice = formatPrice(plan.priceMinor, plan.currency);

  // Define entitlements based on plan key
  // In a real app, this would come from plan.entitlements array
  const getEntitlements = (): string[] => {
    const baseEntitlements = [
      'Host auctions',
      'Real-time bidding',
      'Chat & notifications',
    ];

    if (plan.key === 'premium' || plan.key === 'elite') {
      return [
        ...baseEntitlements,
        'Advanced analytics',
        'Priority support',
        'Custom branding',
      ];
    }

    if (plan.key === 'elite') {
      return [
        ...baseEntitlements,
        'Unlimited everything',
        '24/7 dedicated support',
        'API access',
      ];
    }

    return baseEntitlements;
  };

  const entitlements = getEntitlements();

  return (
    <Card
      className={`flex h-full flex-col p-6 transition-all duration-300 ${
        isCurrentPlan
          ? 'border-2 border-accent bg-accent/5 shadow-lg'
          : 'hover:border-accent hover:shadow-md'
      }`}
    >
      {/* Plan Name and Badge */}
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-xl font-bold capitalize">{plan.name}</h3>
        {isCurrentPlan && (
          <Badge variant="success" className="text-xs">
            Current Plan
          </Badge>
        )}
      </div>

      {/* Price */}
      <div className="mb-6">
        <div className="mb-1 flex items-baseline gap-1">
          <span className="text-4xl font-bold">{formattedPrice.split(' ')[0]}</span>
          <span className="text-2xl font-bold text-text-muted">{formattedPrice.split(' ')[1]}</span>
        </div>
        <p className="text-sm text-text-muted">
          per {periodLabel}
        </p>
      </div>

      {/* Entitlements */}
      <div className="mb-8 flex-1">
        <ul className="space-y-3">
          {entitlements.map((entitlement, idx) => (
            <li key={idx} className="flex items-start gap-3">
              <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-success" />
              <span className="text-sm text-text">{entitlement}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA Button */}
      {isCurrentPlan ? (
        <Button variant="outline" disabled className="w-full cursor-not-allowed">
          Current Plan
        </Button>
      ) : (
        <Link href={`/checkout/${plan.id}`} className="block">
          <Button variant="primary" className="w-full cursor-pointer">
            Subscribe Now
          </Button>
        </Link>
      )}
    </Card>
  );
};

export default PricingCard;
