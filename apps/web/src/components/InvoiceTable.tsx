'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Invoice } from '@uth/contracts';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export interface InvoiceTableProps {
  invoices: Invoice[];
  isLoading?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onDownload?: (invoiceId: string) => void;
}

/**
 * Reusable component for invoice history.
 * Displays table on desktop, card view on mobile.
 * Props: invoices (paginated array), isLoading, pagination handlers.
 * Responsive with no hardcoded column widths.
 */
export const InvoiceTable: React.FC<InvoiceTableProps> = ({
  invoices,
  isLoading = false,
  page = 1,
  pageSize = 10,
  total = 0,
  onPreviousPage,
  onNextPage,
  onDownload,
}) => {
  /**
   * Format invoice date to locale string
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  /**
   * Format amount from paisa to PKR
   */
  const formatAmount = (minorUnits: number | bigint, currency: string): string => {
    const major = Number(minorUnits) / 100;
    return `${currency} ${major.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getStatusColor = (status: string): 'success' | 'warning' | 'danger' | 'info' => {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'info';
    }
  };

  const hasNextPage = page * pageSize < total;
  const hasPreviousPage = page > 1;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card className="border-dashed p-8 text-center">
        <p className="text-sm text-text-muted">No invoices yet</p>
      </Card>
    );
  }

  return (
    <div>
      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full">
          <thead className="border-b border-border bg-surface-raised">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-text">Date</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-text">Invoice #</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-text">Amount</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-text">Status</th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-text">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-border transition-colors hover:bg-surface-raised/50"
              >
                <td className="px-6 py-4 text-sm">{formatDate(invoice.issuedAt)}</td>
                <td className="px-6 py-4 text-sm font-mono text-text-muted">{invoice.number}</td>
                <td className="px-6 py-4 text-sm font-semibold">
                  {formatAmount(invoice.amountMinor, invoice.currency)}
                </td>
                <td className="px-6 py-4 text-sm">
                  <Badge variant={getStatusColor(invoice.status)}>
                    {invoice.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  <button
                    onClick={() => onDownload?.(invoice.id)}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-blue-600 transition-colors hover:bg-blue-50"
                    title="Download invoice PDF"
                    disabled={!onDownload}
                  >
                    <Download size={16} />
                    <span className="text-xs">Download</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-3 md:hidden">
        {invoices.map((invoice) => (
          <Card key={invoice.id} className="p-4">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{formatDate(invoice.issuedAt)}</p>
                <p className="text-xs text-text-muted">Invoice #{invoice.number}</p>
              </div>
              <Badge variant={getStatusColor(invoice.status)}>
                {invoice.status}
              </Badge>
            </div>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-text-muted">Amount</span>
              <span className="font-semibold">
                {formatAmount(invoice.amountMinor, invoice.currency)}
              </span>
            </div>
            <button
              onClick={() => onDownload?.(invoice.id)}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-100"
              title="Download invoice PDF"
              disabled={!onDownload}
            >
              <Download size={16} />
              <span>Download PDF</span>
            </button>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviousPage}
            disabled={!hasPreviousPage}
            className="flex cursor-pointer items-center gap-2"
          >
            <ChevronLeft size={16} />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNextPage}
            disabled={!hasNextPage}
            className="flex cursor-pointer items-center gap-2"
          >
            Next
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceTable;
