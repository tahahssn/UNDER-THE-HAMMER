'use client';

import React, { useEffect, useState } from 'react';
import { useBreakSocket, BreakStatus } from '@/hooks/useBreakSocket';

interface BreakTimerProps {
  auctionId: string;
  isVisible: boolean;
  onBreakEnd?: () => void;
}

/**
 * BreakTimer: Displays auction break countdown overlay
 * 
 * Features:
 * - Displays current break timer (minutes:seconds)
 * - Subscribes to break:updated events
 * - On reconnect: syncs timer from server state
 * - Shows squad comparison overlay during break
 * - Only visible when room.currentState === 'break'
 */
export default function BreakTimer({
  auctionId,
  isVisible,
  onBreakEnd,
}: BreakTimerProps) {
  const { breakStatus, isBreakActive } = useBreakSocket(auctionId);
  const [displayTime, setDisplayTime] = useState<string>('');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check for reduced motion preference
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(media.matches);

    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  // Update countdown display
  useEffect(() => {
    if (!breakStatus) return;

    const updateDisplay = () => {
      const now = Date.now();
      const remaining = Math.max(0, breakStatus.deadline.getTime() - now);
      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      setDisplayTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);

      // Break ended
      if (remaining <= 0) {
        onBreakEnd?.();
      }
    };

    updateDisplay();

    // Update every 100ms for smooth countdown
    const interval = setInterval(updateDisplay, 100);
    return () => clearInterval(interval);
  }, [breakStatus, onBreakEnd]);

  if (!isVisible || !isBreakActive || !breakStatus) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black/50 z-50 ${
        prefersReducedMotion ? '' : 'animate-fadeIn'
      }`}
    >
      <div
        className={`flex flex-col items-center gap-6 rounded-2xl bg-surface-raised border-2 border-accent p-8 max-w-md w-full mx-4 ${
          prefersReducedMotion ? '' : 'animate-scaleIn'
        }`}
      >
        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-text">Break</h2>
          <p className="text-sm text-text-muted mt-1">
            {breakStatus.reason || 'Time to regroup and strategize'}
          </p>
        </div>

        {/* Countdown Display */}
        <div className="flex flex-col items-center gap-4">
          <div
            className={`font-mono text-7xl font-bold text-accent tabular-nums ${
              prefersReducedMotion ? '' : 'animate-pulse'
            }`}
            style={{
              animationDuration: prefersReducedMotion ? 'none' : '1s',
            }}
          >
            {displayTime}
          </div>
          <p className="text-sm text-text-muted">remaining</p>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-bg overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-warning transition-all"
            style={{
              width: `${
                ((breakStatus.originalDurationSeconds * 1000 -
                  Math.max(0, breakStatus.deadline.getTime() - Date.now())) /
                  (breakStatus.originalDurationSeconds * 1000)) *
                100
              }%`,
            }}
          />
        </div>

        {/* Squad Comparison (Placeholder) */}
        <div className="w-full pt-6 border-t border-border">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
            Squad Overview
          </p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded bg-bg p-2">
              <p className="text-xs text-text-muted">Players Bought</p>
              <p className="text-lg font-semibold text-accent">--</p>
            </div>
            <div className="rounded bg-bg p-2">
              <p className="text-xs text-text-muted">Budget Used</p>
              <p className="text-lg font-semibold text-accent">--</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
