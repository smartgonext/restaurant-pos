import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  variant = 'primary', size = 'md', loading, isLoading, icon, children, className, disabled, ...props
}: ButtonProps) {
  const spinner = loading || isLoading;

  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    success: 'bg-success/20 text-success border border-success/30 hover:bg-success/30 px-4 py-2 rounded-lg transition-all',
    warning: 'bg-warning/20 text-warning border border-warning/30 hover:bg-warning/30 px-4 py-2 rounded-lg transition-all',
    ghost: 'text-text-secondary hover:text-text-primary hover:bg-bg-hover px-3 py-2 rounded-lg transition-all',
    outline: 'border border-border text-text-primary hover:bg-bg-hover px-4 py-2 rounded-lg transition-all',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-2.5',
    icon: 'p-0',
  };

  return (
    <button
      className={cn(variants[variant], sizes[size], 'inline-flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed', className)}
      disabled={disabled || spinner}
      {...props}
    >
      {spinner ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
