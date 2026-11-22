import React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import Card from '@/components/Card';

export default function News() {
  return (
    <div>
      {/* Header */}
      <section className="border-b border-border bg-surface px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            title="Cricket News"
            description="Latest news, updates, and commentary from the cricket world"
          />
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          {/* Filter/Sort placeholder */}
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <button className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-raised transition-colors">
                All
              </button>
              <button className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-raised transition-colors">
                International
              </button>
              <button className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-raised transition-colors">
                Leagues
              </button>
            </div>
          </div>

          {/* News Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Link key={i} href={`/news/article-${i}`}>
                <Card className="cursor-pointer hover:border-accent/50 transition-colors h-full">
                  <div className="mb-4 aspect-video rounded-lg bg-surface-raised" />
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-text-muted">Cricket News</span>
                    <span className="text-xs text-text-muted">2 days ago</span>
                  </div>
                  <h3 className="mb-2 font-semibold line-clamp-2">
                    Cricket News Article {i}
                  </h3>
                  <p className="text-sm text-text-muted line-clamp-3">
                    This is a placeholder for a cricket news article. Full news content and
                    articles will be available soon from our data providers.
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          {/* Empty State */}
          <div className="mt-16 rounded-lg border-2 border-dashed border-border bg-surface/50 py-12 text-center">
            <h3 className="mb-2 text-lg font-semibold">News coming soon</h3>
            <p className="text-text-muted">
              Cricket news and updates will be available in a future phase
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
