'use client';

import React from 'react';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';
import Button from '@/components/Button';

export default function Teams() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="My Teams"
            description="Create and manage cricket teams"
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <Card className="border-info/20 bg-info/5">
            <h3 className="mb-3 font-semibold text-info">Coming Soon</h3>
            <p className="text-text-muted text-sm">
              Team management will be available in Phase E when auction creation is ready.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
