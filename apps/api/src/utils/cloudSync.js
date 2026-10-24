import fs from 'fs';
import path from 'path';
import axios from 'axios';

const SYNC_STATE_FILE = 'sync-state.json';

// Helper to get the absolute path for sync state
function getSyncStatePath() {
  const baseDir = process.env.UPLOAD_DIR 
    ? path.dirname(process.env.UPLOAD_DIR) 
    : process.cwd();
  return path.join(baseDir, SYNC_STATE_FILE);
}

// Helper to load sync state
function loadSyncState() {
  const filePath = getSyncStatePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[CloudSync] Failed to load sync state:', err.message);
  }
  return {
    lastSyncedCustomerId: 0,
    lastSyncedOrderId: 0,
    lastSyncedExpenseId: 0,
    lastSyncedProductionRunId: 0,
    lastSyncedWarehouseTransferId: 0,
    lastSyncedTime: 0
  };
}

// Helper to save sync state
function saveSyncState(state) {
  const filePath = getSyncStatePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[CloudSync] Failed to save sync state:', err.message);
  }
}

/**
 * Sync Background Worker for Local Electron SQLite
 */
export async function startCloudSyncWorker(app) {
  const prisma = app.prisma;
  const isLocalSQLite = process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:');
  const cloudUrl = process.env.CLOUD_SYNC_URL || 'https://bakery.smartgonext.com';
  const syncEnabled = process.env.CLOUD_SYNC_ENABLED !== 'false';

  // Only run sync client on local offline EXE databases
  if (!isLocalSQLite) {
    console.info('[CloudSync] Server running in Cloud Mode (MySQL). Sync client worker disabled.');
    return;
  }

  if (!syncEnabled) {
    console.info('[CloudSync] Sync worker is explicitly disabled via env variables.');
    return;
  }

  console.info(`[CloudSync] Sync worker active. Target cloud server: ${cloudUrl}`);

  // Main sync function
  const runSync = async () => {
    try {
      // 1. Check network connection
      try {
        await axios.get(`${cloudUrl}/api/health`, { timeout: 4000 });
      } catch (connErr) {
        // Silent fail - network is offline
        return;
      }

      const state = loadSyncState();
      
      // Get current restaurant details
      const restaurant = await prisma.restaurant.findFirst({
        include: { settings: true }
      });

      if (!restaurant) return; // No restaurant configured yet

      // ── Sync Customers ──────────────────────────────────────
      const lastSyncDate = new Date(state.lastSyncedTime || 0);

      const unsyncedCustomers = await prisma.customer.findMany({
        where: {
          OR: [
            { id: { gt: state.lastSyncedCustomerId || 0 } },
            { updatedAt: { gt: lastSyncDate } }
          ]
        },
        orderBy: { id: 'asc' },
        take: 500
      });

      // ── Sync Orders (New or Updated Status/Total) ───────────
      const unsyncedOrders = await prisma.order.findMany({
        where: {
          OR: [
            { id: { gt: state.lastSyncedOrderId || 0 } },
            { updatedAt: { gt: lastSyncDate } }
          ]
        },
        include: {
          payments: true,
          kots: {
            include: {
              items: {
                include: {
                  menuItem: true
                }
              }
            }
          },
          customer: true
        },
        orderBy: { id: 'asc' },
        take: 500
      });

      // ── Sync Bakery Tokens (Standalone or Retail Tokens) ────
      let unsyncedTokens = [];
      try {
        unsyncedTokens = await prisma.bakeryToken.findMany({
          where: {
            OR: [
              { id: { gt: state.lastSyncedTokenId || 0 } },
              { updatedAt: { gt: lastSyncDate } }
            ]
          },
          include: {
            items: true,
            payments: true,
            customer: true
          },
          orderBy: { id: 'asc' },
          take: 500
        });
      } catch (_) {
        // Skip if table missing
      }

      // Format standalone tokens (tokens without an orderId link) as orders
      const formattedTokenOrders = (unsyncedTokens || [])
        .filter(t => !t.orderId)
        .map(t => {
          const totalAmount = t.items?.reduce((acc, it) => acc + Number(it.total || 0), 0) || 0;
          return {
            id: `token-${t.id}`,
            orderNumber: `TOK-${t.tokenNumber || t.id}`,
            type: 'token',
            status: t.status || 'paid',
            subtotal: totalAmount,
            total: totalAmount,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            customerName: t.customerName,
            customerPhone: t.customerPhone
          };
        });

      const payloadOrders = [...unsyncedOrders, ...formattedTokenOrders];

      // ── Sync Expenses ───────────────────────────────────────
      const unsyncedExpenses = await prisma.expense.findMany({
        where: { id: { gt: state.lastSyncedExpenseId || 0 } },
        include: {
          category: true
        },
        orderBy: { id: 'asc' },
        take: 30
      });

      // ── Sync Production Runs (only if table exists in local schema) ─────────────
      let unsyncedProductionRuns = [];
      try {
        unsyncedProductionRuns = await prisma.productionRun.findMany({
          where: { id: { gt: state.lastSyncedProductionRunId || 0 } },
          include: { ingredientsUsed: true },
          orderBy: { id: 'asc' },
          take: 30
        });
      } catch (_) {
        // Table does not exist in this local schema version — skip silently
      }

      // ── Sync Warehouse Transfers (only if table exists in local schema) ──────────
      let unsyncedTransfers = [];
      try {
        unsyncedTransfers = await prisma.warehouseTransfer.findMany({
          where: {
            OR: [
              { id: { gt: state.lastSyncedWarehouseTransferId || 0 } },
              { updatedAt: { gt: lastSyncDate } }
            ]
          },
          include: { items: true },
          orderBy: { id: 'asc' },
          take: 30
        });
      } catch (_) {
        // Table does not exist in this local schema version — skip silently
      }

      // ── Pull Pending Transfers from Cloud ───────────────────────────
      try {
        const branches = await prisma.branch.findMany({ select: { id: true } });
        const branchIds = branches.map(b => b.id);
        
        if (branchIds.length > 0) {
          const pullResponse = await axios.get(`${cloudUrl}/api/sync/pull-transfers`, {
            params: { branchIds: branchIds.join(',') },
            headers: {
              'X-Sync-Token': process.env.CLOUD_SYNC_SECRET || 'restaurant-saas-sync-secret-key'
            },
            timeout: 10000
          });

          if (pullResponse.data.success && Array.isArray(pullResponse.data.transfers)) {
            for (const transfer of pullResponse.data.transfers) {
              await prisma.$transaction(async (tx) => {
                const localTransfer = await tx.warehouseTransfer.findUnique({
                  where: { transferNumber: transfer.transferNumber }
                });

                if (localTransfer) {
                  // Update transfer details
                  await tx.warehouseTransfer.update({
                    where: { id: localTransfer.id },
                    data: {
                      status: transfer.status,
                      shippedAt: transfer.shippedAt ? new Date(transfer.shippedAt) : null,
                      receivedAt: transfer.receivedAt ? new Date(transfer.receivedAt) : null,
                      notes: transfer.notes,
                      receiverStaffId: transfer.receiverStaffId,
                      updatedAt: new Date(transfer.updatedAt)
                    }
                  });

                  // Re-sync items: delete and recreate to avoid ID conflicts
                  await tx.warehouseTransferItem.deleteMany({
                    where: { transferId: localTransfer.id }
                  });

                  for (const item of transfer.items || []) {
                    await tx.warehouseTransferItem.create({
                      data: {
                        transferId: localTransfer.id,
                        inventoryItemId: item.inventoryItemId,
                        quantityShipped: item.quantityShipped,
                        quantityReceived: item.quantityReceived,
                        quantityDamaged: item.quantityDamaged,
                        unitCost: item.unitCost
                      }
                    });
                  }
                } else {
                  // Create new transfer
                  const newTransfer = await tx.warehouseTransfer.create({
                    data: {
                      restaurantId: restaurant.id,
                      fromBranchId: transfer.fromBranchId,
                      toBranchId: transfer.toBranchId,
                      transferNumber: transfer.transferNumber,
                      transferType: transfer.transferType,
                      parentTransferId: transfer.parentTransferId,
                      status: transfer.status,
                      shippedAt: transfer.shippedAt ? new Date(transfer.shippedAt) : null,
                      receivedAt: transfer.receivedAt ? new Date(transfer.receivedAt) : null,
                      notes: transfer.notes,
                      shipperStaffId: transfer.shipperStaffId,
                      receiverStaffId: transfer.receiverStaffId,
                      createdAt: new Date(transfer.createdAt),
                      updatedAt: new Date(transfer.updatedAt)
                    }
                  });

                  for (const item of transfer.items || []) {
                    await tx.warehouseTransferItem.create({
                      data: {
                        transferId: newTransfer.id,
                        inventoryItemId: item.inventoryItemId,
                        quantityShipped: item.quantityShipped,
                        quantityReceived: item.quantityReceived,
                        quantityDamaged: item.quantityDamaged,
                        unitCost: item.unitCost
                      }
                    });
                  }
                }
              });
            }
          }
        }
      } catch (pullErr) {
        console.error('[CloudSync] Failed to pull pending transfers:', pullErr.message);
      }

      if (
        unsyncedCustomers.length === 0 && 
        payloadOrders.length === 0 && 
        unsyncedExpenses.length === 0 &&
        unsyncedProductionRuns.length === 0 &&
        unsyncedTransfers.length === 0
      ) {
        return; // Nothing new to push
      }

      console.info(`[CloudSync] Syncing payload to cloud: ${unsyncedCustomers.length} customers, ${payloadOrders.length} orders, ${unsyncedExpenses.length} expenses, ${unsyncedProductionRuns.length} runs, ${unsyncedTransfers.length} transfers.`);

      // Send payload
      const response = await axios.post(`${cloudUrl}/api/sync/push`, {
        restaurantSlug: restaurant.slug,
        restaurantEmail: restaurant.email,
        customers: unsyncedCustomers,
        orders: payloadOrders,
        expenses: unsyncedExpenses,
        productionRuns: unsyncedProductionRuns,
        warehouseTransfers: unsyncedTransfers
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Sync-Token': process.env.CLOUD_SYNC_SECRET || 'restaurant-saas-sync-secret-key'
        },
        timeout: 15000
      });

      if (response.data.success) {
        // Update state
        if (unsyncedCustomers.length > 0) {
          state.lastSyncedCustomerId = unsyncedCustomers[unsyncedCustomers.length - 1].id;
        }
        if (unsyncedOrders.length > 0) {
          state.lastSyncedOrderId = unsyncedOrders[unsyncedOrders.length - 1].id;
        }
        if (unsyncedTokens && unsyncedTokens.length > 0) {
          state.lastSyncedTokenId = unsyncedTokens[unsyncedTokens.length - 1].id;
        }
        if (unsyncedExpenses.length > 0) {
          state.lastSyncedExpenseId = unsyncedExpenses[unsyncedExpenses.length - 1].id;
        }
        if (unsyncedProductionRuns.length > 0) {
          state.lastSyncedProductionRunId = unsyncedProductionRuns[unsyncedProductionRuns.length - 1].id;
        }
        if (unsyncedTransfers.length > 0) {
          state.lastSyncedWarehouseTransferId = unsyncedTransfers[unsyncedTransfers.length - 1].id;
        }
        state.lastSyncedTime = Date.now();
        saveSyncState(state);
        
        console.info('[CloudSync] Batch sync finished and local sync-state updated.');
      }
    } catch (err) {
      console.error('[CloudSync] Error during background sync execution:', err.message);
    }
  };

  // Run immediately then schedule every 10 seconds
  setTimeout(runSync, 5000);
  const syncInterval = setInterval(runSync, 10000);
  syncInterval.unref(); // Don't block application exit
}

/**
 * Secure Cloud Endpoint Receiver (runs on Cloud/Web Server)
 * Handles POST /api/sync/push
 */
export async function handleCloudSyncPushRoute(request, reply) {
  const prisma = request.server.prisma;
  const token = request.headers['x-sync-token'];
  const expectedToken = process.env.CLOUD_SYNC_SECRET || 'restaurant-saas-sync-secret-key';

  // 1. Authorization
  if (token !== expectedToken) {
    reply.status(401).send({ success: false, error: 'Unauthorized sync request' });
    return;
  }

  const { 
    restaurantSlug, 
    restaurantEmail, 
    customers = [], 
    orders = [], 
    expenses = [],
    productionRuns = [],
    warehouseTransfers = []
  } = request.body;

  try {
    // 2. Lookup target Restaurant in cloud database
    const cloudRestaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { slug: restaurantSlug },
          { email: restaurantEmail }
        ]
      }
    });

    if (!cloudRestaurant) {
      reply.status(404).send({ success: false, error: `Restaurant with slug '${restaurantSlug}' not found in cloud.` });
      return;
    }

    const cloudRestaurantId = cloudRestaurant.id;

    // 3. Import data in a safe database transaction
    await prisma.$transaction(async (tx) => {
      // ── A. Sync Customers ──
      for (const cust of customers) {
        await tx.customer.upsert({
          where: { id: cust.id },
          create: {
            id: cust.id,
            restaurantId: cloudRestaurantId,
            name: cust.name,
            email: cust.email,
            phone: cust.phone,
            address: cust.address,
            loyaltyPoints: cust.loyaltyPoints,
            loyaltyStamps: cust.loyaltyStamps,
            totalOrders: cust.totalOrders,
            createdAt: new Date(cust.createdAt),
            updatedAt: new Date(cust.updatedAt)
          },
          update: {
            name: cust.name,
            email: cust.email,
            phone: cust.phone,
            address: cust.address,
            loyaltyPoints: cust.loyaltyPoints,
            loyaltyStamps: cust.loyaltyStamps,
            totalOrders: cust.totalOrders,
            updatedAt: new Date(cust.updatedAt)
          }
        });
      }

      // ── B. Sync Orders, Payments, KOTs ──
      for (const order of orders) {
        const payments = order.payments || [];
        const kots = order.kots || [];

        await tx.order.upsert({
          where: { id: order.id },
          create: {
            id: order.id,
            restaurantId: cloudRestaurantId,
            branchId: order.branchId,
            tableId: order.tableId,
            customerId: order.customerId,
            staffId: order.staffId,
            orderNumber: order.orderNumber,
            type: order.type,
            status: order.status,
            waiterAcceptance: order.waiterAcceptance,
            pax: order.pax,
            subtotal: order.subtotal,
            sgst: order.sgst,
            cgst: order.cgst,
            discount: order.discount,
            deliveryFee: order.deliveryFee,
            tip: order.tip,
            total: order.total,
            note: order.note,
            cancelReason: order.cancelReason,
            isDraft: order.isDraft,
            createdAt: new Date(order.createdAt),
            updatedAt: new Date(order.updatedAt)
          },
          update: {
            status: order.status,
            waiterAcceptance: order.waiterAcceptance,
            subtotal: order.subtotal,
            sgst: order.sgst,
            cgst: order.cgst,
            discount: order.discount,
            deliveryFee: order.deliveryFee,
            tip: order.tip,
            total: order.total,
            note: order.note,
            cancelReason: order.cancelReason,
            isDraft: order.isDraft,
            updatedAt: new Date(order.updatedAt)
          }
        });

        for (const pay of payments) {
          await tx.orderPayment.upsert({
            where: { id: pay.id },
            create: {
              id: pay.id,
              orderId: order.id,
              amount: pay.amount,
              method: pay.method,
              transactionId: pay.transactionId,
              gatewayRef: pay.gatewayRef,
              isDue: pay.isDue,
              paidAt: pay.paidAt ? new Date(pay.paidAt) : null,
              createdAt: new Date(pay.createdAt)
            },
            update: {
              amount: pay.amount,
              method: pay.method,
              transactionId: pay.transactionId,
              isDue: pay.isDue,
              paidAt: pay.paidAt ? new Date(pay.paidAt) : null
            }
          });
        }

        for (const kot of kots) {
          await tx.kOT.upsert({
            where: { id: kot.id },
            create: {
              id: kot.id,
              orderId: order.id,
              restaurantId: cloudRestaurantId,
              createdByTerminalId: kot.createdByTerminalId,
              createdByTerminalName: kot.createdByTerminalName,
              createdByTerminalType: kot.createdByTerminalType,
              kitchenId: kot.kitchenId,
              kotNumber: kot.kotNumber,
              status: kot.status,
              printedAt: kot.printedAt ? new Date(kot.printedAt) : null,
              createdAt: new Date(kot.createdAt),
              updatedAt: new Date(kot.updatedAt)
            },
            update: {
              status: kot.status,
              printedAt: kot.printedAt ? new Date(kot.printedAt) : null,
              updatedAt: new Date(kot.updatedAt)
            }
          });

          const kotItems = kot.items || [];
          for (const item of kotItems) {
            await tx.kOTItem.upsert({
              where: { id: item.id },
              create: {
                id: item.id,
                kotId: kot.id,
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                price: item.price,
                modifiers: item.modifiers,
                note: item.note,
                status: item.status,
                removedBy: item.removedBy,
                removeReason: item.removeReason,
                removedAt: item.removedAt ? new Date(item.removedAt) : null
              },
              update: {
                quantity: item.quantity,
                status: item.status,
                removedBy: item.removedBy,
                removeReason: item.removeReason,
                removedAt: item.removedAt ? new Date(item.removedAt) : null
              }
            });
          }
        }
      }

      // ── C. Sync Expenses ──
      for (const exp of expenses) {
        let categoryId = exp.categoryId;
        if (exp.category) {
          const category = await tx.expenseCategory.upsert({
            where: { id: exp.category.id },
            create: {
              id: exp.category.id,
              restaurantId: cloudRestaurantId,
              name: exp.category.name,
              description: exp.category.description,
              type: exp.category.type,
              createdAt: new Date(exp.category.createdAt)
            },
            update: {
              name: exp.category.name,
              description: exp.category.description
            }
          });
          categoryId = category.id;
        }

        await tx.expense.upsert({
          where: { id: exp.id },
          create: {
            id: exp.id,
            restaurantId: cloudRestaurantId,
            categoryId: categoryId,
            title: exp.title,
            amount: exp.amount,
            expenseDate: new Date(exp.expenseDate),
            paymentDate: exp.paymentDate ? new Date(exp.paymentDate) : null,
            dueDate: exp.dueDate ? new Date(exp.dueDate) : null,
            paymentStatus: exp.paymentStatus,
            paymentMethod: exp.paymentMethod,
            description: exp.description,
            receiptUrl: exp.receiptUrl,
            createdAt: new Date(exp.createdAt)
          },
          update: {
            title: exp.title,
            amount: exp.amount,
            paymentStatus: exp.paymentStatus,
            paymentMethod: exp.paymentMethod,
            description: exp.description,
            receiptUrl: exp.receiptUrl
          }
        });
      }

      // ── D. Sync Production Runs ──
      for (const run of productionRuns) {
        const cloudRun = await tx.productionRun.findUnique({
          where: { batchNumber: run.batchNumber }
        });

        if (cloudRun) {
          await tx.productionRun.update({
            where: { id: cloudRun.id },
            data: {
              quantityProduced: run.quantityProduced,
              overheadCost: run.overheadCost,
              costOfProduction: run.costOfProduction,
              status: run.status,
              wasteQuantity: run.wasteQuantity,
              wasteReason: run.wasteReason,
              notes: run.notes
            }
          });

          await tx.productionRunIngredient.deleteMany({
            where: { productionRunId: cloudRun.id }
          });

          for (const ing of run.ingredientsUsed || []) {
            await tx.productionRunIngredient.create({
              data: {
                productionRunId: cloudRun.id,
                inventoryItemId: ing.inventoryItemId,
                quantityConsumed: ing.quantityConsumed,
                costPerUnit: ing.costPerUnit
              }
            });
          }
        } else {
          const newRun = await tx.productionRun.create({
            data: {
              restaurantId: cloudRestaurantId,
              branchId: run.branchId,
              recipeId: run.recipeId,
              quantityProduced: run.quantityProduced,
              overheadCost: run.overheadCost,
              costOfProduction: run.costOfProduction,
              batchNumber: run.batchNumber,
              status: run.status,
              wasteQuantity: run.wasteQuantity,
              wasteReason: run.wasteReason,
              notes: run.notes,
              staffId: run.staffId,
              createdAt: new Date(run.createdAt)
            }
          });

          for (const ing of run.ingredientsUsed || []) {
            await tx.productionRunIngredient.create({
              data: {
                productionRunId: newRun.id,
                inventoryItemId: ing.inventoryItemId,
                quantityConsumed: ing.quantityConsumed,
                costPerUnit: ing.costPerUnit
              }
            });
          }
        }
      }

      // ── E. Sync Warehouse Transfers ──
      for (const transfer of warehouseTransfers) {
        const cloudTransfer = await tx.warehouseTransfer.findUnique({
          where: { transferNumber: transfer.transferNumber }
        });

        if (cloudTransfer) {
          await tx.warehouseTransfer.update({
            where: { id: cloudTransfer.id },
            data: {
              status: transfer.status,
              shippedAt: transfer.shippedAt ? new Date(transfer.shippedAt) : null,
              receivedAt: transfer.receivedAt ? new Date(transfer.receivedAt) : null,
              notes: transfer.notes,
              receiverStaffId: transfer.receiverStaffId,
              updatedAt: new Date(transfer.updatedAt)
            }
          });

          await tx.warehouseTransferItem.deleteMany({
            where: { transferId: cloudTransfer.id }
          });

          for (const item of transfer.items || []) {
            await tx.warehouseTransferItem.create({
              data: {
                transferId: cloudTransfer.id,
                inventoryItemId: item.inventoryItemId,
                quantityShipped: item.quantityShipped,
                quantityReceived: item.quantityReceived,
                quantityDamaged: item.quantityDamaged,
                unitCost: item.unitCost
              }
            });
          }
        } else {
          const newTransfer = await tx.warehouseTransfer.create({
            data: {
              restaurantId: cloudRestaurantId,
              fromBranchId: transfer.fromBranchId,
              toBranchId: transfer.toBranchId,
              transferNumber: transfer.transferNumber,
              transferType: transfer.transferType,
              parentTransferId: transfer.parentTransferId,
              status: transfer.status,
              shippedAt: transfer.shippedAt ? new Date(transfer.shippedAt) : null,
              receivedAt: transfer.receivedAt ? new Date(transfer.receivedAt) : null,
              notes: transfer.notes,
              shipperStaffId: transfer.shipperStaffId,
              receiverStaffId: transfer.receiverStaffId,
              createdAt: new Date(transfer.createdAt),
              updatedAt: new Date(transfer.updatedAt)
            }
          });

          for (const item of transfer.items || []) {
            await tx.warehouseTransferItem.create({
              data: {
                transferId: newTransfer.id,
                inventoryItemId: item.inventoryItemId,
                quantityShipped: item.quantityShipped,
                quantityReceived: item.quantityReceived,
                quantityDamaged: item.quantityDamaged,
                unitCost: item.unitCost
              }
            });
          }
        }
      }
    });

    console.info(`[CloudSyncServer] Synced and saved payload for '${restaurantSlug}' restaurant.`);
    return { success: true, message: 'Sync data processed and saved successfully.' };
  } catch (err) {
    request.log.error(err);
    reply.status(500).send({ success: false, error: err.message });
  }
}

/**
 * Cloud Endpoint for local clients to pull transfers addressed to their branches
 * Handles GET /api/sync/pull-transfers
 */
export async function handleCloudSyncPullTransfersRoute(request, reply) {
  const prisma = request.server.prisma;
  const token = request.headers['x-sync-token'];
  const expectedToken = process.env.CLOUD_SYNC_SECRET || 'restaurant-saas-sync-secret-key';

  if (token !== expectedToken) {
    reply.status(401).send({ success: false, error: 'Unauthorized sync request' });
    return;
  }

  const { branchIds } = request.query;
  if (!branchIds) {
    return { success: true, transfers: [] };
  }

  const ids = branchIds.split(',').map(id => Number(id)).filter(id => !isNaN(id));

  try {
    const transfers = await prisma.warehouseTransfer.findMany({
      where: {
        toBranchId: { in: ids },
        status: 'shipped'
      },
      include: {
        items: true
      }
    });

    return { success: true, transfers };
  } catch (err) {
    request.log.error(err);
    reply.status(500).send({ success: false, error: err.message });
  }
}
