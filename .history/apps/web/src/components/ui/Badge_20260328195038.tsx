import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'kot' | 'outline' | 'secondary' | 'primary';
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export function Badge({ children, variant = 'default', size = 'sm', className, dot }: BadgeProps) {
  const variants = {
    default: 'bg-bg-tertiary text-text-secondary',
    primary: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-blue-500/10 text-blue-400',
    kot: 'bg-kot/10 text-kot',
    outline: 'bg-transparent border border-border text-text-secondary',
    secondary: 'bg-bg-tertiary text-text-muted border border-border/50',
  };

  const sizes = { sm: 'text-[10px] px-2 py-0.5', md: 'text-xs px-2.5 py-1' };

  return (
    <span className={cn('status-badge', variants[variant], sizes[size], className)}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', variant === 'success' ? 'bg-success' : variant === 'danger' ? 'bg-danger' : variant === 'warning' ? 'bg-warning' : 'bg-blue-400')} />}
      {children}
    </span>
  );
}
