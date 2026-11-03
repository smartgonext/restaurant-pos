import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { prisma } from '../../app.js';

function getDatabasePath() {
  const rawUrl = process.env.DATABASE_URL || '';
  if (!rawUrl.startsWith('file:')) {
    return null;
  }
  const sqliteRelPath = rawUrl.replace(/^file:/, '');
  if (path.isAbsolute(sqliteRelPath) && fs.existsSync(sqliteRelPath)) {
    return sqliteRelPath;
  }

  const candidates = [
    path.resolve(process.cwd(), sqliteRelPath),
    path.resolve(process.cwd(), 'api', sqliteRelPath),
    path.resolve(process.cwd(), 'api', 'prisma', sqliteRelPath),
    path.resolve(process.cwd(), 'prisma', sqliteRelPath),
    path.resolve(process.cwd(), '..', sqliteRelPath),
    path.resolve(process.cwd(), '..', 'api', sqliteRelPath),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand) && fs.statSync(cand).size > 0) {
      return cand;
    }
  }
  return path.resolve(process.cwd(), sqliteRelPath);
}

async function upsertCatalog(catalog) {
  if (!catalog) return;
  const { itemGroups, categories, menus, menuItems } = catalog;

  // 1. Item Groups
  if (Array.isArray(itemGroups) && itemGroups.length > 0) {
    for (const g of itemGroups) {
      try {
        await prisma.itemGroup.upsert({
          where: { id: g.id },
          update: { name: g.name, description: g.description, isKOTEnabled: g.isKOTEnabled, sortOrder: g.sortOrder },
          create: { id: g.id, restaurantId: g.restaurantId, name: g.name, description: g.description, isKOTEnabled: g.isKOTEnabled, sortOrder: g.sortOrder }
        });
      } catch (e) { /**/ }
    }
  }

  // 2. Categories
  if (Array.isArray(categories) && categories.length > 0) {
    for (const c of categories) {
      try {
        await prisma.itemCategory.upsert({
          where: { id: c.id },
          update: { name: c.name, description: c.description, groupId: c.groupId, sortOrder: c.sortOrder, isKOTEnabled: c.isKOTEnabled, image: c.image },
          create: { id: c.id, restaurantId: c.restaurantId, name: c.name, description: c.description, groupId: c.groupId, sortOrder: c.sortOrder, isKOTEnabled: c.isKOTEnabled, image: c.image }
        });
      } catch (e) { /**/ }
    }
  }

  // 3. Menus
  if (Array.isArray(menus) && menus.length > 0) {
    for (const m of menus) {
      try {
        await prisma.menu.upsert({
          where: { id: m.id },
          update: { name: m.name, description: m.description, isActive: m.isActive, sortOrder: m.sortOrder, image: m.image },
          create: { id: m.id, restaurantId: m.restaurantId, name: m.name, description: m.description, isActive: m.isActive, sortOrder: m.sortOrder, image: m.image }
        });
      } catch (e) { /**/ }
    }
  }

  // 4. Menu Items
  if (Array.isArray(menuItems) && menuItems.length > 0) {
    for (const item of menuItems) {
      try {
        await prisma.menuItem.upsert({
          where: { id: item.id },
          update: {
            name: item.name,
            description: item.description,
            price: item.price,
            menuId: item.menuId,
            categoryId: item.categoryId,
            isVeg: item.isVeg,
            isAvailable: item.isAvailable,
            isDeleted: item.isDeleted,
            salesUnit: item.salesUnit,
            taxType: item.taxType,
            taxPercent: item.taxPercent,
            sortOrder: item.sortOrder,
            image: item.image
          },
          create: {
            id: item.id,
            restaurantId: item.restaurantId,
            menuId: item.menuId,
            categoryId: item.categoryId,
            name: item.name,
            description: item.description,
            price: item.price,
            isVeg: item.isVeg,
            isAvailable: item.isAvailable,
            isDeleted: item.isDeleted,
            salesUnit: item.salesUnit,
            taxType: item.taxType,
            taxPercent: item.taxPercent,
            sortOrder: item.sortOrder,
            image: item.image
          }
        });
      } catch (e) { /**/ }
    }
  }
}

export async function lanSyncRoutes(app) {
  // ── GET /api/lan-sync/status ─────────────────────────────────────────────
  app.get('/status', async (req, reply) => {
    const discovery = app.lanPeerDiscovery;
    if (!discovery) {
      return { success: false, message: 'LAN Discovery service not initialized' };
    }

    // Get current local last order ID
    let lastOrderId = 0;
    try {
      const lastOrder = await prisma.order.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true, createdAt: true }
      });
      if (lastOrder) {
        lastOrderId = lastOrder.id;
        discovery.setTransactionMetadata(lastOrder.id, new Date(lastOrder.createdAt).getTime());
      }
    } catch (e) { /**/ }

    return {
      success: true,
      role: discovery.role,
      nodeId: discovery.nodeId,
      localIp: discovery.localIp,
      httpPort: discovery.httpPort,
      lastOrderId: discovery.lastOrderId,
      lastTxTime: discovery.lastTxTime,
      activeLeader: discovery.activeLeader,
      isLeader: discovery.role === 'LEADER'
    };
  });

  // ── POST /api/lan-sync/promote ───────────────────────────────────────────
  app.post('/promote', async (req, reply) => {
    const discovery = app.lanPeerDiscovery;
    if (!discovery) {
      return reply.status(500).send({ success: false, message: 'LAN Discovery not active' });
    }
    discovery.promoteToLeader();
    return { success: true, message: `Node ${discovery.nodeId} promoted to LEADER`, role: discovery.role };
  });

  // ── POST /api/lan-sync/stream-tx ─────────────────────────────────────────
  // Receives a live committed transaction from the leader
  app.post('/stream-tx', async (req, reply) => {
    const { type, data } = req.body || {};
    if (!type || !data) {
      return reply.status(400).send({ success: false, error: 'Missing type or data' });
    }

    try {
      if (type === 'ORDER_SAVED') {
        const orderData = data.order;
        if (orderData && orderData.id) {
          // Check if exists
          const existing = await prisma.order.findUnique({ where: { id: orderData.id } });
          if (existing) {
            await prisma.order.update({
              where: { id: orderData.id },
              data: {
                status: orderData.status,
                paymentStatus: orderData.paymentStatus,
                total: orderData.total,
                subtotal: orderData.subtotal,
                tax: orderData.tax,
                discount: orderData.discount,
                isPaid: orderData.isPaid
              }
            });
          } else {
            // Safe shallow create or full sync
            console.log(`[LAN-Sync] Streamed order #${orderData.id} received from peer.`);
          }
        }
      }

      if (type === 'TOKEN_SAVED') {
        const tokenData = data.token;
        if (tokenData && tokenData.id) {
          console.log(`[LAN-Sync] Streamed token #${tokenData.tokenNumber || tokenData.id} received.`);
        }
      }

      return { success: true, received: true };
    } catch (err) {
      app.log.warn(`[LAN-Sync] Error applying streamed transaction: ${err.message}`);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── POST /api/lan-sync/demote ─────────────────────────────────────────────
  app.post('/demote', async (req, reply) => {
    const discovery = app.lanPeerDiscovery;
    if (!discovery) {
      return reply.status(500).send({ success: false, message: 'LAN Discovery not active' });
    }
    discovery.role = 'STANDBY';
    console.log(`[LAN-Sync] Node ${discovery.nodeId} manually switched to STANDBY mode`);
    return { success: true, message: `Node ${discovery.nodeId} set to STANDBY mirror`, role: discovery.role };
  });

  // ── GET /api/lan-sync/catchup ────────────────────────────────────────────
  // Returns records updated since given timestamp or order ID
  app.get('/catchup', async (req, reply) => {
    const sinceTime = parseInt(req.query.since || '0', 10);
    const sinceDate = new Date(sinceTime);
    const includeCatalog = req.query.includeCatalog === 'true' || sinceTime === 0;

    try {
      const orders = await prisma.order.findMany({
        where: {
          updatedAt: { gt: sinceDate }
        },
        include: {
          items: true,
          payments: true
        },
        orderBy: { id: 'asc' },
        take: 200
      });

      const tokens = await prisma.tokenSequence ? await prisma.tokenSequence.findMany({
        take: 50
      }).catch(() => []) : [];

      let catalog = null;
      if (includeCatalog) {
        const [categories, menus, menuItems, itemGroups] = await Promise.all([
          prisma.itemCategory.findMany({ take: 500 }).catch(() => []),
          prisma.menu.findMany({ take: 100 }).catch(() => []),
          prisma.menuItem.findMany({ take: 2000 }).catch(() => []),
          prisma.itemGroup.findMany({ take: 100 }).catch(() => [])
        ]);
        catalog = { categories, menus, menuItems, itemGroups };
      }

      return {
        success: true,
        count: orders.length,
        orders,
        tokens,
        catalog,
        serverTime: Date.now()
      };
    } catch (err) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── GET /api/lan-sync/db-snapshot ────────────────────────────────────────
  app.get('/db-snapshot', async (req, reply) => {
    try {
      const dbPath = getDatabasePath();
      if (!dbPath || !fs.existsSync(dbPath)) {
        return reply.status(404).send({ success: false, error: 'SQLite database file not found' });
      }

      const fileStream = fs.createReadStream(dbPath);
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename=restaurant_snapshot_${Date.now()}.db`);
      return reply.send(fileStream);
    } catch (err) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── POST /api/lan-sync/restore-full-snapshot ────────────────────────────
  app.post('/restore-full-snapshot', async (req, reply) => {
    const discovery = app.lanPeerDiscovery;
    const remoteLeader = (discovery && discovery.activeLeader && discovery.activeLeader.ip !== discovery.localIp)
      ? discovery.activeLeader
      : (req.body && req.body.leaderIp ? { ip: req.body.leaderIp, httpPort: req.body.port || 3001 } : null);

    if (!remoteLeader) {
      return reply.status(400).send({ success: false, message: 'No remote Master server detected on LAN' });
    }

    const leaderUrl = `http://${remoteLeader.ip}:${remoteLeader.httpPort}`;
    console.log(`[LAN-Sync] Downloading full DB snapshot from Master at ${leaderUrl}...`);
    try {
      const dbPath = getDatabasePath();
      if (!dbPath) throw new Error('Local SQLite database path not resolved');

      const response = await axios.get(`${leaderUrl}/api/lan-sync/db-snapshot`, {
        responseType: 'arraybuffer',
        timeout: 25000
      });

      // Verify SQLite header (starts with "SQLite format 3\0")
      const buffer = Buffer.from(response.data);
      if (!buffer.slice(0, 15).toString().startsWith('SQLite format 3')) {
        throw new Error('Downloaded snapshot is not a valid SQLite database file');
      }

      // Safe release of SQLite file lock on Windows before overwriting
      try { await prisma.$disconnect(); } catch (e) { /**/ }
      await new Promise(r => setTimeout(r, 150));

      // Backup current file and replace
      const backupPath = `${dbPath}.bak_${Date.now()}`;
      if (fs.existsSync(dbPath)) {
        try { fs.copyFileSync(dbPath, backupPath); } catch (e) { /**/ }
      }
      fs.writeFileSync(dbPath, buffer);

      // Reconnect Prisma
      try { await prisma.$connect(); } catch (e) { /**/ }

      // Set self to STANDBY mirroring the remote leader
      if (discovery) {
        discovery.role = 'STANDBY';
        discovery.activeLeader = remoteLeader;
      }

      console.log(`[LAN-Sync] Full DB snapshot applied successfully from leader (${buffer.length} bytes).`);
      return { 
        success: true, 
        message: `Database clone complete! All items, categories, and menus are now synchronized from Master.`,
        bytes: buffer.length 
      };
    } catch (err) {
      app.log.error(err);
      try { await prisma.$connect(); } catch (e) { /**/ }
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── POST /api/lan-sync/trigger-catchup ────────────────────────────────────
  // Standby node calls this to pull missing data from the Leader
  app.post('/trigger-catchup', async (req, reply) => {
    const discovery = app.lanPeerDiscovery;
    const remoteLeader = (discovery && discovery.activeLeader && discovery.activeLeader.ip !== discovery.localIp)
      ? discovery.activeLeader
      : null;

    if (!remoteLeader) {
      return { success: false, message: 'No remote active leader found to catch up from' };
    }

    const leaderUrl = `http://${remoteLeader.ip}:${remoteLeader.httpPort}`;
    console.log(`[LAN-Sync] Triggering catch-up from leader at ${leaderUrl}...`);

    try {
      const localItemCount = await prisma.menuItem.count().catch(() => 0);
      const needCatalog = localItemCount === 0 || req.body?.includeCatalog === true;

      // Get our latest order time
      const lastOrder = await prisma.order.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true, updatedAt: true }
      });
      const since = lastOrder && lastOrder.updatedAt ? new Date(lastOrder.updatedAt).getTime() : 0;

      const res = await axios.get(`${leaderUrl}/api/lan-sync/catchup?since=${since}&includeCatalog=${needCatalog ? 'true' : 'false'}`, { timeout: 8000 });
      if (res.data && res.data.success) {
        // Upsert catalog if received
        if (res.data.catalog) {
          await upsertCatalog(res.data.catalog);
        }

        // Upsert orders locally
        if (Array.isArray(res.data.orders) && res.data.orders.length > 0) {
          for (const ord of res.data.orders) {
            try {
              const existing = await prisma.order.findUnique({ where: { id: ord.id } });
              if (existing) {
                await prisma.order.update({
                  where: { id: ord.id },
                  data: {
                    status: ord.status,
                    paymentStatus: ord.paymentStatus,
                    total: ord.total,
                    subtotal: ord.subtotal,
                    tax: ord.tax,
                    discount: ord.discount,
                    isPaid: ord.isPaid
                  }
                });
              } else {
                await prisma.order.create({
                  data: {
                    id: ord.id,
                    orderNumber: ord.orderNumber,
                    restaurantId: ord.restaurantId,
                    type: ord.type,
                    status: ord.status,
                    paymentStatus: ord.paymentStatus,
                    subtotal: ord.subtotal,
                    tax: ord.tax,
                    discount: ord.discount,
                    total: ord.total,
                    isPaid: ord.isPaid,
                    createdAt: ord.createdAt ? new Date(ord.createdAt) : new Date(),
                    updatedAt: ord.updatedAt ? new Date(ord.updatedAt) : new Date()
                  }
                }).catch(() => {});
              }
            } catch (itemErr) { /**/ }
          }
        }
        console.log(`[LAN-Sync] Catch-up retrieved & saved ${res.data.count} updated orders from leader.`);
        return { success: true, count: res.data.count, syncedFrom: leaderUrl };
      }
      return { success: false, message: 'Leader returned error' };
    } catch (err) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // ── 🔄 Automated Standby Background Sync Loop (Every 10 seconds) ─────────
  const autoSyncTimer = setInterval(async () => {
    const discovery = app.lanPeerDiscovery;
    if (discovery && discovery.role === 'STANDBY' && discovery.activeLeader && discovery.activeLeader.ip !== discovery.localIp) {
      const leaderUrl = `http://${discovery.activeLeader.ip}:${discovery.activeLeader.httpPort}`;
      try {
        const localItemCount = await prisma.menuItem.count().catch(() => 0);
        const needCatalog = localItemCount === 0;

        const lastOrder = await prisma.order.findFirst({
          orderBy: { id: 'desc' },
          select: { id: true, updatedAt: true }
        });
        const since = lastOrder && lastOrder.updatedAt ? new Date(lastOrder.updatedAt).getTime() : 0;
        const res = await axios.get(`${leaderUrl}/api/lan-sync/catchup?since=${since}&includeCatalog=${needCatalog ? 'true' : 'false'}`, { timeout: 6000 });
        if (res.data && res.data.success) {
          if (res.data.catalog) {
            await upsertCatalog(res.data.catalog);
            console.log(`[LAN-AutoSync] Synced catalog (${res.data.catalog.menuItems?.length || 0} items) from Master.`);
          }
          if (Array.isArray(res.data.orders) && res.data.orders.length > 0) {
            for (const ord of res.data.orders) {
              try {
                const existing = await prisma.order.findUnique({ where: { id: ord.id } });
                if (existing) {
                  await prisma.order.update({
                    where: { id: ord.id },
                    data: {
                      status: ord.status,
                      paymentStatus: ord.paymentStatus,
                      total: ord.total,
                      subtotal: ord.subtotal,
                      tax: ord.tax,
                      discount: ord.discount,
                      isPaid: ord.isPaid
                    }
                  });
                } else {
                  await prisma.order.create({
                    data: {
                      id: ord.id,
                      orderNumber: ord.orderNumber,
                      restaurantId: ord.restaurantId,
                      type: ord.type,
                      status: ord.status,
                      paymentStatus: ord.paymentStatus,
                      subtotal: ord.subtotal,
                      tax: ord.tax,
                      discount: ord.discount,
                      total: ord.total,
                      isPaid: ord.isPaid,
                      createdAt: ord.createdAt ? new Date(ord.createdAt) : new Date(),
                      updatedAt: ord.updatedAt ? new Date(ord.updatedAt) : new Date()
                    }
                  }).catch(() => {});
                }
              } catch (e) { /**/ }
            }
            console.log(`[LAN-AutoSync] Synced ${res.data.orders.length} orders from Main Server.`);
          }
        }
      } catch (syncErr) {
        // Silent catch when master is temporarily busy or rebooting
      }
    }
  }, 10000);
  autoSyncTimer.unref();
}
