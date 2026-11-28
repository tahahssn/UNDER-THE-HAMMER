'use client';

import React from 'react';
import { CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react';
import { SubscriptionDetailDto } from '@uth/contracts';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export interface SubscriptionStatusProps {
  subscription: SubscriptionDetailDto | null;
  isLoading?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Small component displaying subscription status badge.
 * Shows ACTIVE (green), GRACE (yellow), CANCELLED (red), EXPIRED (gray) with icon and label.
 * Used in profile dropdown and room-creation modal.
 */
export const SubscriptionStatus: React.FC<SubscriptionStatusProps> = ({
  subscription,
  isLoading = false,
  size = 'md',
}) => {
  if (isLoading) {
    return <LoadingSpinner size="sm" />;
  }

  if (!subscription) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700">
        <XCircle size={size === 'sm' ? 14 : 16} />
        <span>No Subscription</span>
      </div>
    );
  }

  const statusConfig: Record<string, any> = {
    ACTIVE: {
      icon: CheckCircle2,
      label: 'Active',
      bgColor: 'bg-green-100',
      textColor: 'text-green-700',
    },
    GRACE: {
      icon: AlertCircle,
      label: 'Grace Period',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-700',
    },
    CANCELLED: {
      icon: XCircle,
      label: 'Cancelled',
      bgColor: 'bg-red-100',
      textColor: 'text-red-700',
    },
    EXPIRED: {
      icon: Clock,
      label: 'Expired',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-700',
    },
    PENDING: {
      icon: Clock,
      label: 'Pending',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-700',
    },
  };

  const config = statusConfig[subscription.status] || statusConfig.EXPIRED;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${config.bgColor} ${config.textColor}`}
    >
      <Icon size={size === 'sm' ? 14 : 16} />
      <span>{config.label}</span>
    </div>
  );
};

export default SubscriptionStatus;
