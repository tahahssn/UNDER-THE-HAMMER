import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  children: React.ReactNode;
}

const variantClasses = {
  success: 'bg-green-900/30 text-green-300 border border-green-700/50',
  warning: 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50',
  danger: 'bg-red-900/30 text-red-300 border border-red-700/50',
  info: 'bg-blue-900/30 text-blue-300 border border-blue-700/50',
  neutral: 'bg-gray-800/30 text-gray-300 border border-gray-700/50',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = '', variant = 'neutral', children, ...props }, ref) => (
    <span
      ref={ref}
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
);

Badge.displayName = 'Badge';

export default Badge;
