import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'cyan';
}

const colorMap = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', glow: 'shadow-[0_0_20px_rgba(59,130,246,0.15)]' },
  green: { bg: 'bg-success/10', text: 'text-success', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]' },
  orange: { bg: 'bg-warning/10', text: 'text-warning', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]' },
  red: { bg: 'bg-danger/10', text: 'text-danger', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', glow: 'shadow-[0_0_20px_rgba(168,85,247,0.15)]' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]' },
};

export function StatCard({ label, value, change, icon: Icon, color = 'blue' }: StatCardProps) {
  const c = colorMap[color];
  const isPositive = (change || 0) >= 0;

  return (
    <div className={cn('glass-card p-5 flex flex-col gap-3 hover:scale-[1.02] transition-all duration-300', c.glow)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary font-medium">{label}</span>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', c.bg)}>
          <Icon className={cn('w-5 h-5', c.text)} />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-text-primary">{value}</span>
        {change !== undefined && (
          <div className={cn('flex items-center gap-1 text-xs font-medium', isPositive ? 'text-success' : 'text-danger')}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
    </div>
  );
}
