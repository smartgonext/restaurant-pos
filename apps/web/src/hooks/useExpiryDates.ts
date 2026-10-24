import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';

export interface ExpiryDateInfo {
  itemId: number;
  itemName: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean; // within 1 day
  status: 'good' | 'warning' | 'expired';
}

/**
 * Hook for managing item expiry dates
 * Critical for bakeries - can't sell day-old items
 * Validates expiry dates before adding to cart
 * Provides visual warnings and prevents sale of expired items
 */
export function useExpiryDates() {
  const [expiryMap, setExpiryMap] = useState<Map<number, Date>>(new Map());

  // Calculate days until expiry
  const getDaysUntilExpiry = useCallback((expiryDate: Date): number => {
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, []);

  // Check if item is expired
  const isExpired = useCallback((expiryDate: Date): boolean => {
    return getDaysUntilExpiry(expiryDate) < 0;
  }, [getDaysUntilExpiry]);

  // Check if item is expiring soon (within 24 hours)
  const isExpiringSoon = useCallback((expiryDate: Date): boolean => {
    const days = getDaysUntilExpiry(expiryDate);
    return days >= 0 && days <= 1;
  }, [getDaysUntilExpiry]);

  // Get expiry status for display
  const getExpiryStatus = useCallback((expiryDate: Date): ExpiryDateInfo['status'] => {
    if (isExpired(expiryDate)) return 'expired';
    if (isExpiringSoon(expiryDate)) return 'warning';
    return 'good';
  }, [isExpired, isExpiringSoon]);

  // Register item's expiry date
  const setExpiry = useCallback((itemId: number, expiryDate: Date | string) => {
    const date = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
    if (isNaN(date.getTime())) {
      console.error('[Expiry] Invalid date:', expiryDate);
      return;
    }
    setExpiryMap(prev => new Map(prev).set(itemId, date));
  }, []);

  // Get expiry info for an item
  const getExpiryInfo = useCallback((
    itemId: number,
    itemName: string,
    expiryDate?: Date | string | null
  ): ExpiryDateInfo | null => {
    const date = expiryDate
      ? (typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate)
      : expiryMap.get(itemId);

    if (!date || isNaN(date.getTime())) return null;

    const daysUntilExpiry = getDaysUntilExpiry(date);
    const expired = daysUntilExpiry < 0;
    const expiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 1;

    return {
      itemId,
      itemName,
      expiryDate: date,
      daysUntilExpiry,
      isExpired: expired,
      isExpiringSoon: expiringSoon,
      status: expired ? 'expired' : expiringSoon ? 'warning' : 'good',
    };
  }, [expiryMap, getDaysUntilExpiry]);

  // Validate if item can be sold
  const canSellItem = useCallback((itemId: number, expiryDate?: Date | string | null): boolean => {
    const info = getExpiryInfo(itemId, '', expiryDate);
    return info ? !info.isExpired : true; // allow if no expiry date set
  }, [getExpiryInfo]);

  // Get warning message for UI
  const getWarningMessage = useCallback((info: ExpiryDateInfo | null): string => {
    if (!info) return '';
    if (info.isExpired) {
      return `❌ EXPIRED on ${info.expiryDate.toLocaleDateString()}`;
    }
    if (info.isExpiringSoon) {
      if (info.daysUntilExpiry === 0) {
        return `⚠️ EXPIRES TODAY`;
      }
      return `⚠️ EXPIRES TOMORROW (${info.expiryDate.toLocaleDateString()})`;
    }
    return `✓ Expires in ${info.daysUntilExpiry} days`;
  }, []);

  // Format expiry date for display
  const formatExpiryDate = useCallback((date: Date): string => {
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }, []);

  // Get expiry badge color for UI
  const getExpiryBadgeColor = useCallback((status: ExpiryDateInfo['status']): string => {
    switch (status) {
      case 'expired':
        return 'bg-red-900 text-red-100 border-red-700';
      case 'warning':
        return 'bg-amber-900 text-amber-100 border-amber-700';
      case 'good':
        return 'bg-green-900 text-green-100 border-green-700';
      default:
        return 'bg-gray-700 text-gray-100';
    }
  }, []);

  // Clear old expiry dates (cleanup)
  const clearExpiry = useCallback((itemId: number) => {
    setExpiryMap(prev => {
      const newMap = new Map(prev);
      newMap.delete(itemId);
      return newMap;
    });
  }, []);

  return {
    setExpiry,
    getExpiryInfo,
    canSellItem,
    isExpired,
    isExpiringSoon,
    getDaysUntilExpiry,
    getWarningMessage,
    formatExpiryDate,
    getExpiryBadgeColor,
    clearExpiry,
    getExpiryStatus,
  };
}
