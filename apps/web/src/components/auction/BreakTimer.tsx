import React, { useEffect, useState } from 'react';

interface BreakTimerProps {
  deadline: Date;
  isExpired: boolean;
  onExpired?: () => void;
}

/**
 * Server-driven countdown timer for auction breaks.
 * Client receives deadline from server and counts down locally.
 * Reconnection triggers server state sync to prevent drift.
 */
export const BreakTimer: React.FC<BreakTimerProps> = ({ deadline, isExpired, onExpired }) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    if (isExpired) {
      setTimeRemaining(0);
      onExpired?.();
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline).getTime();
      const remaining = Math.max(0, Math.floor((deadlineTime - now) / 1000));

      setTimeRemaining(remaining);

      if (remaining === 0 && onExpired) {
        onExpired();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100); // Update 10x per second for smooth display

    return () => clearInterval(interval);
  }, [deadline, isExpired, onExpired]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const percentageRemaining = timeRemaining > 0 ? (timeRemaining / 300) * 100 : 0; // Assume 5 min max
  const isLowTime = timeRemaining <= 30;
  const isVeryLowTime = timeRemaining <= 10;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-sm text-gray-600 dark:text-gray-400">Break Time Remaining</div>

      <div className="relative w-32 h-32 flex items-center justify-center">
        {/* Circular progress */}
        <svg className="absolute w-full h-full" viewBox="0 0 120 120">
          {/* Background circle */}
          <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-200 dark:text-gray-700" />

          {/* Progress circle */}
          <circle
            cx="60"
            cy="60"
            r="55"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 55}`}
            strokeDashoffset={`${2 * Math.PI * 55 * (1 - percentageRemaining / 100)}`}
            strokeLinecap="round"
            className={`transition-colors ${
              isVeryLowTime ? 'text-red-500' : isLowTime ? 'text-yellow-500' : 'text-green-500'
            }`}
          />
        </svg>

        {/* Time text */}
        <div className={`text-center font-mono ${isVeryLowTime ? 'text-red-600' : isLowTime ? 'text-yellow-600' : 'text-gray-900'} text-3xl font-bold`}>
          {formatTime(timeRemaining)}
        </div>
      </div>

      {isVeryLowTime && (
        <div className="animate-pulse text-sm text-red-600 font-semibold">
          Break ending soon
        </div>
      )}
    </div>
  );
};
