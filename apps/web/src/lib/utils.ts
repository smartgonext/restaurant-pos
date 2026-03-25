import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, symbol = '$') {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) return `${symbol}0.00`;
  return `${symbol}${numAmount.toFixed(2)}`;
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatNumber(num: number) {
  return Intl.NumberFormat('en-US').format(num);
}

export function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-success/10 text-success',
    trial: 'bg-blue-500/10 text-blue-400',
    inactive: 'bg-text-muted/10 text-text-muted',
    suspended: 'bg-danger/10 text-danger',
    expired: 'bg-danger/10 text-danger',
    placed: 'bg-blue-500/10 text-blue-400',
    confirmed: 'bg-info/10 text-info',
    preparing: 'bg-kot/10 text-kot',
    served: 'bg-billed/10 text-billed',
    billed: 'bg-billed/10 text-billed',
    paid: 'bg-paid/10 text-paid',
    cancelled: 'bg-danger/10 text-danger',
    pending: 'bg-pending/10 text-pending',
    in_kitchen: 'bg-blue-500/10 text-blue-400',
    ready: 'bg-success/10 text-success',
    available: 'bg-success/10 text-success',
    running: 'bg-blue-500/10 text-blue-400',
    reserved: 'bg-warning/10 text-warning',
    success: 'bg-success/10 text-success',
    failed: 'bg-danger/10 text-danger',
  };
  return colors[status] || 'bg-text-muted/10 text-text-muted';
}
