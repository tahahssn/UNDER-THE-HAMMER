import React from 'react';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';

export default function Players() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Player Directory"
            description="Browse cricket players and statistics"
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <Card className="border-info/20 bg-info/5">
            <h3 className="mb-3 font-semibold text-info">Coming Soon</h3>
            <p className="text-text-muted text-sm">
              The player directory will be available in Phase M when player data and statistics
              are integrated from cricket data providers.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
