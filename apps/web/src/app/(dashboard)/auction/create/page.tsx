'use client';

import React from 'react';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Link from 'next/link';

export default function CreateAuction() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Create Auction"
            description="Set up and configure your cricket auction"
            breadcrumbs={[
              { label: 'Workspace', href: '/auction/workspace' },
              { label: 'Create' },
            ]}
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <Card className="border-info/20 bg-info/5">
            <h3 className="mb-3 font-semibold text-info">Coming Soon</h3>
            <p className="mb-4 text-text-muted text-sm">
              The auction creation wizard will be available in Phase E when the auction engine is
              fully implemented.
            </p>
            <p className="mb-6 text-text-muted text-sm">
              In the meantime, you can browse public auctions or join existing ones with an access
              code.
            </p>
            <Link href="/auction/workspace">
              <Button variant="primary" size="sm">
                Back to Workspace
              </Button>
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}
