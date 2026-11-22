import React from 'react';
import { LucideProps } from 'lucide-react';

export interface IconProps extends LucideProps {
  icon: React.ComponentType<LucideProps>;
}

export const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ icon: IconComponent, size = 24, className = '', ...props }, ref) => (
    <IconComponent
      ref={ref}
      size={size}
      className={`text-current transition-colors duration-200 ${className}`}
      {...props}
    />
  )
);

Icon.displayName = 'Icon';

export default Icon;
