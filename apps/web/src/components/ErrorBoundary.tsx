'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';

export interface ErrorBoundaryProps {
  error?: Error | null;
  reset?: () => void;
  children?: React.ReactNode;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg px-4">
          <div className="max-w-md text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-danger" />
            <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
            <p className="mb-6 text-text-muted">
              {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
            </p>
            <div className="flex gap-4 justify-center">
              <Button
                variant="primary"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try again
              </Button>
              <Link href="/">
                <Button variant="outline">Go home</Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional error component for use in Server Components or error.tsx pages
 */
export const ErrorDisplay: React.FC<ErrorBoundaryProps> = ({ error, reset }) => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <AlertTriangle size={48} className="mx-auto mb-4 text-danger" />
        <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
        <p className="mb-6 text-text-muted">
          {error?.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <div className="flex gap-4 justify-center">
          {reset && (
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
          )}
          <Link href="/">
            <Button variant="outline">Go home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ErrorBoundary;
