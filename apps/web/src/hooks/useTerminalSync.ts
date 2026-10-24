import { useEffect, useRef, useCallback, useState } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';

export interface SyncEvent {
  type: 'sale' | 'return' | 'inventory-update' | 'payment' | 'edit';
  terminalId: string;
  sourceTerminalId: string; // which terminal made the change
  data: any;
  timestamp: string;
  syncId: string;
}

interface TerminalState {
  id: string;
  lastSyncTime: number;
  isPrimary: boolean;
  isConnected: boolean;
}

/**
 * Hook for reliable terminal-to-terminal sync
 * Prevents counter selling items that main POS already sold
 * Ensures consistent inventory across all terminals
 * For bakeries: multiple counters need real-time coordination
 */
export function useTerminalSync(terminalId: string, restaurantId: number) {
  const { socket, isConnected } = useSocket();
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [otherTerminals, setOtherTerminals] = useState<TerminalState[]>([]);
  const syncQueue = useRef<SyncEvent[]>([]);
  const lastProcessedSync = useRef<string | null>(null);

  // Register this terminal
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit('terminal:register', {
      terminalId,
      restaurantId,
      isPrimary: false, // can be set based on settings
    });

    console.log('[TerminalSync] Registered terminal:', terminalId);

    return () => {
      socket.emit('terminal:unregister', { terminalId, restaurantId });
    };
  }, [socket, isConnected, terminalId, restaurantId]);

  // Listen for sync events from other terminals
  useEffect(() => {
    if (!socket) return;

    socket.on('terminal:sync', (event: SyncEvent) => {
      console.log('[TerminalSync] Received sync event:', event.type, 'from', event.sourceTerminalId);

      // Prevent duplicate processing
      if (lastProcessedSync.current === event.syncId) {
        console.log('[TerminalSync] Duplicate event ignored');
        return;
      }

      lastProcessedSync.current = event.syncId;

      // Queue the event for processing
      syncQueue.current.push(event);
      setSyncStatus('syncing');

      // Emit acknowledgment
      socket.emit('terminal:sync-ack', {
        syncId: event.syncId,
        terminalId,
        status: 'received',
      });
    });

    socket.on('terminal:list', (terminals: TerminalState[]) => {
      setOtherTerminals(terminals.filter(t => t.id !== terminalId));
      console.log('[TerminalSync] Active terminals:', terminals.length);
    });

    socket.on('terminal:sync-error', (error: any) => {
      console.error('[TerminalSync] Sync error:', error);
      setSyncStatus('error');
      toast.error('⚠️ Terminal sync failed - changes may not reflect on other terminals');
    });

    return () => {
      socket.off('terminal:sync');
      socket.off('terminal:list');
      socket.off('terminal:sync-error');
    };
  }, [socket, terminalId]);

  // Process queued sync events
  const processPendingEvents = useCallback(async (handler: (event: SyncEvent) => Promise<boolean>) => {
    const events = [...syncQueue.current];
    syncQueue.current = [];

    for (const event of events) {
      try {
        const success = await handler(event);
        if (success) {
          setSyncStatus('synced');
        } else {
          syncQueue.current.push(event); // re-queue on failure
          setSyncStatus('error');
        }
      } catch (err) {
        console.error('[TerminalSync] Error processing event:', err);
        syncQueue.current.push(event);
        setSyncStatus('error');
      }
    }

    return syncQueue.current.length === 0;
  }, []);

  // Broadcast a change to other terminals
  const broadcastChange = useCallback((
    type: SyncEvent['type'],
    data: any,
    sourceTerminalId?: string
  ) => {
    if (!socket || !isConnected) {
      console.warn('[TerminalSync] Not connected - change queued locally');
      return false;
    }

    const event: SyncEvent = {
      type,
      terminalId,
      sourceTerminalId: sourceTerminalId || terminalId,
      data,
      timestamp: new Date().toISOString(),
      syncId: `${terminalId}-${Date.now()}-${Math.random()}`,
    };

    socket.emit('terminal:broadcast', event, (ack: any) => {
      if (ack?.success) {
        console.log('[TerminalSync] Broadcast successful:', event.syncId);
      } else {
        console.error('[TerminalSync] Broadcast failed:', ack?.error);
      }
    });

    return true;
  }, [socket, isConnected, terminalId]);

  // Get all active terminals
  const getActiveTerminals = useCallback(() => otherTerminals.filter(t => t.isConnected), [otherTerminals]);

  // Check if this is the primary terminal
  const isPrimary = useCallback(() => {
    const thisTerm = [{ id: terminalId, isConnected, isPrimary: false, lastSyncTime: Date.now() }, ...otherTerminals].find(t => t.id === terminalId);
    return thisTerm?.isPrimary ?? false;
  }, [terminalId, otherTerminals, isConnected]);

  // Get sync status for UI
  const getSyncStatusMessage = useCallback(() => {
    switch (syncStatus) {
      case 'synced':
        return '✓ All terminals synced';
      case 'syncing':
        return '⟳ Syncing with terminals...';
      case 'error':
        return '❌ Sync error - check connection';
      default:
        return 'Unknown';
    }
  }, [syncStatus]);

  return {
    syncStatus,
    otherTerminals: getActiveTerminals(),
    processPendingEvents,
    broadcastChange,
    getSyncStatusMessage,
    queueLength: syncQueue.current.length,
    isPrimary: isPrimary(),
  };
}
