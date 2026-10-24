/**
 * Backend WebSocket Event Handlers
 * Add these event listeners to your backend SocketIO configuration
 * (usually in api/src/socket.js or api/src/plugins/socket.js)
 */

// ════════════════════════════════════════════════════════════════════════════════
// INVENTORY SYNC EVENTS
// ════════════════════════════════════════════════════════════════════════════════

socket.on('inventory:subscribe', (data: { restaurantId: number }) => {
  console.log('[InventorySync] Terminal subscribed to updates:', data.restaurantId);
  socket.join(`inventory:${data.restaurantId}`);
  
  // Send current inventory state
  const inventory = await getInventoryForRestaurant(data.restaurantId);
  socket.emit('inventory:batch-update', inventory);
});

socket.on('inventory:unsubscribe', (data: { restaurantId: number }) => {
  socket.leave(`inventory:${data.restaurantId}`);
  console.log('[InventorySync] Terminal unsubscribed');
});

socket.on('inventory:flush', (data: { restaurantId: number; updates: any[] }, callback) => {
  console.log('[InventorySync] Flushing inventory updates:', data.updates.length);
  
  try {
    // Process each update
    data.updates.forEach(async (update) => {
      const { itemId, currentStock, action, quantity } = update;
      
      // Update database
      await updateInventoryItem(itemId, {
        currentStock,
        updatedAt: new Date(),
      });
      
      // Broadcast to all terminals in the restaurant
      io.to(`inventory:${data.restaurantId}`).emit('inventory:update', {
        itemId,
        currentStock,
        updatedAt: new Date().toISOString(),
        action,
        quantity,
      });
    });
    
    callback({ success: true });
  } catch (err) {
    console.error('[InventorySync] Error flushing updates:', err);
    socket.emit('inventory:sync-error', { error: err.message });
    callback({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// TERMINAL SYNC EVENTS
// ════════════════════════════════════════════════════════════════════════════════

socket.on('terminal:register', (data: { terminalId: string; restaurantId: number; isPrimary?: boolean }) => {
  console.log('[TerminalSync] Terminal registered:', data.terminalId);
  socket.join(`terminal:${data.restaurantId}`);
  socket.data.terminalId = data.terminalId;
  socket.data.restaurantId = data.restaurantId;
  
  // Notify other terminals
  io.to(`terminal:${data.restaurantId}`).emit('terminal:list', getActiveTerminals(data.restaurantId));
});

socket.on('terminal:broadcast', (event: any, callback) => {
  const restaurantId = socket.data.restaurantId;
  
  if (!restaurantId) {
    callback({ success: false, error: 'Not registered' });
    return;
  }
  
  console.log('[TerminalSync] Broadcasting event:', event.type);
  
  // Broadcast to all terminals except sender
  socket.broadcast.to(`terminal:${restaurantId}`).emit('terminal:sync', event);
  
  callback({ success: true });
});

socket.on('terminal:sync-ack', (data: { syncId: string; terminalId: string; status: string }) => {
  console.log('[TerminalSync] Sync ACK received:', data.syncId, 'from', data.terminalId);
  // Track sync completion for monitoring
});

// ════════════════════════════════════════════════════════════════════════════════
// OFFLINE SYNC - PROCESS PENDING ORDERS WHEN TERMINAL COMES ONLINE
// ════════════════════════════════════════════════════════════════════════════════

socket.on('offline:sync-pending', async (data: { restaurantId: number; orders: any[] }, callback) => {
  console.log('[OfflineSync] Syncing pending orders:', data.orders.length);
  
  const results = {
    success: 0,
    failed: 0,
    orders: [] as any[],
  };
  
  try {
    for (const offlineOrder of data.orders) {
      try {
        // Create token from offline order
        const token = await createTokenFromOfflineOrder(offlineOrder);
        
        // Process payment
        if (offlineOrder.paymentAmount && offlineOrder.paymentAmount > 0) {
          await processPayment(token.id, {
            method: offlineOrder.paymentMethod || 'cash',
            amount: offlineOrder.paymentAmount,
          });
        }
        
        results.success++;
        results.orders.push({ ...offlineOrder, status: 'synced', tokenId: token.id });
        
        // Broadcast sale to other terminals
        io.to(`inventory:${data.restaurantId}`).emit('inventory:update', {
          action: 'sale',
          tokenId: token.id,
          items: offlineOrder.items,
        });
      } catch (err) {
        console.error('[OfflineSync] Failed to sync order:', err);
        results.failed++;
        results.orders.push({ ...offlineOrder, status: 'failed' });
      }
    }
    
    callback({ success: true, results });
  } catch (err) {
    console.error('[OfflineSync] Sync failed:', err);
    callback({ success: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR BACKEND
// ════════════════════════════════════════════════════════════════════════════════

async function getInventoryForRestaurant(restaurantId: number) {
  // Fetch all inventory items for a restaurant
  const items = await prisma.inventoryItem.findMany({
    where: { restaurantId },
    select: {
      id: true,
      currentStock: true,
      updatedAt: true,
    },
  });
  
  return items.map(item => ({
    itemId: item.id,
    currentStock: item.currentStock,
    updatedAt: item.updatedAt.toISOString(),
  }));
}

async function updateInventoryItem(itemId: number, data: any) {
  return prisma.inventoryItem.update({
    where: { id: itemId },
    data,
  });
}

function getActiveTerminals(restaurantId: number) {
  const terminals: any[] = [];
  const room = io.sockets.adapter.rooms.get(`terminal:${restaurantId}`);
  
  if (room) {
    room.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        terminals.push({
          id: socket.data.terminalId || socketId,
          isConnected: true,
          isPrimary: socket.data.isPrimary || false,
          lastSyncTime: Date.now(),
        });
      }
    });
  }
  
  return terminals;
}

async function createTokenFromOfflineOrder(offlineOrder: any) {
  // Create a bakery token from offline order data
  const token = await prisma.bakeryToken.create({
    data: {
      restaurantId: offlineOrder.restaurantId,
      branchId: offlineOrder.branchId,
      subPosId: offlineOrder.subPosId,
      tokenNumber: offlineOrder.tokenNumber,
      qrCode: generateQRCode(),
      status: 'open',
      items: {
        createMany: {
          data: offlineOrder.items.map((item: any) => ({
            menuItemId: item.menuItemId,
            menuItemName: item.menuItemName,
            price: item.price,
            quantity: item.quantity,
            total: item.total,
            addedBy: 'offline-sync',
          })),
        },
      },
      subtotal: offlineOrder.subtotal,
      total: offlineOrder.total,
    },
    include: { items: true },
  });
  
  return token;
}

// ════════════════════════════════════════════════════════════════════════════════
// CUSTOMER DISPLAY SYNC
// ════════════════════════════════════════════════════════════════════════════════

socket.on('customer_display_update', (data: any) => {
  // Broadcast cart updates to all customer displays for this restaurant
  io.to(`customer_display:${data.restaurantId}`).emit('display:cart-update', {
    items: data.items,
    subtotal: data.subtotal,
    total: data.total,
    tokenNumber: data.tokenNumber,
  });
});

socket.on('customer_display_show_qr', (data: any) => {
  // Show UPI/payment QR on customer displays
  io.to(`customer_display:${data.restaurantId}`).emit('display:show-qr', {
    upiUri: data.upiUri,
    amount: data.amount,
    merchantName: data.merchantName,
  });
});

socket.on('customer_display_reset', (data: any) => {
  // Clear customer displays after payment
  io.to(`customer_display:${data.restaurantId}`).emit('display:reset');
});

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: API ENDPOINT TO GET CURRENT INVENTORY STOCK
// ════════════════════════════════════════════════════════════════════════════════

router.get('/inventory/stock/:itemId', async (req, res) => {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: parseInt(req.params.itemId) },
      select: { 
        currentStock: true,
        thresholdQty: true,
        updatedAt: true,
      },
    });
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({
      stock: item.currentStock,
      threshold: item.thresholdQty,
      isLow: item.currentStock <= item.thresholdQty,
      lastUpdated: item.updatedAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// EXAMPLE: API ENDPOINT TO PROCESS OFFLINE ORDERS
// ════════════════════════════════════════════════════════════════════════════════

router.post('/offline/sync', async (req, res) => {
  try {
    const { orders } = req.body;
    const results = await syncOfflineOrders(orders);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function syncOfflineOrders(orders: any[]) {
  const results = {
    success: 0,
    failed: 0,
    failedOrders: [] as any[],
  };
  
  for (const order of orders) {
    try {
      const token = await createTokenFromOfflineOrder(order);
      results.success++;
      
      // Notify all terminals of the sync
      io.emit('token:synced-from-offline', {
        tokenId: token.id,
        tokenNumber: token.tokenNumber,
      });
    } catch (err) {
      results.failed++;
      results.failedOrders.push({ ...order, error: err.message });
    }
  }
  
  return results;
}
