'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import { joinWithCode } from '@/lib/api';
import { ROUTES } from '@/lib/constants';

export default function JoinPrivateAuctionPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!code.trim()) {
      setError('Please enter an invitation code');
      return;
    }

    setLoading(true);
    try {
      const response = await joinWithCode(code, 'TEAM_OWNER');
      if (response.success && response.data?.id) {
        setSuccess(true);
        // Redirect after 2 seconds
        setTimeout(() => {
          window.location.href = `/auction/${response.data.id}`;
        }, 1500);
      } else {
        setError(response.error || 'Invalid or expired code');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join auction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <PageHeader
            title="Join Private Auction"
            description="Enter the invitation code to join a private auction"
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Auction', href: ROUTES.auctionWorkspace },
              { label: 'Join Private' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <Card className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Code Input */}
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Invitation Code <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g., ABC123-DEF456"
                  disabled={success}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-lg font-mono text-primary placeholder-text-muted focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-text-muted">
                  Enter the unique code provided by the auction host
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 p-4">
                  <AlertCircle className="mt-0.5 flex-shrink-0 text-danger" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-danger">Error</p>
                    <p className="text-sm text-danger">{error}</p>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 p-4">
                  <CheckCircle2 className="mt-0.5 flex-shrink-0 text-success" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-success">Success!</p>
                    <p className="text-sm text-success">Joining auction... Redirecting...</p>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={loading}
                disabled={loading || success || !code.trim()}
                className="w-full"
              >
                Join Auction
              </Button>
            </form>

            {/* Info */}
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="mb-3 font-semibold">Don't have a code?</h3>
              <p className="mb-4 text-sm text-text-muted">
                Ask the auction host to send you an invitation code. They can generate one from their auction room settings.
              </p>
            </div>
          </Card>

          {/* Help Section */}
          <Card className="mt-6 border-info/20 bg-info/5 p-6">
            <h3 className="mb-3 font-semibold">How invitation codes work</h3>
            <ul className="space-y-2 text-sm text-text-muted">
              <li>• Each code can be used a limited number of times</li>
              <li>• Codes expire after a certain period (usually 7 days)</li>
              <li>• You'll be assigned a team based on the auction's allocation method</li>
              <li>• Only one team assignment per invitation code</li>
            </ul>
          </Card>
        </div>
      </section>
    </div>
  );
}
