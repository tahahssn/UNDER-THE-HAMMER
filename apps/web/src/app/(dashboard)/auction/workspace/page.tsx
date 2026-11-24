'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, Search, Eye, Lock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';
import Card from '@/components/Card';
import Badge from '@/components/Badge';
import { ROUTES } from '@/lib/constants';

const ActionCard: React.FC<{
  icon: React.ComponentType<any>;
  title: string;
  description: string;
  cta: string;
  href?: string;
  variant?: 'default' | 'disabled';
}> = ({ icon: Icon, title, description, cta, href = '#', variant = 'default' }) => (
  <Card className={variant === 'disabled' ? 'opacity-50' : ''}>
    <div className="flex items-start justify-between mb-4">
      <Icon size={28} className="text-accent" />
      {variant === 'disabled' && (
        <Badge variant="warning">Coming Soon</Badge>
      )}
    </div>
    <h3 className="mb-2 font-semibold text-lg">{title}</h3>
    <p className="mb-4 text-sm text-text-muted">{description}</p>
    <Link href={href}>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={variant === 'disabled'}
      >
        {cta}
      </Button>
    </Link>
  </Card>
);

export default function AuctionWorkspace() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Auction Workspace"
            description="Host or join cricket auctions"
            breadcrumbs={[
              { label: 'Home', href: ROUTES.home },
              { label: 'Auction' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          {/* Quick Actions */}
          <div className="mb-12">
            <h2 className="mb-6 text-2xl font-bold">Quick Actions</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <ActionCard
                icon={Plus}
                title="Host Auction"
                description="Create and manage your own cricket auction"
                cta="Create New"
                href="/auction/create"
              />
              <ActionCard
                icon={Search}
                title="Join Public"
                description="Browse and join public auctions"
                cta="Browse Auctions"
                href="/auction/join-public"
              />
              <ActionCard
                icon={Lock}
                title="Join Private"
                description="Join with an access code"
                cta="Enter Code"
                href="/auction/join-private"
              />
              <ActionCard
                icon={Eye}
                title="View Subscription"
                description="Manage your hosting subscription"
                cta="View"
                href="/subscription"
              />
            </div>
          </div>

          {/* Subscription Status */}
          <div className="mb-12">
            <Card className="border-accent/20 bg-accent/5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="font-semibold mb-1">Subscription Status</h3>
                  <p className="text-sm text-text-muted">
                    Free account · Hosting requires an active subscription
                  </p>
                </div>
                <Link href="#billing">
                  <Button variant="primary" size="sm">
                    Upgrade Plan
                  </Button>
                </Link>
              </div>
            </Card>
          </div>

          {/* Active Auctions */}
          <div className="mb-12">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Active Auctions</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold">Auction</th>
                    <th className="text-left py-3 px-4 font-semibold">Status</th>
                    <th className="text-left py-3 px-4 font-semibold">Teams</th>
                    <th className="text-left py-3 px-4 font-semibold">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Empty state */}
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-text-muted">
                      No active auctions yet. Create or join one above.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Past Auctions */}
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Past Auctions</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold">Auction</th>
                    <th className="text-left py-3 px-4 font-semibold">Winner</th>
                    <th className="text-left py-3 px-4 font-semibold">Teams</th>
                    <th className="text-left py-3 px-4 font-semibold">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Empty state */}
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-text-muted">
                      No past auctions yet.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
