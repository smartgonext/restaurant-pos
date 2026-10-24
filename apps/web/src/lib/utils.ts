import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SERVER_BASE_URL } from './config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, symbol = '₹') {
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

// Resolve image URLs returned from the API to full absolute URLs.
export function resolveImageUrl(image?: string | null) {
  if (!image) return '';
  // Normalize backslashes (Windows environment compatibility)
  let cleanImage = image.replace(/\\/g, '/');
  if (cleanImage.startsWith('http')) return cleanImage;
  if (cleanImage.startsWith('/api')) return cleanImage;

  const slashPrefixed = cleanImage.startsWith('/') ? cleanImage : '/' + cleanImage;
  return `${SERVER_BASE_URL}${slashPrefixed}`;
}

/**
 * Robustly opens a new tab/window for both Web and Electron (file:// protocol)
 * Handles HashRouter vs BrowserRouter automatically.
 */
export function openNewTab(path: string) {
  const isFileProtocol = window.location.protocol === 'file:';
  const isElectron = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');
  
  // If we are in Electron or File protocol, we are likely using HashRouter
  if (isFileProtocol || isElectron) {
    const base = window.location.href.split('#')[0];
    const hashPath = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : '/' + path}`;
    window.open(base + hashPath, '_blank');
  } else {
    // Standard web browser environment
    window.open(path, '_blank');
  }
}
