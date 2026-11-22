import React from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import Button from '@/components/Button';

export default function NewsArticle({ params }: { params: { slug: string } }) {
  return (
    <div>
      {/* Back link */}
      <div className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto max-w-4xl">
          <Link href="/news" className="text-sm font-semibold text-accent hover:underline">
            ← Back to News
          </Link>
        </div>
      </div>

      {/* Article Header */}
      <section className="border-b border-border px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex gap-4 text-sm text-text-muted">
            <span>Cricket News</span>
            <span>•</span>
            <span>Published 2 days ago</span>
          </div>
          <h1 className="mb-4 text-5xl font-bold">News Article: {params.slug}</h1>
          <p className="text-xl text-text-muted">
            This is a placeholder for the article header and summary
          </p>
        </div>
      </section>

      {/* Article Content */}
      <section className="px-4 py-12">
        <div className="mx-auto max-w-4xl">
          {/* Featured Image */}
          <div className="mb-8 aspect-video rounded-lg bg-surface-raised border border-border" />

          {/* Content */}
          <article className="prose prose-invert max-w-none mb-12">
            <div className="mb-6 p-6 bg-surface-raised border border-border rounded-lg">
              <p className="text-text-muted mb-0">
                Full article content will be available when cricket news data is integrated in Phase M.
              </p>
            </div>

            <h2 className="mt-8 mb-4 text-2xl font-bold">Article Structure</h2>
            <p className="text-text-muted mb-4">
              This page demonstrates the structure for news articles. When news API is integrated:
            </p>
            <ul className="text-text-muted space-y-2">
              <li>✓ Article title, date, and author information</li>
              <li>✓ Featured image and media galleries</li>
              <li>✓ Full article body with rich text</li>
              <li>✓ Source attribution and data provider credits</li>
              <li>✓ Related articles suggestions</li>
              <li>✓ User engagement features (comments, shares)</li>
            </ul>
          </article>

          {/* Related Articles */}
          <div className="border-t border-border pt-12">
            <h3 className="mb-6 text-2xl font-bold">Related Articles</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Link key={i} href={`/news/article-${i}`}>
                  <div className="p-4 border border-border rounded-lg hover:border-accent/50 transition-colors cursor-pointer">
                    <p className="text-sm text-text-muted mb-2">Cricket News</p>
                    <h4 className="font-semibold mb-2">Related Article {i}</h4>
                    <p className="text-sm text-text-muted">Placeholder for related article</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
