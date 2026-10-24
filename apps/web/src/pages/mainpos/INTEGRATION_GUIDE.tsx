// @ts-nocheck
/**
 * INTEGRATION GUIDE: Bakery POS Real-Time Features
 * 
 * This file shows how to integrate all bakery-specific features into MainPOSTerminal.tsx
 * Copy the import statements and hook initializations into your component
 */

// ════════════════════════════════════════════════════════════════════════════════
// ADD THESE IMPORTS AT THE TOP OF MainPOSTerminal.tsx
// ════════════════════════════════════════════════════════════════════════════════

import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useExpiryDates, ExpiryDateInfo } from '@/hooks/useExpiryDates';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useTerminalSync, SyncEvent } from '@/hooks/useTerminalSync';
import { useOfflineStore, useOnlineStatus } from '@/stores/offlineStore';
import { ErrorFeedbackDisplay, useErrorFeedback } from '@/components/ErrorFeedback';
import {
  TouchButton,
  TouchQuantityPicker,
  TouchBarcodeInput,
  TouchInventoryCard,
  TouchCartItem,
  TouchStatusIndicator,
} from '@/components/TouchInterface';

// ════════════════════════════════════════════════════════════════════════════════
// ADD THESE HOOKS INSIDE MainPOSTerminal COMPONENT (after other useState calls)
// ════════════════════════════════════════════════════════════════════════════════

export default function MainPOSTerminal() {
  // ... existing hooks ...

  // NEW: Real-time Inventory Tracking
  const { 
    getStock, 
    isLowStock, 
    syncStatus, 
    updateLocal: updateInventoryLocal,
    flushUpdates: flushInventoryUpdates,
  } = useRealtimeInventory(user?.restaurant?.id || 0);

  // NEW: Expiry Date Management
  const {
    getExpiryInfo,
    canSellItem,
    getWarningMessage,
    getExpiryBadgeColor,
    setExpiry,
  } = useExpiryDates();

  // NEW: Barcode Scanner
  const barcodeScanner = useBarcodeScanner(
    (result) => {
      console.log('[Barcode] Scanned:', result.barcode);
      // Find item by barcode
      const item = allItems.find(
        i => i.productQR === result.barcode || 
             i.inventoryItem?.barcode === result.barcode
      );
      if (item) {
        handleAddToCart(item);
      } else {
        addError('Item not found for barcode: ' + result.barcode, 'error');
      }
    },
    true // enabled
  );

  // NEW: Terminal Sync
  const terminalSync = useTerminalSync(terminal?.id || 'main', user?.restaurant?.id || 0);

  // NEW: Offline Support
  const { isOnline } = useOnlineStatus();
  const {
    addPendingOrder,
    getPendingOrdersCount,
    updateOrderStatus,
  } = useOfflineStore();

  // NEW: Error Feedback System
  const {
    errors,
    addError,
    removeError,
    clearErrors,
  } = useErrorFeedback();

  // ════════════════════════════════════════════════════════════════════════════════
  // ADD THIS VALIDATION FUNCTION
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * Validate if item can be added to cart
   * Checks: stock availability, expiry date, inventory sync status
   */
  const validateItemForSale = (item: MenuItem): { valid: boolean; reason?: string } => {
    // Check expiry date
    if (item.expiryDate) {
      if (!canSellItem(item.id, item.expiryDate)) {
        return { valid: false, reason: 'Item has expired - cannot sell' };
      }
      const expiryInfo = getExpiryInfo(item.id, item.name, item.expiryDate);
      if (expiryInfo?.isExpiringSoon) {
        addError(
          getWarningMessage(expiryInfo),
          'warning',
          3000,
          {
            label: 'Continue',
            handler: () => {
              removeError(errors[0]?.id || '');
            },
          }
        );
      }
    }

    // Check inventory sync status
    if (syncStatus === 'error') {
      addError(
        '⚠️ Inventory sync error - stock data may be stale',
        'warning',
        5000
      );
    }

    // Check stock availability (for inventory items)
    if (item.inventoryItem?.id) {
      const stock = getStock(item.inventoryItem.id);
      if (stock <= 0) {
        return { valid: false, reason: 'Out of stock' };
      }
      if (isLowStock(item.inventoryItem.id, item.stockWarningThreshold || 5)) {
        addError(
          `⚠️ Low stock: only ${stock} left`,
          'warning',
          4000
        );
      }
    }

    return { valid: true };
  };

  // ════════════════════════════════════════════════════════════════════════════════
  // UPDATE handleAddToCart TO USE VALIDATION
  // ════════════════════════════════════════════════════════════════════════════════

  const handleAddToCartWithValidation = (item: MenuItem) => {
    // Validate before adding
    const validation = validateItemForSale(item);
    if (!validation.valid) {
      addError(`❌ ${validation.reason}`, 'error', 4000);
      return;
    }

    // Add to cart (existing logic)
    handleAddToCart(item);

    // Update inventory on add
    if (item.inventoryItem?.id) {
      updateInventoryLocal(item.inventoryItem.id, -1, 'remove');
    }

    // Broadcast to other terminals
    terminalSync.broadcastChange('sale', {
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
    });
  };

  // ════════════════════════════════════════════════════════════════════════════════
  // UPDATE PAYMENT PROCESSING FOR OFFLINE SUPPORT
  // ════════════════════════════════════════════════════════════════════════════════

  const processPaymentWithOfflineSupport = async (method: string) => {
    if (!isOnline) {
      // Store order locally for sync when back online
      const order = {
        id: `offline-${Date.now()}`,
        tokenNumber: currentToken?.tokenNumber || 0,
        items: localCart,
        subtotal: localCartSubtotal,
        tax: localCartTax,
        total: localCartFinal,
        paymentMethod: method,
        paymentAmount: displayTotal,
        createdAt: new Date().toISOString(),
        status: 'pending' as const,
      };

      addPendingOrder(order);
      addError(
        '📴 Offline - order saved locally and will sync when online',
        'warning',
        5000
      );

      return;
    }

    // Normal online payment processing
    try {
      await processPayment(method);

      // Sync after successful payment
      await flushInventoryUpdates();
      terminalSync.broadcastChange('payment', {
        tokenQrCode: currentToken?.qrCode,
        amount: displayTotal,
        method,
      });

      addError('✓ Payment synced with all terminals', 'success', 2000);
    } catch (err: any) {
      addError(err?.message || 'Payment failed', 'error', 5000);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════════
  // ADD SYNC EVENT PROCESSOR
  // ════════════════════════════════════════════════════════════════════════════════

  // Process sync events from other terminals
  const handleTerminalSyncEvent = async (event: SyncEvent) => {
    switch (event.type) {
      case 'sale':
        // Another terminal sold an item - update local inventory
        if (event.data.itemId) {
          updateInventoryLocal(event.data.itemId, -event.data.quantity, 'remove');
          addError(
            `📡 ${event.sourceTerminalId}: Sold ${event.data.itemName}`,
            'info',
            2000
          );
        }
        break;

      case 'inventory-update':
        // Another terminal adjusted inventory
        setLocalCart(prev => 
          prev.filter(item => item.menuItemId !== event.data.itemId)
        );
        addError(
          `📡 Inventory updated: ${event.data.itemName}`,
          'info',
          2000
        );
        break;

      case 'payment':
        // Another terminal processed payment
        addError(
          `📡 Payment processed: ₹${event.data.amount}`,
          'success',
          2000
        );
        break;

      default:
        console.log('[TerminalSync] Unhandled event type:', event.type);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════════
  // UPDATE RETURN JSX TO INCLUDE ERROR FEEDBACK AND ONLINE STATUS
  // ════════════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-[calc(100vh)] bg-[#0f1014] text-white overflow-hidden text-[13px]">
      
      {/* Error Feedback Display */}
      <ErrorFeedbackDisplay errors={errors} onDismiss={removeError} />

      {/* Header - ADD STATUS INDICATOR */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#1a1c23] border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <CreditCard className="w-4 h-4 text-purple-500" />
          <span className="font-bold text-gray-200 uppercase tracking-wide text-[13px]">
            {terminal?.name ?? 'MAIN POS'}
          </span>
          
          {/* NEW: Status indicators */}
          <TouchStatusIndicator 
            status={isOnline ? 'online' : 'offline'}
            message={isOnline ? 'Online' : 'Offline Mode'}
          />
          
          <TouchStatusIndicator
            status={syncStatus === 'synced' ? 'online' : syncStatus === 'syncing' ? 'syncing' : 'error'}
            message={syncStatus === 'synced' ? 'Inventory Synced' : 'Syncing...'}
          />
          
          {/* Show pending offline orders count */}
          {!isOnline && getPendingOrdersCount() > 0 && (
            <span className="px-2 py-1 bg-amber-600 text-white rounded text-xs font-bold">
              {getPendingOrdersCount()} pending
            </span>
          )}
        </div>

        {/* ... existing header content ... */}
      </div>

      {/* ... rest of component ... */}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// NEW COMPONENT: Barcode Scanner Input (add to items section)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Replace the search input with this touch-friendly barcode input:
 * 
 * <div className="px-3 py-2 bg-gray-800 rounded-lg border border-gray-700">
 *   <TouchBarcodeInput
 *     onSubmit={(barcode) => {
 *       const item = allItems.find(i => 
 *         i.productQR === barcode || 
 *         i.inventoryItem?.barcode === barcode
 *       );
 *       if (item) {
 *         handleAddToCartWithValidation(item);
 *       } else {
 *         addError('Barcode not found: ' + barcode, 'error');
 *       }
 *     }}
 *     placeholder="Scan barcode or tap to enter..."
 *   />
 * </div>
 */

// ════════════════════════════════════════════════════════════════════════════════
// NEW COMPONENT: Inventory Cards with Status (replace grid items)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Update the items grid to use TouchInventoryCard:
 * 
 * <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2">
 *   {filteredItems.map(item => {
 *     const stock = item.inventoryItem?.id 
 *       ? getStock(item.inventoryItem.id) 
 *       : 999;
 *     const expiryInfo = item.expiryDate 
 *       ? getExpiryInfo(item.id, item.name, item.expiryDate)
 *       : null;
 *     
 *     return (
 *       <TouchInventoryCard
 *         key={item.id}
 *         name={item.name}
 *         image={item.image}
 *         price={item.price}
 *         stock={stock}
 *         expiryStatus={expiryInfo?.status || 'good'}
 *         onSelect={() => handleAddToCartWithValidation(item)}
 *         disabled={!validateItemForSale(item).valid}
 *       />
 *     );
 *   })}
 * </div>
 */

// ════════════════════════════════════════════════════════════════════════════════
// NEW COMPONENT: Cart Items with Quantity Picker (replace cart display)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Update cart items display to use TouchCartItem and TouchQuantityPicker:
 * 
 * <div className="space-y-2">
 *   {localCart.map(item => {
 *     const expiryInfo = allItems.find(i => i.id === item.menuItemId)?.expiryDate
 *       ? getExpiryInfo(item.menuItemId, item.name, item.expiryDate)
 *       : null;
 *     
 *     return (
 *       <TouchCartItem
 *         key={item.id}
 *         name={item.displayName || item.name}
 *         quantity={item.quantity}
 *         unit={item.salesUnit}
 *         price={item.price}
 *         total={item.price * item.quantity}
 *         onIncrement={() => updateLocalQty(item.id, 1)}
 *         onDecrement={() => updateLocalQty(item.id, -1)}
 *         onRemove={() => removeLocalItem(item.id)}
 *         expiryWarning={expiryInfo ? getWarningMessage(expiryInfo) : undefined}
 *       />
 *     );
 *   })}
 * </div>
 */
