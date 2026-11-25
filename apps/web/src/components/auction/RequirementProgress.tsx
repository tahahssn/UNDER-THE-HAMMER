import React from 'react';

interface Requirement {
  id: string;
  type: string;
  description: string;
  currentCount: number;
  minCount?: number;
  maxCount?: number;
  satisfied: boolean;
}

interface RequirementProgressProps {
  requirements: Requirement[];
  compact?: boolean;
}

/**
 * Display squad requirement progress with visual indicators.
 * Shows current count vs required range, satisfied/not satisfied state.
 * Color-coded: green (satisfied), yellow (at risk), red (violated).
 */
export const RequirementProgress: React.FC<RequirementProgressProps> = ({ requirements, compact = false }) => {
  const getStatusColor = (satisfied: boolean, requirement: Requirement) => {
    if (satisfied) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
    if (
      (requirement.minCount && requirement.currentCount >= requirement.minCount - 1) ||
      (requirement.maxCount && requirement.currentCount <= requirement.maxCount + 1)
    ) {
      return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
    }
    return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
  };

  const getStatusTextColor = (satisfied: boolean, requirement: Requirement) => {
    if (satisfied) return 'text-green-700 dark:text-green-300';
    if (
      (requirement.minCount && requirement.currentCount >= requirement.minCount - 1) ||
      (requirement.maxCount && requirement.currentCount <= requirement.maxCount + 1)
    ) {
      return 'text-yellow-700 dark:text-yellow-300';
    }
    return 'text-red-700 dark:text-red-300';
  };

  const formatRange = (req: Requirement): string => {
    if (req.minCount && req.maxCount) {
      return `${req.minCount}-${req.maxCount}`;
    }
    if (req.minCount) {
      return `Min ${req.minCount}`;
    }
    if (req.maxCount) {
      return `Max ${req.maxCount}`;
    }
    return 'N/A';
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {requirements.map((req) => (
          <div key={req.id} className={`px-3 py-2 border rounded-lg ${getStatusColor(req.satisfied, req)}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${getStatusTextColor(req.satisfied, req)}`}>
                {req.type}
              </span>
              <span className={`text-sm font-semibold ${getStatusTextColor(req.satisfied, req)}`}>
                {req.currentCount}/{formatRange(req)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requirements.map((req) => (
        <div key={req.id} className={`p-3 border rounded-lg ${getStatusColor(req.satisfied, req)}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-semibold ${getStatusTextColor(req.satisfied, req)}`}>
              {req.description}
            </span>
            <span className={`text-sm font-bold ${getStatusTextColor(req.satisfied, req)}`}>
              {req.currentCount}
            </span>
          </div>

          {/* Progress bar */}
          <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                req.satisfied
                  ? 'bg-green-500'
                  : (req.minCount && req.currentCount >= req.minCount - 1) ||
                    (req.maxCount && req.currentCount <= req.maxCount + 1)
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{
                width: req.maxCount
                  ? `${Math.min(100, (req.currentCount / req.maxCount) * 100)}%`
                  : req.minCount
                  ? `${Math.min(100, (req.currentCount / req.minCount) * 100)}%`
                  : '0%',
              }}
            />
          </div>

          {/* Range hint */}
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
            Required: {formatRange(req)}
          </div>
        </div>
      ))}
    </div>
  );
};
