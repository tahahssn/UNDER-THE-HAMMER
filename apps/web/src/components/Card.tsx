import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'raised';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', children, variant = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-lg border border-border p-4 ${
        variant === 'raised' ? 'bg-surface-raised' : 'bg-surface'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);

Card.displayName = 'Card';

export default Card;
