'use client';

import React from 'react';
import { ErrorDisplay } from '@/components/ErrorBoundary';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorDisplay error={error} reset={reset} />;
}
