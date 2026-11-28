'use client';

import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { SubscriptionDetailDto } from '@uth/contracts';
import { api } from '@/lib/api';

export interface CancelSubscriptionModalProps {
  subscription: SubscriptionDetailDto | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/**
 * Modal for subscription cancellation confirmation.
 * Shows warning: 'Your subscription will end at <renewalDate>.'
 * Calls POST /v1/subscriptions/:id/cancel on confirm.
 * Handles errors (403 ownership, 404 not found, network).
 */
export const CancelSubscriptionModal: React.FC<CancelSubscriptionModalProps> = ({
  subscription,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !subscription) {
    return null;
  }

  /**
   * Format date to locale string
   */
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  /**
   * Handle cancellation
   */
  const handleCancel = async () => {
    if (!subscription) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.post(`/v1/subscriptions/${subscription.id}/cancel`);

      if (response.data?.success || response.status === 200) {
        await onConfirm();
        onClose();
      } else {
        setError('Failed to cancel subscription. Please try again.');
      }
    } catch (err: any) {
      console.error('Cancel subscription error:', err);

      // Handle specific error codes
      if (err.response?.status === 403) {
        setError('You do not have permission to cancel this subscription.');
      } else if (err.response?.status === 404) {
        setError('Subscription not found.');
      } else {
        setError(err.response?.data?.error || 'Failed to cancel subscription. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-lg">
          {/* Header */}
          <div className="mb-4 flex items-center gap-3 border-b border-border pb-4">
            <div className="rounded-full bg-warning/20 p-2">
              <AlertCircle size={24} className="text-warning" />
            </div>
            <h2 className="text-lg font-bold">Cancel Subscription?</h2>
          </div>

          {/* Error State */}
          {error && (
            <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 p-3">
              <p className="text-sm text-danger font-medium">{error}</p>
            </div>
          )}

          {/* Warning Message */}
          <div className="mb-6 space-y-3">
            <p className="text-sm text-text">
              If you cancel your subscription, you will lose access to:
            </p>
            <ul className="space-y-2 text-sm text-text-muted">
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-muted" />
                <span>Hosting new auctions</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-muted" />
                <span>Advanced features and analytics</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-muted" />
                <span>Priority support</span>
              </li>
            </ul>

            {subscription.currentPeriodEnd && (
              <p className="text-sm font-semibold text-warning">
                Your subscription will end on {formatDate(subscription.currentPeriodEnd)}.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 cursor-pointer"
            >
              Keep Subscription
            </Button>
            <Button
              variant="danger"
              onClick={handleCancel}
              disabled={isLoading}
              className="flex-1 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Subscription'
              )}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
};

export default CancelSubscriptionModal;
