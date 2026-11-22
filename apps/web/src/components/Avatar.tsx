import React from 'react';
import Image from 'next/image';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-base',
  lg: 'h-12 w-12 text-lg',
};

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className = '', src, alt = 'Avatar', initials, size = 'md', ...props }, ref) => {
    const sizeClass = sizeClasses[size];

    return (
      <div
        ref={ref}
        className={`flex items-center justify-center rounded-full bg-surface-raised border border-border overflow-hidden ${sizeClass} ${className}`}
        {...props}
      >
        {src ? (
          <Image src={src} alt={alt} fill className="object-cover" />
        ) : initials ? (
          <span className="text-text font-semibold">{initials}</span>
        ) : (
          <span className="text-text-muted">-</span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

export default Avatar;
