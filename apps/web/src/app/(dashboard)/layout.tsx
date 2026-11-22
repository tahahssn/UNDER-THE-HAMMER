'use client';

import React from 'react';
import { useAuthGuard } from '@/hooks/useAuthGuard';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Guard: redirect to sign-in if not authenticated
  useAuthGuard();

  return <>{children}</>;
}
