import { useEffect, useRef, useCallback, useState } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';

interface InventoryUpdate {
  itemId: number;
  currentStock: number;
  updatedAt: string;
  terminalId?: string;
  action: 'add' | 'remove' | 'adjust';
  quantity: number;
}

interface InventoryCache {
  [itemId: number]: {
    stock: number;
    updatedAt: string;
    lastSyncedAt: string;
  };
}

/**
 * Hook for real-time inventory tracking
 * Subscribes to inventory changes via WebSocket
 * Maintains local cache and syncs with server
 * For bakeries: updates every minute, critical for fast-moving stock
 */
export function useRealtimeInventory(restaurantId: number) {
  const { socket, isConnected } = useSocket();
  const [cache, setCache] = useState<InventoryCache>({});
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'error'>('synced');
  const pendingUpdates = useRef<InventoryUpdate[]>([]);
  const lastSyncTime = useRef<number>(Date.now());

  // Subscribe to inventory updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit('inventory:subscribe', { restaurantId });

    socket.on('inventory:update', (update: InventoryUpdate) => {
      console.log('[InventorySync] Real-time update:', update);
      
      // Update local cache immediately
      setCache(prev => ({
        ...prev,
        [update.itemId]: {
          stock: Number(update.currentStock),
          updatedAt: update.updatedAt,
          lastSyncedAt: new Date().toISOString(),
        }
      }));

      // Notify UI of stock changes
      if (update.action === 'remove' || update.quantity < 0) {
        toast.success(`📦 Stock updated: ${update.itemId}`);
      }
    });

    socket.on('inventory:batch-update', (updates: InventoryUpdate[]) => {
      console.log('[InventorySync] Batch update received:', updates.length, 'items');
      
      setCache(prev => {
        const newCache = { ...prev };
        updates.forEach(update => {
          newCache[update.itemId] = {
            stock: Number(update.currentStock),
            updatedAt: update.updatedAt,
            lastSyncedAt: new Date().toISOString(),
          };
        });
        return newCache;
      });

      setSyncStatus('synced');
    });

    socket.on('inventory:sync-error', (error: any) => {
      console.error('[InventorySync] Sync error:', error);
      setSyncStatus('error');
      toast.error('❌ Inventory sync failed');
    });

    return () => {
      socket.off('inventory:update');
      socket.off('inventory:batch-update');
      socket.off('inventory:sync-error');
      socket.emit('inventory:unsubscribe', { restaurantId });
    };
  }, [socket, isConnected, restaurantId]);

  // Queue local inventory changes
  const updateLocal = useCallback((itemId: number, quantity: number, action: 'add' | 'remove' | 'adjust') => {
    const update: InventoryUpdate = {
      itemId,
      currentStock: quantity as any,
      updatedAt: new Date().toISOString(),
      action,
      quantity: quantity as any,
    };

    pendingUpdates.current.push(update);
    setSyncStatus('pending');

    // Update local cache optimistically
    setCache(prev => ({
      ...prev,
      [itemId]: {
        stock: quantity,
        updatedAt: update.updatedAt,
        lastSyncedAt: new Date().toISOString(),
      }
    }));
  }, []);

  // Flush pending updates to server
  const flushUpdates = useCallback(async () => {
    if (pendingUpdates.current.length === 0) return;

    const updates = pendingUpdates.current;
    pendingUpdates.current = [];

    if (!socket || !isConnected) {
      pendingUpdates.current = updates; // re-queue if offline
      setSyncStatus('error');
      toast.error('📡 Offline - changes queued for sync');
      return;
    }

    setSyncStatus('pending');
    socket.emit('inventory:flush', { restaurantId, updates }, (ack: any) => {
      if (ack?.success) {
        setSyncStatus('synced');
        lastSyncTime.current = Date.now();
        console.log('[InventorySync] Flushed', updates.length, 'updates');
      } else {
        pendingUpdates.current = updates; // re-queue on failure
        setSyncStatus('error');
        toast.error('❌ Failed to sync inventory');
      }
    });
  }, [socket, isConnected, restaurantId]);

  // Get current stock for item
  const getStock = useCallback((itemId: number, fallback: number = 0): number => {
    return cache[itemId]?.stock ?? fallback;
  }, [cache]);

  // Check if stock is low (warning threshold)
  const isLowStock = useCallback((itemId: number, threshold: number): boolean => {
    const stock = getStock(itemId);
    return stock <= threshold && stock >= 0;
  }, [getStock]);

  // Get all items in cache
  const getAllCached = useCallback(() => cache, [cache]);

  return {
    cache,
    syncStatus,
    updateLocal,
    flushUpdates,
    getStock,
    isLowStock,
    getAllCached,
    pendingUpdatesCount: pendingUpdates.current.length,
  };
}
