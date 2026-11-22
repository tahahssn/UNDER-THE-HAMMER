import React from 'react';
import Link from 'next/link';
import Button from '@/components/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-5xl font-bold text-accent">404</h1>
        <h2 className="mb-4 text-2xl font-bold">Page not found</h2>
        <p className="mb-6 text-text-muted">
          Sorry, we couldn&apos;t find the page you&apos;re looking for.
        </p>
        <Link href="/">
          <Button variant="primary" size="lg">
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
