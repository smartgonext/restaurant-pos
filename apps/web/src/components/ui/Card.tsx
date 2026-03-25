import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover = false, padding = true, onClick }: CardProps) {
  return (
    <div onClick={onClick} className={cn('glass-card', padding && 'p-4', hover && 'hover:shadow-glow-sm hover:border-blue-500/30 cursor-pointer', 'transition-all duration-300', className)}>
      {children}
    </div>
  );
}
