import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

// Global set for per-restaurant locks
const activeSyncs = new Set();

/**
 * Helper to ensure the ERP Base URL contains the required API prefix
 */
function getErpUrl(baseUrl, path) {
  let url = baseUrl.replace(/\/+$/, '');
  if (!url.includes('/api/v1')) {
    url += '/api/v1';
  }
  return `${url}/${path.replace(/^\/+/, '')}`;
}

/**
 * Perform one sync cycle for a given restaurant config
 */
async function syncRestaurant(config, log) {
  const { restaurantId, baseUrl, apiKey } = config;
  
  if (activeSyncs.has(restaurantId)) {
    log.info(`[ErpSync] Sync already in progress for restaurant ${restaurantId}, skipping.`);
    return { success: false, error: 'Sync already in progress' };
  }
  
  activeSyncs.add(restaurantId);
  log.info(`[ErpSync] Starting sync for restaurant ${restaurantId} at base: ${baseUrl}`);
  
  try {
    const url = getErpUrl(baseUrl, '/store/dispatches?status=dispatched');
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      throw new Error(`ERP returned HTTP ${res.status}`);
    }
    
    const payload = await res.json();
    const dispatches = payload.data || [];
    let appliedCount = 0;
    
    for (const d of dispatches) {
      const dispatchId = d.id;
      
      // Check if already applied
      const existing = await prisma.erpAppliedDispatch.findUnique({
        where: {
          restaurantId_dispatchId: {
            restaurantId,
            dispatchId
          }
        }
      });
      
      if (existing) continue;
      
      const lines = d.receivable_lines || d.items || [];
      if (lines.length === 0) continue;
      
      // Apply to stock
      await prisma.$transaction(async (tx) => {
        // Double check within transaction
        const doubleCheck = await tx.erpAppliedDispatch.findUnique({
          where: {
            restaurantId_dispatchId: {
              restaurantId,
              dispatchId
            }
          }
        });
        if (doubleCheck) return;
        
        // Ensure default category
        let defaultCategory = await tx.inventoryItemCategory.findFirst({
          where: { restaurantId, name: 'ERP Imported' }
        });
        if (!defaultCategory) {
          defaultCategory = await tx.inventoryItemCategory.create({
            data: { restaurantId, name: 'ERP Imported' }
          });
        }
        
        // Ensure default unit
        let defaultUnit = await tx.inventoryUnit.findFirst({
          where: { restaurantId, name: 'Piece' }
        });
        if (!defaultUnit) {
          defaultUnit = await tx.inventoryUnit.findFirst({
            where: { restaurantId, symbol: 'pc' }
          });
        }
        if (!defaultUnit) {
          defaultUnit = await tx.inventoryUnit.create({
            data: { restaurantId, name: 'Piece', symbol: 'pc' }
          });
        }
        
        for (const line of lines) {
          const sku = line.sku;
          const qty = Number(line.qty || 0);
          const name = line.product_name || `Product ${line.product_id}`;
          const sellingPrice = Number(line.selling_price || 0);
          
          let item = null;
          if (sku) {
            item = await tx.inventoryItem.findFirst({
              where: {
                restaurantId,
                OR: [
                  { sku: sku },
                  { sku: `${sku}-${restaurantId}` }
                ]
              },
              include: { unit: true }
            });
          }
          
          if (item) {
            item = await tx.inventoryItem.update({
              where: { id: item.id },
              data: {
                currentStock: { increment: qty },
                costPerUnit: sellingPrice
              },
              include: { unit: true }
            });
          } else {
            // Check if SKU is taken globally to prevent unique constraint crashes
            let finalSku = sku;
            if (sku) {
              const globalItem = await tx.inventoryItem.findFirst({
                where: { sku }
              });
              if (globalItem) {
                finalSku = `${sku}-${restaurantId}`;
              }
            }

            item = await tx.inventoryItem.create({
              data: {
                restaurantId,
                categoryId: defaultCategory.id,
                unitId: defaultUnit.id,
                name: name,
                sku: finalSku || undefined,
                currentStock: qty,
                costPerUnit: sellingPrice,
                thresholdQty: 0
              },
              include: { unit: true }
            });
          }

          // Dual sync to MenuItem (runs for both new and updated items!)
          try {
            let menuCategory = await tx.itemCategory.findFirst({
              where: { restaurantId, name: defaultCategory.name }
            });
            if (!menuCategory) {
              menuCategory = await tx.itemCategory.create({
                data: {
                  restaurantId,
                  name: defaultCategory.name,
                  isKOTEnabled: false
                }
              });
            }
            let activeMenu = await tx.menu.findFirst({ where: { restaurantId } });
            if (!activeMenu) {
              activeMenu = await tx.menu.create({
                data: {
                  restaurantId,
                  name: 'General Menu',
                  isActive: true,
                  sortOrder: 1
                }
              });
            }
            if (activeMenu) {
              const existingMenuItem = await tx.menuItem.findFirst({
                where: { restaurantId, name: item.name, categoryId: menuCategory.id }
              });
              if (!existingMenuItem) {
                await tx.menuItem.create({
                  data: {
                    restaurantId,
                    menuId: activeMenu.id,
                    categoryId: menuCategory.id,
                    inventoryItemId: item.id,
                    name: item.name,
                    price: Math.round(sellingPrice * 1.3 * 10) / 10 || 10,
                    salesUnit: `${item.unit?.name || 'Piece'} (${item.unit?.symbol || 'pc'})`,
                    stockWarningThreshold: 0
                  }
                });
              }
            }
          } catch (e) {
            log.error(`[ErpSync] Error syncing item ${item.id} to menu: ${e.message}`);
          }
          
          // Log movement
          await tx.inventoryMovement.create({
            data: {
              restaurantId,
              itemId: item.id,
              type: 'stock_in',
              quantity: qty,
              note: `ERP Dispatch Sync: ${d.dispatch_ref || dispatchId}`
            }
          });
        }
        
        // Record applied dispatch
        await tx.erpAppliedDispatch.create({
          data: {
            restaurantId,
            dispatchId,
            dispatchRef: d.dispatch_ref || String(dispatchId)
          }
        });
        
        // Audit log
        let branch = await tx.branch.findFirst({ where: { restaurantId } });
        if (!branch) {
          branch = await tx.branch.create({
            data: {
              restaurantId,
              name: 'Main Branch',
              branchCode: `MAIN-${restaurantId}-${Date.now()}`
            }
          });
        }

        await tx.auditLog.create({
          data: {
            restaurantId,
            branchId: branch.id,
            action: 'ERP_DISPATCH_SYNC',
            reason: `Synced dispatch Ref: ${d.dispatch_ref || dispatchId}`,
            referenceId: String(dispatchId),
            details: JSON.stringify({
              dispatch_ref: d.dispatch_ref,
              total_lines: lines.length,
              total_qty: lines.reduce((acc, l) => acc + Number(l.qty || 0), 0)
            })
          }
        });
      });
      
      appliedCount++;
      
      // Acknowledge dispatch
      const rxUrl = `${baseUrl.replace(/\/+$/, '')}/store/dispatches/${dispatchId}/receive`;
      try {
        await fetch(rxUrl, {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        });
      } catch (err) {
        log.error(`[ErpSync] Failed to acknowledge dispatch ${dispatchId}: ${err.message}`);
      }
    }
    
    log.info(`[ErpSync] Sync complete for restaurant ${restaurantId}. Applied ${appliedCount} dispatches.`);
    return { success: true, appliedCount };
  } catch (err) {
    log.error(`[ErpSync] Sync failed for restaurant ${restaurantId}: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    activeSyncs.delete(restaurantId);
  }
}

/**
 * Start the background polling loop for ERP dispatches
 */
export function startErpSyncEngine(log) {
  log.info('[ErpSync] Initializing background ERP sync engine...');
  
  const tick = async () => {
    try {
      const configs = await prisma.erpSyncConfig.findMany();
      for (const config of configs) {
        // Run asynchronously without awaiting so one restaurant does not block others
        syncRestaurant(config, log).catch(err => {
          log.error(`[ErpSync] Unhandled error during sync for restaurant ${config.restaurantId}: ${err.message}`);
        });
      }
    } catch (err) {
      log.error(`[ErpSync] Error fetching configurations: ${err.message}`);
    }
  };
  
  // Run once immediately, then every 60 seconds
  setTimeout(tick, 5000); // 5s delay at start
  const interval = setInterval(tick, 60_000);
  interval.unref();
}

/**
 * Fastify routes registration
 */
export async function erpStoreRoutes(app) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);
  
  // GET /config - Read current config (obfuscates API Key)
  app.get('/config', async (request) => {
    const restaurantId = request.restaurantId;
    const config = await prisma.erpSyncConfig.findUnique({
      where: { restaurantId }
    });
    
    if (!config) {
      return { success: true, data: null };
    }
    
    return {
      success: true,
      data: {
        baseUrl: config.baseUrl,
        hasApiKey: !!config.apiKey
      }
    };
  });
  
  // POST /config - Save config
  app.post('/config', async (request, reply) => {
    const restaurantId = request.restaurantId;
    const { baseUrl, apiKey } = request.body || {};
    
    if (!baseUrl) {
      return reply.status(400).send({ success: false, error: 'baseUrl is required' });
    }
    
    // Find existing to decide whether to update or create
    const existing = await prisma.erpSyncConfig.findUnique({
      where: { restaurantId }
    });
    
    // If updating and no new apiKey is provided, retain the existing one
    const finalApiKey = apiKey || (existing ? existing.apiKey : '');
    if (!finalApiKey) {
      return reply.status(400).send({ success: false, error: 'apiKey is required' });
    }
    
    const config = await prisma.erpSyncConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        baseUrl,
        apiKey: finalApiKey
      },
      update: {
        baseUrl,
        apiKey: finalApiKey
      }
    });
    
    return {
      success: true,
      data: {
        baseUrl: config.baseUrl,
        hasApiKey: !!config.apiKey
      }
    };
  });
  
  // GET /ready-products - Proxies ERP GET /store/products
  app.get('/ready-products', async (request, reply) => {
    const restaurantId = request.restaurantId;
    const config = await prisma.erpSyncConfig.findUnique({
      where: { restaurantId }
    });
    
    if (!config || !config.baseUrl || !config.apiKey) {
      return reply.status(400).send({ success: false, error: 'ERP configuration is missing' });
    }
    
    try {
      const url = getErpUrl(config.baseUrl, '/store/products?include_zero_stock=1');
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': config.apiKey,
          'Content-Type': 'application/json'
        }
      });
      
      if (!res.ok) {
        return reply.status(res.status).send({ success: false, error: `ERP responded with HTTP ${res.status}` });
      }
      
      const payload = await res.json();
      return { success: true, data: payload.data };
    } catch (err) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
  
  // POST /sync - Trigger manual sync
  app.post('/sync', async (request, reply) => {
    const restaurantId = request.restaurantId;
    const config = await prisma.erpSyncConfig.findUnique({
      where: { restaurantId }
    });
    
    if (!config || !config.baseUrl || !config.apiKey) {
      return reply.status(400).send({ success: false, error: 'ERP configuration is missing' });
    }
    
    const result = await syncRestaurant(config, app.log);
    if (!result.success) {
      return reply.status(400).send(result);
    }
    return result;
  });
  
  // POST /dispatch - Proxy manual dispatch creation to ERP and apply locally
  app.post('/dispatch', async (request, reply) => {
    const restaurantId = request.restaurantId;
    const { items, notes } = request.body || {};
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ success: false, error: 'items array is required' });
    }
    
    const config = await prisma.erpSyncConfig.findUnique({
      where: { restaurantId }
    });
    
    if (!config || !config.baseUrl || !config.apiKey) {
      return reply.status(400).send({ success: false, error: 'ERP configuration is missing' });
    }
    
    try {
      const url = getErpUrl(config.baseUrl, '/store/dispatch');
      const erpRes = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': config.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items, notes })
      });
      
      if (!erpRes.ok) {
        const text = await erpRes.text();
        return reply.status(erpRes.status).send({ success: false, error: `ERP dispatch failed: ${text}` });
      }
      
      const payload = await erpRes.json();
      const dispatchData = payload.data || {};
      const dispatchId = dispatchData.id;
      
      if (!dispatchId) {
        return reply.status(500).send({ success: false, error: 'ERP did not return a valid dispatch ID' });
      }
      
      // Apply the dispatch locally immediately
      const lines = dispatchData.receivable_lines || dispatchData.items || [];
      if (lines.length > 0) {
        await prisma.$transaction(async (tx) => {
          // Find or create default category
          let defaultCategory = await tx.inventoryItemCategory.findFirst({
            where: { restaurantId, name: 'ERP Imported' }
          });
          if (!defaultCategory) {
            defaultCategory = await tx.inventoryItemCategory.create({
              data: { restaurantId, name: 'ERP Imported' }
            });
          }
          
          // Find or create default unit
          let defaultUnit = await tx.inventoryUnit.findFirst({
            where: { restaurantId, name: 'Piece' }
          });
          if (!defaultUnit) {
            defaultUnit = await tx.inventoryUnit.findFirst({
              where: { restaurantId, symbol: 'pc' }
            });
          }
          if (!defaultUnit) {
            defaultUnit = await tx.inventoryUnit.create({
              data: { restaurantId, name: 'Piece', symbol: 'pc' }
            });
          }
          
          for (const line of lines) {
            const sku = line.sku;
            const qty = Number(line.qty || 0);
            const name = line.product_name || `Product ${line.product_id}`;
            const sellingPrice = Number(line.selling_price || 0);
            
            let item = null;
            if (sku) {
              item = await tx.inventoryItem.findFirst({
                where: {
                  restaurantId,
                  OR: [
                    { sku: sku },
                    { sku: `${sku}-${restaurantId}` }
                  ]
                },
                include: { unit: true }
              });
            }
            
            if (item) {
              item = await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  currentStock: { increment: qty },
                  costPerUnit: sellingPrice
                },
                include: { unit: true }
              });

              // Ensure MenuItem exists for existing inventory item
              try {
                const userItem = items?.find((it) => Number(it.product_id) === Number(line.product_id));
                const customPrice = userItem?.price !== undefined ? Number(userItem.price) : (Math.round(sellingPrice * 1.3 * 10) / 10 || 10);
                const customImage = userItem?.image || item.image || null;
                
                let menuCategoryId = userItem?.categoryId ? Number(userItem.categoryId) : null;
                if (!menuCategoryId) {
                  // Fallback to item's category id
                  const itemCat = await tx.inventoryItemCategory.findUnique({
                    where: { id: item.categoryId }
                  });
                  if (itemCat) {
                    const menuCat = await tx.itemCategory.findFirst({
                      where: { restaurantId, name: itemCat.name }
                    });
                    if (menuCat) {
                      menuCategoryId = menuCat.id;
                    }
                  }
                }
                
                if (!menuCategoryId) {
                  let menuCategory = await tx.itemCategory.findFirst({
                    where: { restaurantId, name: defaultCategory.name }
                  });
                  if (!menuCategory) {
                    menuCategory = await tx.itemCategory.create({
                      data: {
                        restaurantId,
                        name: defaultCategory.name,
                        isKOTEnabled: false
                      }
                    });
                  }
                  menuCategoryId = menuCategory.id;
                }

                let activeMenu = await tx.menu.findFirst({ where: { restaurantId } });
                if (!activeMenu) {
                  activeMenu = await tx.menu.create({
                    data: {
                      restaurantId,
                      name: 'General Menu',
                      isActive: true,
                      sortOrder: 1
                    }
                  });
                }
                if (activeMenu) {
                  const existingMenuItem = await tx.menuItem.findFirst({
                    where: { restaurantId, inventoryItemId: item.id }
                  });
                  if (!existingMenuItem) {
                    await tx.menuItem.create({
                      data: {
                        restaurantId,
                        menuId: activeMenu.id,
                        categoryId: menuCategoryId,
                        inventoryItemId: item.id,
                        name: item.name,
                        price: customPrice,
                        image: customImage,
                        salesUnit: `${item.unit?.name || 'Piece'} (${item.unit?.symbol || 'pc'})`,
                        stockWarningThreshold: 0
                      }
                    });
                  }
                }
              } catch (e) {
                app.log.error(`[ErpSync] Error syncing existing item ${item.id} to menu: ${e.message}`);
              }
            } else {
              const userItem = items?.find((it) => Number(it.product_id) === Number(line.product_id));
              const customName = userItem?.name || name;
              const customPrice = userItem?.price !== undefined ? Number(userItem.price) : (Math.round(sellingPrice * 1.3 * 10) / 10 || 10);
              const customImage = userItem?.image || null;
              
              let finalCategoryId = defaultCategory.id;
              if (userItem?.categoryId) {
                const itemCat = await tx.itemCategory.findFirst({
                  where: { id: Number(userItem.categoryId), restaurantId }
                });
                if (itemCat) {
                  let invCat = await tx.inventoryItemCategory.findFirst({
                    where: { name: itemCat.name, restaurantId }
                  });
                  if (!invCat) {
                    invCat = await tx.inventoryItemCategory.create({
                      data: { name: itemCat.name, restaurantId }
                    });
                  }
                  finalCategoryId = invCat.id;
                }
              }

              // Check if SKU is taken globally to prevent unique constraint crashes
              let finalSku = sku;
              if (sku) {
                const globalItem = await tx.inventoryItem.findFirst({
                  where: { sku }
                });
                if (globalItem) {
                  finalSku = `${sku}-${restaurantId}`;
                }
              }

              item = await tx.inventoryItem.create({
                data: {
                  restaurantId,
                  categoryId: finalCategoryId,
                  unitId: defaultUnit.id,
                  name: customName,
                  sku: finalSku || undefined,
                  image: customImage,
                  currentStock: qty,
                  costPerUnit: sellingPrice,
                  thresholdQty: 0
                },
                include: { unit: true }
              });
              
              // Dual sync
              try {
                let menuCategoryId = userItem?.categoryId ? Number(userItem.categoryId) : null;
                if (!menuCategoryId) {
                  let menuCategory = await tx.itemCategory.findFirst({
                    where: { restaurantId, name: defaultCategory.name }
                  });
                  if (!menuCategory) {
                    menuCategory = await tx.itemCategory.create({
                      data: {
                        restaurantId,
                        name: defaultCategory.name,
                        isKOTEnabled: false
                      }
                    });
                  }
                  menuCategoryId = menuCategory.id;
                }

                let activeMenu = await tx.menu.findFirst({ where: { restaurantId } });
                if (!activeMenu) {
                  activeMenu = await tx.menu.create({
                    data: {
                      restaurantId,
                      name: 'General Menu',
                      isActive: true,
                      sortOrder: 1
                    }
                  });
                }
                if (activeMenu) {
                  const existingMenuItem = await tx.menuItem.findFirst({
                    where: { restaurantId, name: item.name, categoryId: menuCategoryId }
                  });
                  if (!existingMenuItem) {
                    await tx.menuItem.create({
                      data: {
                        restaurantId,
                        menuId: activeMenu.id,
                        categoryId: menuCategoryId,
                        inventoryItemId: item.id,
                        name: item.name,
                        price: customPrice,
                        image: customImage,
                        salesUnit: `${item.unit?.name || 'Piece'} (${item.unit?.symbol || 'pc'})`,
                        stockWarningThreshold: 0
                      }
                    });
                  }
                }
              } catch (e) {
                app.log.error(`[ErpSync] Error syncing item ${item.id} to menu: ${e.message}`);
              }
            }
            
            // Log movement
            await tx.inventoryMovement.create({
              data: {
                restaurantId,
                itemId: item.id,
                type: 'stock_in',
                quantity: qty,
                note: `ERP Dispatch Sync: ${dispatchData.dispatch_ref || dispatchId}`
              }
            });
          }
          
          // Record applied dispatch
          await tx.erpAppliedDispatch.create({
            data: {
              restaurantId,
              dispatchId,
              dispatchRef: dispatchData.dispatch_ref || String(dispatchId)
            }
          });
          
          // Audit log
          let branch = await tx.branch.findFirst({ where: { restaurantId } });
          if (!branch) {
            branch = await tx.branch.create({
              data: {
                restaurantId,
                name: 'Main Branch',
                branchCode: `MAIN-${restaurantId}-${Date.now()}`
              }
            });
          }

          await tx.auditLog.create({
            data: {
              restaurantId,
              branchId: branch.id,
              action: 'ERP_DISPATCH_SYNC',
              reason: `Synced dispatch Ref: ${dispatchData.dispatch_ref || dispatchId}`,
              referenceId: String(dispatchId),
              details: JSON.stringify({
                dispatch_ref: dispatchData.dispatch_ref,
                total_lines: lines.length,
                total_qty: lines.reduce((acc, l) => acc + Number(l.qty || 0), 0)
              })
            }
          });
        });
        
        // Acknowledge dispatch
        const rxUrl = `${config.baseUrl.replace(/\/+$/, '')}/store/dispatches/${dispatchId}/receive`;
        try {
          await fetch(rxUrl, {
            method: 'POST',
            headers: {
              'X-API-Key': config.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          });
        } catch (err) {
          app.log.error(`[ErpSync] Failed to acknowledge dispatch ${dispatchId}: ${err.message}`);
        }
      }
      
      return { success: true, data: dispatchData };
    } catch (err) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
