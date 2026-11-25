import React from 'react';
import { Button } from '../Button';

interface BreakControlsProps {
  isHost: boolean;
  isBreakActive: boolean;
  canExtend: boolean;
  canReduce: boolean;
  onExtend: () => Promise<void>;
  onReduce: () => Promise<void>;
  onEnd: () => Promise<void>;
  isLoading?: boolean;
}

/**
 * Host-only break control buttons: extend, reduce, end.
 * Hidden from non-hosts (spectators, non-host team owners).
 * Buttons disabled during loading or when action not permitted.
 */
export const BreakControls: React.FC<BreakControlsProps> = ({
  isHost,
  isBreakActive,
  canExtend,
  canReduce,
  onExtend,
  onReduce,
  onEnd,
  isLoading = false,
}) => {
  if (!isHost || !isBreakActive) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="text-sm font-semibold text-gray-900 dark:text-white">Host Controls</div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!canExtend || isLoading}
          onClick={onExtend}
          className="cursor-pointer"
        >
          + Extend
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={!canReduce || isLoading}
          onClick={onReduce}
          className="cursor-pointer"
        >
          − Reduce
        </Button>

        <Button
          variant="danger"
          size="sm"
          disabled={isLoading}
          onClick={onEnd}
          className="cursor-pointer"
        >
          End Break
        </Button>
      </div>

      <div className="text-xs text-gray-600 dark:text-gray-400">
        Extend/reduce by up to 300 seconds
      </div>
    </div>
  );
};
