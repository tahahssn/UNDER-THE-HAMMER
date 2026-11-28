'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import InvoiceTable from '@/components/InvoiceTable';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useSubscription } from '@/hooks/useSubscription';
import { getInvoices } from '@/lib/api';
import { SubscriptionDetailDto, Invoice } from '@uth/contracts';
import CancelSubscriptionModal from '@/components/CancelSubscriptionModal';

/**
 * Billing page component.
 * Displays current subscription details and invoice history.
 * Shows active subscription with renewal date and price.
 * Paginated invoice history from GET /v1/subscriptions/invoices.
 * Shows 'No subscription' message with CTA if not subscribed.
 */
export default function BillingPage() {
  const searchParams = useSearchParams();
  const { subscription, isLoading: subscriptionLoading, refetch } = useSubscription();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const pageSize = 10;

  // Check for success callback from checkout
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessToast(true);
      const timer = setTimeout(() => setShowSuccessToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Fetch invoices when subscription is available
  useEffect(() => {
    if (!subscription || subscription.status !== 'ACTIVE') {
      setInvoicesLoading(false);
      return;
    }

    const fetchInvoices = async () => {
      try {
        setInvoicesLoading(true);
        setInvoicesError(null);
        const response = await getInvoices({
          skip: (currentPage - 1) * pageSize,
          take: pageSize,
        });

        if (response.success && response.data) {
          setInvoices(response.data.invoices);
          setTotalInvoices(response.data.total);
        } else {
          setInvoicesError(response.error || 'Failed to load invoices');
        }
      } catch (err) {
        console.error('Invoices fetch error:', err);
        setInvoicesError('Failed to fetch invoice history');
      } finally {
        setInvoicesLoading(false);
      }
    };

    fetchInvoices();
  }, [subscription, currentPage]);

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
   * Format amount from paisa to PKR
   */
  const formatPrice = (minorUnits: number | bigint, currency: string): string => {
    const major = Number(minorUnits) / 100;
    return `${currency} ${major.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

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

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage * pageSize < totalInvoices) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    // Placeholder for S3 signed URL generation
    console.log('Download invoice:', invoiceId);
    // In Phase E, this will generate and redirect to S3 signed URL
  };

  const handleCancelSubscription = async () => {
    // Trigger refetch after cancellation
    await refetch();
    setShowCancelModal(false);
  };

  // Loading state
  if (subscriptionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-success/20 bg-success/10 p-4 shadow-lg">
          <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-success" />
          <div>
            <h3 className="font-semibold text-success">Subscription Activated</h3>
            <p className="text-sm text-text-muted">Your subscription is now active!</p>
          </div>
        </div>
      )}

      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-2 text-3xl font-bold">Billing & Subscription</h1>
          <p className="text-text-muted">Manage your subscription and view invoice history</p>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          {/* No Active Subscription */}
          {!subscription && (
            <Card className="mb-8 border-info/20 bg-info/5">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="mb-1 text-lg font-semibold">No Active Subscription</h3>
                  <p className="text-sm text-text-muted">
                    You don't have an active subscription. Subscribe to a plan to host auctions.
                  </p>
                </div>
                <Link href="/pricing" className="flex-shrink-0">
                  <Button variant="primary" size="sm" className="cursor-pointer">
                    View Plans
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Current Subscription Section */}
          {subscription && (
            <div className="mb-12">
              <h2 className="mb-6 text-2xl font-bold">Current Subscription</h2>

              <Card
                className={`p-6 ${
                  subscription.status === 'ACTIVE'
                    ? 'border-accent/20 bg-accent/5'
                    : 'border-warning/20 bg-warning/5'
                }`}
              >
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Plan Info */}
                  <div>
                    <div className="mb-4">
                      <h3 className="text-2xl font-bold">{subscription.plan.name}</h3>
                      <p className="mt-1 text-sm text-text-muted">
                        {formatPrice(subscription.plan.priceMinor, subscription.plan.currency)} /{' '}
                        {subscription.plan.period.toLowerCase()}
                      </p>
                    </div>
                    <Badge variant={getStatusColor(subscription.status)}>
                      {subscription.status}
                    </Badge>
                  </div>

                  {/* Renewal & Actions */}
                  <div>
                    {subscription.currentPeriodEnd && (
                      <div className="mb-4 flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-text-muted" />
                        <div>
                          <p className="text-text-muted">
                            {subscription.cancelAtPeriodEnd
                              ? 'Ends on'
                              : 'Renews on'}
                          </p>
                          <p className="font-semibold">
                            {formatDate(subscription.currentPeriodEnd)}
                          </p>
                        </div>
                      </div>
                    )}

                    {subscription.cancelAtPeriodEnd && (
                      <div className="mb-4 rounded-md border border-warning/30 bg-warning/5 p-3">
                        <p className="text-sm text-warning font-medium">
                          Your subscription will cancel at the end of this period.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Link href="/pricing" className="flex-1">
                        <Button variant="outline" size="sm" className="w-full cursor-pointer">
                          View All Plans
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCancelModal(true)}
                        className="flex-1 cursor-pointer text-danger hover:bg-danger/10"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Invoice History Section */}
          {subscription && subscription.status === 'ACTIVE' && (
            <div>
              <h2 className="mb-6 text-2xl font-bold">Invoice History</h2>

              {invoicesError && (
                <Card className="mb-6 border-danger/20 bg-danger/5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-1 flex-shrink-0 text-danger" size={20} />
                    <div>
                      <h3 className="font-semibold text-danger">Error</h3>
                      <p className="text-sm text-text-muted">{invoicesError}</p>
                    </div>
                  </div>
                </Card>
              )}

              <InvoiceTable
                invoices={invoices}
                isLoading={invoicesLoading}
                page={currentPage}
                pageSize={pageSize}
                total={totalInvoices}
                onPreviousPage={handlePreviousPage}
                onNextPage={handleNextPage}
                onDownload={handleDownloadInvoice}
              />
            </div>
          )}

          {/* Pagination Info */}
          {subscription && invoices.length === 0 && !invoicesLoading && (
            <Card className="border-dashed p-8 text-center">
              <p className="text-sm text-text-muted">No invoices yet</p>
            </Card>
          )}
        </div>
      </section>

      {/* Cancel Subscription Modal */}
      {subscription && (
        <CancelSubscriptionModal
          subscription={subscription}
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancelSubscription}
        />
      )}
    </div>
  );
}
