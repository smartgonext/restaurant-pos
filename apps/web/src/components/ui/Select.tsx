import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, containerClassName, className, children, ...props }, ref) => {
    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {label && <label className="text-sm font-medium text-text-secondary">{label}</label>}
        <div className="relative group">
          <select
            ref={ref}
            className={cn(
              "glass-input w-full appearance-none pr-10 cursor-pointer transition-all",
              "hover:border-border-focus focus:ring-1 focus:ring-blue-500/50",
              error && "border-danger focus:ring-danger/50",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted group-hover:text-text-secondary transition-colors">
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
