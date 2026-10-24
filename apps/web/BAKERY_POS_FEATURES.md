# Bakery POS Real-Time Features Implementation

## Overview
This implementation provides enterprise-grade real-time features specifically designed for bakery operations where stock changes every minute, expiry dates are critical, and multiple terminals must stay synchronized.

---

## ✅ Requirements Implemented

### 1. **Real-Time Inventory Tracking** 📦
**Hook:** `useRealtimeInventory`  
**File:** `web/src/hooks/useRealtimeInventory.ts`

**What it does:**
- Maintains real-time inventory cache for fast lookups
- Subscribes to WebSocket inventory updates
- Queues pending changes and syncs when online
- Tracks stock changes every minute

**Usage:**
```typescript
const { getStock, isLowStock, syncStatus, updateLocal, flushUpdates } = 
  useRealtimeInventory(restaurantId);

// Check current stock
const stock = getStock(itemId, fallback);

// Check if stock is low
if (isLowStock(itemId, threshold)) {
  showWarning('Low stock alert');
}

// Update locally and queue for sync
updateLocal(itemId, newQuantity, 'adjust');

// Flush updates to server
await flushUpdates();
```

**Status:** Updates sync status to component (`'synced' | 'pending' | 'error'`)

---

### 2. **Expiry Date Management** 📅
**Hook:** `useExpiryDates`  
**File:** `web/src/hooks/useExpiryDates.ts`

**What it does:**
- Validates item expiry dates before sale
- Warns when items expire in < 24 hours
- Prevents sale of expired items
- Provides clear visual indicators

**Usage:**
```typescript
const { 
  getExpiryInfo, 
  canSellItem, 
  getWarningMessage,
  getExpiryBadgeColor 
} = useExpiryDates();

// Get detailed expiry information
const expiryInfo = getExpiryInfo(itemId, itemName, expiryDate);
// Returns: { status: 'good' | 'warning' | 'expired', daysUntilExpiry, ... }

// Check if item can be sold
if (!canSellItem(itemId, expiryDate)) {
  reject('Cannot sell expired item');
}

// Get warning message for UI
const message = getWarningMessage(expiryInfo); // "⚠️ EXPIRES TOMORROW"

// Get badge color for visual indicator
const color = getExpiryBadgeColor(expiryInfo.status);
```

**Statuses:**
- ✅ `good` - Normal item, can sell
- ⚠️ `warning` - Expires within 24 hours
- ❌ `expired` - Cannot be sold

---

### 3. **Barcode Scanning** 🏷️
**Hook:** `useBarcodeScanner`  
**File:** `web/src/hooks/useBarcodeScanner.ts`

**What it does:**
- Receives barcode input from physical scanner via keyboard
- Validates barcode format (6-20 chars, numeric or alphanumeric)
- Provides manual entry fallback
- Handles rapid scans with debouncing

**Usage:**
```typescript
const { processScan, enterManually, matchesPattern } = useBarcodeScanner(
  (result) => {
    console.log('Scanned:', result.barcode);
    const item = findItemByBarcode(result.barcode);
    if (item) addToCart(item);
  },
  true // enabled
);

// Manual barcode entry fallback
enterManually('8901234567890');

// Check pattern matching
if (matchesPattern(barcode, '^890')) {
  // Is a valid EAN-13
}
```

**Scanner Requirements:**
- Physical barcode scanner that emits keyboard input
- Scanner must send `Enter` key at end of barcode
- Typical format: UPC, EAN-8, EAN-13, QR codes

---

### 4. **Terminal-to-Terminal Sync** 🔄
**Hook:** `useTerminalSync`  
**File:** `web/src/hooks/useTerminalSync.ts`

**What it does:**
- Prevents counter selling items main POS already sold
- Broadcasts sales, returns, and inventory changes
- Maintains sync queue for offline scenarios
- Ensures consistent state across all terminals

**Usage:**
```typescript
const { 
  broadcastChange, 
  processPendingEvents,
  getSyncStatusMessage 
} = useTerminalSync(terminalId, restaurantId);

// Broadcast a sale to other terminals
broadcastChange('sale', {
  itemId: 123,
  itemName: 'Croissant',
  quantity: 5,
});

// Process sync events from other terminals
await processPendingEvents(async (event) => {
  if (event.type === 'sale') {
    // Update local inventory
    const success = await updateLocalInventory(event.data);
    return success;
  }
  return true;
});
```

**Sync Events:**
- `sale` - Item sold on another terminal
- `return` - Item returned
- `inventory-update` - Stock adjusted
- `payment` - Payment processed

---

### 5. **Error Feedback System** ⚠️
**Component:** `ErrorFeedback`  
**File:** `web/src/components/ErrorFeedback.tsx`

**What it does:**
- Displays immediate, visible error messages
- Plays audio alert for errors/warnings
- Auto-dismisses or waits for action
- Touch-friendly for non-tech staff

**Usage:**
```typescript
const { errors, addError, removeError } = useErrorFeedback();

// Add error
addError('Item expired - cannot sell', 'error', 5000);

// Add warning
addError('Low stock: 3 items left', 'warning', 4000, {
  label: 'Continue anyway',
  handler: () => proceedWithSale()
});

// Add success
addError('✓ Payment successful', 'success', 2000);

// Display errors in JSX
<ErrorFeedbackDisplay errors={errors} onDismiss={removeError} />
```

**Levels:**
- `error` - Red, requires attention
- `warning` - Amber, needs awareness
- `info` - Blue, informational
- `success` - Green, confirmation

---

### 6. **Offline Support** 📴
**Store:** `useOfflineStore`  
**File:** `web/src/stores/offlineStore.ts`

**What it does:**
- Stores orders locally when internet is down
- Syncs automatically when connection restored
- Persists across app restarts
- Tracks pending and failed orders

**Usage:**
```typescript
const { isOnline, setOnline } = useOfflineStore();
const { 
  addPendingOrder, 
  getPendingOrdersCount,
  updateOrderStatus 
} = useOfflineStore();

// Check online status
if (!isOnline) {
  // Store order for later sync
  addPendingOrder({
    id: 'order-123',
    items: [...],
    total: 500,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
}

// When back online
if (isOnline && getPendingOrdersCount() > 0) {
  syncPendingOrders();
}
```

**Status Values:**
- `pending` - Waiting to sync
- `synced` - Successfully synced
- `failed` - Failed to sync

---

### 7. **Touch-Friendly Interface** 👆
**Component:** `TouchInterface`  
**File:** `web/src/components/TouchInterface.tsx`

**What it does:**
- Large, easy-to-tap buttons for staff
- Minimal text, clear visual feedback
- Quantity picker with preset buttons
- Visual status indicators

**Components Provided:**
```typescript
// Large touch button
<TouchButton onClick={handleClick} size="lg" variant="primary">
  Process Payment
</TouchButton>

// Quantity picker with +/- and presets
<TouchQuantityPicker 
  quantity={qty}
  onQuantityChange={setQty}
  presets={[1, 2, 5, 10]}
/>

// Barcode input field
<TouchBarcodeInput 
  onSubmit={handleBarcode}
  placeholder="Scan barcode..."
/>

// Inventory card with expiry status
<TouchInventoryCard
  name="Croissant"
  price={50}
  stock={12}
  expiryStatus="good"
  onSelect={handleSelect}
/>

// Status indicator (online/offline/syncing)
<TouchStatusIndicator
  status="online"
  message="All systems operational"
/>
```

---

## 🏗️ Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MainPOSTerminal                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐      ┌──────────────────┐              │
│  │  Barcode Input │ ───→ │ Validate Item    │              │
│  └────────────────┘      └──────────────────┘              │
│           │                        │                         │
│           └────────────────────────┴──────────────────┐      │
│                                                       ↓      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Check Expiry Date (useExpiryDates)               │    │
│  │  Check Stock (useRealtimeInventory)               │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                   │
│           ├──→ Invalid? ──→ Show Error (useErrorFeedback)  │
│           │                                                   │
│           └──→ Valid? ──→ Add to Cart                       │
│                   │                                           │
│                   ├──→ Online? ──→ Broadcast (useTerminalSync)
│                   │                  │                        │
│                   │                  └──→ Other Terminals    │
│                   │                                           │
│                   └──→ Offline? ──→ Store Locally            │
│                                     (useOfflineStore)        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### WebSocket Channels

```
Backend (SocketIO)
├── inventory:{restaurantId}      ← Real-time stock updates
├── terminal:{restaurantId}       ← Terminal-to-terminal sync
├── customer_display:{restaurantId} ← Customer display sync
└── offline:sync                  ← Offline order syncing
```

---

## 🔧 Integration Steps

### Step 1: Import New Hooks
```typescript
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory';
import { useExpiryDates } from '@/hooks/useExpiryDates';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useTerminalSync } from '@/hooks/useTerminalSync';
import { useOfflineStore, useOnlineStatus } from '@/stores/offlineStore';
import { ErrorFeedbackDisplay, useErrorFeedback } from '@/components/ErrorFeedback';
```

### Step 2: Initialize Hooks in Component
```typescript
const inventory = useRealtimeInventory(restaurantId);
const expiry = useExpiryDates();
const scanner = useBarcodeScanner(handleScan);
const sync = useTerminalSync(terminalId, restaurantId);
const { isOnline } = useOnlineStatus();
const { errors, addError } = useErrorFeedback();
```

### Step 3: Add Validation Before Sale
```typescript
const validateItemForSale = (item) => {
  if (!expiry.canSellItem(item.id, item.expiryDate)) {
    addError('❌ Item expired', 'error');
    return false;
  }
  if (inventory.isLowStock(item.inventoryItem.id)) {
    addError('⚠️ Low stock', 'warning');
  }
  return true;
};
```

### Step 4: Add Error Display to JSX
```typescript
<ErrorFeedbackDisplay errors={errors} onDismiss={removeError} />
```

### Step 5: Update Payment Process
```typescript
const processPayment = async (method) => {
  if (!isOnline) {
    offlineStore.addPendingOrder({...});
    addError('📴 Offline - order saved', 'warning');
    return;
  }
  // Normal payment flow
};
```

---

## 📊 Performance Considerations

### Cache Strategy
- **Inventory Cache:** Updated every 30 seconds (configurable)
- **Expiry Dates:** Loaded once per session, updated on cart changes
- **Terminal List:** Updated on login and when terminals join/leave

### Network Optimization
- **Batch Updates:** Multiple inventory changes sent in one message
- **Debouncing:** Cart updates debounced by 300ms
- **Offline Queue:** Synced incrementally when reconnected

### Touch UI
- **Button Size:** Min 44x44px for reliable touch targets
- **Font Size:** 13pt+ for readability
- **Spacing:** 8-16px gaps for error-free tapping

---

## 🐛 Troubleshooting

### Inventory not syncing
1. Check WebSocket connection: `socket.connected`
2. Verify restaurant ID is correct
3. Check server logs for `[InventorySync]` messages

### Expiry dates not showing
1. Ensure MenuItem has `expiryDate` field populated
2. Check date format: should be ISO string or Date object
3. Call `setExpiry()` after loading items

### Barcode scanner not working
1. Physical scanner must emit keyboard events (not custom USB protocol)
2. App must have focus when scanning
3. Test with manual input first: `enterManually('12345678')`

### Terminal sync delays
1. Check network latency (should be < 100ms)
2. Verify all terminals on same restaurant
3. Check WebSocket adapter configuration

### Offline orders not syncing
1. Confirm online status detected correctly
2. Check localStorage for `offline-store` data
3. Verify sync endpoint is reachable

---

## 🔐 Security Notes

1. **Offline Data:** Stored in localStorage (not encrypted)
   - Only store non-sensitive order data
   - Clear after successful sync

2. **Payment Info:** Never store in offline store
   - Process separately on reconnection

3. **Authentication:** Include token in offline sync request
   - Prevent unauthorized order creation

4. **Barcode Validation:** Validate on backend
   - Malicious barcodes could inject code

---

## 📱 Testing Checklist

- [ ] Add item to cart with valid expiry date
- [ ] Try to add expired item (should fail)
- [ ] Scan barcode with physical scanner
- [ ] Scan barcode with manual entry
- [ ] Simulate offline mode (disconnect network)
- [ ] Add items while offline
- [ ] Reconnect and verify sync
- [ ] Check sync on other terminal
- [ ] Test low stock warning
- [ ] Test inventory update broadcast

---

## 🚀 Next Steps

1. **Update Database Schema:** Ensure expiryDate field is populated
2. **Configure WebSocket Events:** Add event handlers to backend
3. **Test with Physical Scanner:** Confirm scanner emits keyboard events
4. **Train Staff:** Demo touch interface and offline features
5. **Monitor Performance:** Track sync latency and error rates

---

## 📞 Support

For issues or questions:
- Check logs: `[Inventory]`, `[Barcode]`, `[TerminalSync]` prefixes
- Verify WebSocket connection in DevTools
- Test individual hooks in isolation
- Review schema to ensure fields exist
