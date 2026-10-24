import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { emitToRestaurant } from '../../plugins/socket.js';
export async function inventoryRoutes(app) {
    app.addHook('onRequest', authenticate);
    app.addHook('onRequest', tenantScope);
    /**
     * CORE PRICING RULE:
     *   sellingPrice = purchaseRate × (1 + profitPercent / 100)
     *
     * profitPercent is FIXED at creation time and MUST NEVER be modified by
     * any automatic logic. Only a deliberate user action may change it.
     *
     * mrp in InventoryItemMRP stores whatever the user originally entered as
     * "MRP" (maximum retail price / printed price). The SELLING PRICE that
     * the POS uses is always the computed sellingPrice field added here.
     */
    const computeSellingPrice = (m) => {
        if (!m)
            return m;
        const purchase = Number(m.purchaseRate ?? 0);
        const profit = Number(m.profitPercent ?? 0); // ← never modified here
        const selling = Math.round(purchase * (1 + profit / 100) * 100) / 100;
        return { ...m, sellingPrice: selling };
    };
    /**
     * Resolve profitPercent with safe inheritance behavior:
     *   1. Use caller-supplied value when explicitly provided (including 0).
     *   2. Otherwise inherit from latest active MRP for this item (and supplier if provided).
     *   3. If no history exists, default to 0.
     *
     * NEVER auto-computes profitPercent from (mrp - purchaseRate).
     */
    const resolveProfitPercent = async (params) => {
        if (params.profitPercent !== undefined && params.profitPercent !== null) {
            return Number(params.profitPercent);
        }
        const baseWhere = {
            inventoryItemId: params.inventoryItemId,
            inventoryItem: { restaurantId: params.restaurantId },
            isActive: true,
        };
        // 1) Try supplier-specific latest MRP first when supplier is provided.
        if (params.supplierId != null) {
            const latestForSupplier = await prisma.inventoryItemMRP.findFirst({
                where: { ...baseWhere, supplierId: params.supplierId },
                orderBy: { createdAt: 'desc' },
                select: { profitPercent: true },
            });
            if (latestForSupplier?.profitPercent !== undefined && latestForSupplier?.profitPercent !== null) {
                return Number(latestForSupplier.profitPercent);
            }
        }
        // 2) Fallback to latest item-wide MRP regardless of supplier.
        const latestAnySupplier = await prisma.inventoryItemMRP.findFirst({
            where: baseWhere,
            orderBy: { createdAt: 'desc' },
            select: { profitPercent: true },
        });
        // 3) No history exists -> default to 0.
        return Number(latestAnySupplier?.profitPercent ?? 0);
    };
    // ═══════════════════════════════════════════════════════
    // ITEMS
    // BUG FIX: /items/search MUST be registered BEFORE /items/:id
    // ═══════════════════════════════════════════════════════
    app.get('/items/search', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const { q, categoryId } = request.query;
            const where = { restaurantId };
            if (q) {
                where.OR = [
                    { name: { contains: q } },
                    { sku: { contains: q } },
                    { barcode: { contains: q } },
                    { category: { name: { contains: q } } },
                ];
            }
            if (categoryId)
                where.categoryId = Number(categoryId);
            const items = await prisma.inventoryItem.findMany({
                where,
                include: { category: true, unit: true, inventoryMRPs: { where: { isActive: true }, include: { supplier: true } } },
                take: 50
            });
            const enriched = items.map((it) => ({ ...it, inventoryMRPs: (it.inventoryMRPs || []).map(computeSellingPrice) }));
            return { success: true, data: enriched };
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    const syncNonKOTItems = async (restaurantId) => {
        try {
            const menuItems = await prisma.menuItem.findMany({
                where: {
                    restaurantId,
                    isDeleted: false,
                    category: { isKOTEnabled: false },
                    inventoryItemId: null
                },
                include: { category: true }
            });
            for (const menuItem of menuItems) {
                if (!menuItem.category) continue;
                let invCat = await prisma.inventoryItemCategory.findFirst({
                    where: { restaurantId, name: menuItem.category.name }
                });
                if (!invCat) {
                    invCat = await prisma.inventoryItemCategory.create({
                        data: { restaurantId, name: menuItem.category.name }
                    });
                }
                let unitSymbol = 'pc';
                let unitName = 'Piece';
                if (menuItem.salesUnit) {
                    const parts = menuItem.salesUnit.split(' ');
                    if (parts.length > 0) {
                        unitName = parts[0];
                        const matchSym = menuItem.salesUnit.match(/\(([^)]+)\)/);
                        if (matchSym && matchSym[1]) {
                            unitSymbol = matchSym[1];
                        } else {
                            unitSymbol = parts[1] || parts[0].toLowerCase().slice(0, 3);
                        }
                    }
                }
                let invUnit = await prisma.inventoryUnit.findFirst({
                    where: { restaurantId, name: unitName }
                });
                if (!invUnit) {
                    invUnit = await prisma.inventoryUnit.findFirst({
                        where: { restaurantId, symbol: unitSymbol }
                    });
                }
                if (!invUnit) {
                    invUnit = await prisma.inventoryUnit.create({
                        data: { restaurantId, name: unitName, symbol: unitSymbol }
                    });
                }
                let invItem = await prisma.inventoryItem.findFirst({
                    where: { restaurantId, name: menuItem.name.trim() }
                });
                if (!invItem) {
                    invItem = await prisma.inventoryItem.create({
                        data: {
                            restaurantId,
                            categoryId: invCat.id,
                            unitId: invUnit.id,
                            name: menuItem.name.trim(),
                            image: menuItem.image || undefined,
                            thresholdQty: menuItem.stockWarningThreshold ? Number(menuItem.stockWarningThreshold) : 0,
                            currentStock: 0,
                            costPerUnit: Math.round(Number(menuItem.price || 0) * 0.7 * 100) / 100
                        }
                    });
                }
                await prisma.menuItem.update({
                    where: { id: menuItem.id },
                    data: { inventoryItemId: invItem.id }
                });
            }
        } catch (e) {
            console.error('Error syncing non-KOT items:', e);
        }
    };

    app.get('/items', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            await syncNonKOTItems(restaurantId);
            const q = String(request.query?.search || request.query?.q || '').trim();
            const categoryId = request.query?.categoryId ? Number(request.query.categoryId) : undefined;
            const where = { restaurantId };
            if (categoryId && !isNaN(categoryId))
                where.categoryId = categoryId;
            if (q) {
                where.OR = [
                    { name: { contains: q } },
                    { sku: { contains: q } },
                    { barcode: { contains: q } },
                    { category: { name: { contains: q } } },
                ];
            }
            const items = await prisma.inventoryItem.findMany({
                where,
                include: { category: true, unit: true, inventoryMRPs: { orderBy: { createdAt: 'desc' } } }
            });
            const enriched = items.map((it) => ({ ...it, inventoryMRPs: (it.inventoryMRPs || []).map(computeSellingPrice) }));
            return { success: true, data: enriched };
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Inventory summary used by dashboard. Performs in-memory low-stock check
    // (Prisma cannot compare two columns directly in a simple where clause).
    app.get('/inventory/summary', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const items = await prisma.inventoryItem.findMany({ where: { restaurantId }, select: { id: true, name: true, currentStock: true, thresholdQty: true } });
            const totalItems = items.length;
            const totalStock = items.reduce((s, it) => s + Number(it.currentStock || 0), 0);
            const lowStockItems = items.filter((it) => Number(it.currentStock || 0) <= Number(it.thresholdQty || 0));
            return { success: true, data: { totalItems, totalStock, lowStockCount: lowStockItems.length, lowStockItems } };
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.post('/items', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.categoryId)
            return reply.status(400).send({ success: false, error: 'categoryId is required' });
        const rawCat = Number(body.categoryId);
        if (isNaN(rawCat))
            return reply.status(400).send({ success: false, error: 'categoryId must be a number' });
        let invCat = await prisma.inventoryItemCategory.findFirst({ where: { id: rawCat, restaurantId } });
        if (!invCat) {
            const menuCat = await prisma.itemCategory.findFirst({ where: { id: rawCat, restaurantId } });
            if (!menuCat)
                return reply.status(400).send({ success: false, error: 'Invalid category id' });
            invCat = await prisma.inventoryItemCategory.findFirst({ where: { restaurantId, name: menuCat.name } });
            if (!invCat)
                invCat = await prisma.inventoryItemCategory.create({ data: { restaurantId, name: menuCat.name } });
        }
        const { unitId, name, image, thresholdQty, currentStock, costPerUnit } = body;
        if (!name || typeof name !== 'string' || !name.trim())
            return reply.status(400).send({ success: false, error: 'name is required' });
        if (!unitId)
            return reply.status(400).send({ success: false, error: 'unitId is required' });
        try {
            let finalSku = body.sku;
            if (body.sku) {
                const globalItem = await prisma.inventoryItem.findFirst({
                    where: { sku: body.sku }
                });
                if (globalItem) {
                    finalSku = `${body.sku}-${restaurantId}`;
                }
            }

            let finalBarcode = body.barcode;
            if (body.barcode) {
                const globalItem = await prisma.inventoryItem.findFirst({
                    where: { barcode: body.barcode }
                });
                if (globalItem) {
                    finalBarcode = `${body.barcode}-${restaurantId}`;
                }
            }

            const item = await prisma.inventoryItem.create({
                data: {
                    restaurantId, categoryId: invCat.id, unitId: Number(unitId),
                    name: name.trim(), image: image || undefined,
                    sku: finalSku || undefined,
                    barcode: finalBarcode || undefined,
                    thresholdQty: thresholdQty !== undefined ? Number(thresholdQty) : 0,
                    currentStock: currentStock !== undefined ? Number(currentStock) : 0,
                    costPerUnit: costPerUnit !== undefined ? Number(costPerUnit) : 0
                },
                include: { unit: true }
            });

            // Dual sync: InventoryItem to MenuItem
            try {
                let menuCategory = await prisma.itemCategory.findFirst({
                    where: { restaurantId, name: invCat.name }
                });
                if (!menuCategory) {
                    menuCategory = await prisma.itemCategory.create({
                        data: {
                            restaurantId,
                            name: invCat.name,
                            isKOTEnabled: false
                        }
                    });
                }
                const activeMenu = await prisma.menu.findFirst({ where: { restaurantId } });
                if (activeMenu) {
                    const existingMenuItem = await prisma.menuItem.findFirst({
                        where: { restaurantId, name: item.name, categoryId: menuCategory.id }
                    });
                    if (!existingMenuItem) {
                        await prisma.menuItem.create({
                            data: {
                                restaurantId,
                                menuId: activeMenu.id,
                                categoryId: menuCategory.id,
                                inventoryItemId: item.id,
                                name: item.name,
                                price: Math.round(Number(item.costPerUnit || 0) * 1.3 * 10) / 10 || 10,
                                image: item.image || undefined,
                                salesUnit: `${item.unit?.name || 'Piece'} (${item.unit?.symbol || 'pc'})`,
                                stockWarningThreshold: Number(item.thresholdQty || 0)
                            }
                        });
                    }
                }
            } catch (e) {
                console.error('Error syncing inventory item to menu item:', e);
            }

            return { success: true, data: item };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.get('/items/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const itemId = Number(id);
        if (isNaN(itemId))
            return reply.status(400).send({ success: false, error: 'Invalid item id' });
        const item = await prisma.inventoryItem.findFirst({
            where: { id: itemId, restaurantId },
            include: { category: true, unit: true, inventoryMRPs: { where: { isActive: true }, include: { supplier: true }, orderBy: { createdAt: 'desc' } } }
        });
        if (!item)
            return reply.status(404).send({ success: false, error: 'Item not found' });
        item.inventoryMRPs = (item.inventoryMRPs || []).map(computeSellingPrice);
        return { success: true, data: item };
    });
    app.put('/items/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const itemId = Number(id);
        if (isNaN(itemId))
            return reply.status(400).send({ success: false, error: 'Invalid item id' });
        try {
            const body = request.body;
            const updateData = {};
            if (body.name !== undefined)
                updateData.name = body.name;
            if (body.image !== undefined)
                updateData.image = body.image;
            if (body.sku !== undefined)
                updateData.sku = body.sku;
            if (body.barcode !== undefined)
                updateData.barcode = body.barcode;
            if (body.thresholdQty !== undefined)
                updateData.thresholdQty = Number(body.thresholdQty);
            if (body.currentStock !== undefined)
                updateData.currentStock = Number(body.currentStock);
            if (body.costPerUnit !== undefined)
                updateData.costPerUnit = Number(body.costPerUnit);
            if (body.unitId !== undefined)
                updateData.unitId = Number(body.unitId);
            if (body.categoryId !== undefined)
                updateData.categoryId = Number(body.categoryId);
            const item = await prisma.inventoryItem.update({ where: { id: itemId, restaurantId }, data: updateData });
            return { success: true, data: item };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/items/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const itemId = Number(id);
        if (isNaN(itemId))
            return reply.status(400).send({ success: false, error: 'Invalid item id' });
        try {
            const hasPOItem = await prisma.purchaseOrderItem.findFirst({ where: { inventoryItemId: itemId } });
            const hasMenuItem = await prisma.menuItem.findFirst({ where: { inventoryItemId: itemId, isDeleted: false } });
            const hasRecipe = await prisma.recipeIngredient.findFirst({ where: { inventoryItemId: itemId } });
            if (hasPOItem || hasMenuItem || hasRecipe)
                return reply.status(400).send({ success: false, error: 'Item has associated records and cannot be deleted' });
            await prisma.inventoryItemMRP.updateMany({ where: { inventoryItemId: itemId }, data: { isActive: false } });
            await prisma.inventoryItem.delete({ where: { id: itemId } });
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.post('/items/:id/movements', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const itemId = Number(id);
        if (isNaN(itemId))
            return reply.status(400).send({ success: false, error: 'Invalid item id' });
        const { z } = await import('zod');
        const schema = z.object({
            type: z.string(),
            quantity: z.number().positive('Quantity must be positive'),
            note: z.string().optional(),
            referenceId: z.number().optional()
        });
        try {
            const body = schema.parse(request.body);
            const qty = body.quantity;
            const isIncrement = ['purchase', 'adjustment', 'stock_in'].includes(body.type);
            const existing = await prisma.inventoryItem.findFirst({ where: { id: itemId, restaurantId } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'Item not found' });
            if (!isIncrement && Number(existing.currentStock) < qty)
                return reply.status(400).send({ success: false, error: `Insufficient stock. Current: ${existing.currentStock}` });
            const result = await prisma.$transaction(async (tx) => {
                const mv = await tx.inventoryMovement.create({
                    data: { restaurantId, itemId, type: body.type, quantity: qty, note: body.note, referenceId: body.referenceId }
                });
                await tx.inventoryItem.update({ where: { id: itemId }, data: { currentStock: isIncrement ? { increment: qty } : { decrement: qty } } });
                return mv;
            });
            try {
                const updatedItem = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
                emitToRestaurant(restaurantId, 'inventory.movement.created', result);
                if (updatedItem)
                    emitToRestaurant(restaurantId, 'inventory.item.updated', { itemId: updatedItem.id, currentStock: updatedItem.currentStock });
            }
            catch (e) { }
            return { success: true, data: result };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Barcode image generation (server-side). Falls back to SKU then item id.
    app.get('/items/:id/barcode', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const itemId = Number(id);
        if (isNaN(itemId))
            return reply.status(400).send({ success: false, error: 'Invalid item id' });
        const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, restaurantId } });
        if (!item)
            return reply.status(404).send({ success: false, error: 'Item not found' });
        const code = item.barcode || item.sku || String(item.id);
        try {
            const bwip = await import('bwip-js');
            const png = await bwip.toBuffer({
                bcid: 'code128', // Barcode type
                text: String(code), // Text to encode
                scale: 3,
                height: 12,
                includetext: true,
                textxalign: 'center'
            });
            reply.header('Content-Type', 'image/png').send(png);
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Transfer stock between branches (updates per-branch stock, creates movement record).
    app.post('/branch-stocks/transfer', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({ inventoryItemId: z.number().int().positive(), fromBranchId: z.number().int().positive(), toBranchId: z.number().int().positive(), quantity: z.number().positive(), note: z.string().optional() });
        try {
            const body = schema.parse(request.body);
            const { inventoryItemId, fromBranchId, toBranchId, quantity, note } = body;
            if (fromBranchId === toBranchId)
                return reply.status(400).send({ success: false, error: 'fromBranchId and toBranchId must differ' });
            const fromStock = await prisma.branchStock.findFirst({ where: { branchId: fromBranchId, inventoryItemId } });
            if (!fromStock || Number(fromStock.quantity) < Number(quantity))
                return reply.status(400).send({ success: false, error: 'Insufficient stock at source branch' });
            const result = await prisma.$transaction(async (tx) => {
                const mv = await tx.inventoryMovement.create({ data: { restaurantId, itemId: inventoryItemId, type: 'transfer', quantity, note, fromBranchId, toBranchId } });
                await tx.branchStock.update({ where: { id: fromStock.id }, data: { quantity: { decrement: quantity } } });
                const dest = await tx.branchStock.findFirst({ where: { branchId: toBranchId, inventoryItemId } });
                if (dest) {
                    await tx.branchStock.update({ where: { id: dest.id }, data: { quantity: { increment: quantity } } });
                }
                else {
                    await tx.branchStock.create({ data: { restaurantId, branchId: toBranchId, inventoryItemId, quantity } });
                }
                return mv;
            });
            emitToRestaurant(restaurantId, 'inventory.movement.created', result);
            return { success: true, data: result };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Adjust branch stock (damage, return, stock_in/out) and update global currentStock accordingly for non-transfer events.
    app.post('/branch-stocks/adjust', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({ inventoryItemId: z.number().int().positive(), branchId: z.number().int().positive(), quantity: z.number().positive(), type: z.enum(['damage', 'return', 'stock_in', 'stock_out']), note: z.string().optional() });
        try {
            const body = schema.parse(request.body);
            const { inventoryItemId, branchId, quantity, type, note } = body;
            const isIncrement = ['return', 'stock_in'].includes(type);
            const existing = await prisma.branchStock.findFirst({ where: { branchId, inventoryItemId } });
            if (!existing && !isIncrement)
                return reply.status(400).send({ success: false, error: 'No stock at branch to decrement' });
            const result = await prisma.$transaction(async (tx) => {
                const mv = await tx.inventoryMovement.create({ data: { restaurantId, itemId: inventoryItemId, type, quantity, note, fromBranchId: isIncrement ? undefined : branchId, toBranchId: isIncrement ? branchId : undefined } });
                if (existing) {
                    await tx.branchStock.update({ where: { id: existing.id }, data: { quantity: isIncrement ? { increment: quantity } : { decrement: quantity } } });
                }
                else if (isIncrement) {
                    await tx.branchStock.create({ data: { restaurantId, branchId, inventoryItemId, quantity } });
                }
                // Update global inventory currentStock for damage/return/stock_in/stock_out
                if (isIncrement) {
                    await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { currentStock: { increment: quantity } } });
                }
                else {
                    await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: { currentStock: { decrement: quantity } } });
                }
                return mv;
            });
            emitToRestaurant(restaurantId, 'inventory.movement.created', result);
            return { success: true, data: result };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // CATEGORIES
    // ═══════════════════════════════════════════════════════
    app.get('/categories', async (request) => {
        const restaurantId = request.restaurantId;
        const categories = await prisma.itemCategory.findMany({
            where: {
                restaurantId,
                OR: [
                    { group: { is: { isKOTEnabled: false } } },
                    { groupId: null, isKOTEnabled: false },
                ],
            },
            include: { group: { select: { id: true, name: true, isKOTEnabled: true } } },
        });
        return { success: true, data: categories };
    });
    app.post('/categories', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({ name: z.string().min(1) });
        try {
            const body = schema.parse(request.body);
            const name = String(body.name).trim();
            if (!name)
                return reply.status(400).send({ success: false, error: 'name is required' });
            const existing = await prisma.itemCategory.findFirst({ where: { restaurantId, name } });
            if (existing)
                return reply.status(400).send({ success: false, error: 'Category with this name already exists' });
            let nonKotGroup = await prisma.itemGroup.findFirst({ where: { restaurantId, isKOTEnabled: false }, orderBy: { sortOrder: 'asc' } });
            if (!nonKotGroup) {
                nonKotGroup = await prisma.itemGroup.create({
                    data: {
                        restaurantId,
                        name: 'Non KOT',
                        description: 'Stock / inventory items',
                        isKOTEnabled: false,
                        sortOrder: 1,
                    },
                });
            }
            const category = await prisma.itemCategory.create({ data: { restaurantId, name, isKOTEnabled: false, groupId: nonKotGroup.id } });
            return { success: true, data: category };
        }
        catch (err) {
            if (err && (err.name === 'ZodError' || err.errors || err.issues))
                return reply.status(400).send({ success: false, error: 'Validation failed', details: err.errors || err.issues || err });
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.put('/categories/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const catId = Number(id);
        if (isNaN(catId))
            return reply.status(400).send({ success: false, error: 'Invalid category id' });
        const { z } = await import('zod');
        const schema = z.object({
            name: z.string().min(1).optional(),
            isActive: z.boolean().optional()
        });
        try {
            const body = schema.parse(request.body);
            const existing = await prisma.itemCategory.findFirst({ where: { id: catId, restaurantId } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'Category not found' });
            
            const updateData = {};
            if (body.name !== undefined) {
                const name = String(body.name).trim();
                if (!name)
                    return reply.status(400).send({ success: false, error: 'name cannot be empty' });
                const duplicate = await prisma.itemCategory.findFirst({ where: { restaurantId, name, NOT: { id: catId } } });
                if (duplicate)
                    return reply.status(400).send({ success: false, error: 'Another category with this name already exists' });
                updateData.name = name;
            }
            if (body.isActive !== undefined) {
                updateData.isActive = body.isActive;
            }
            
            const nonKotGroup = await prisma.itemGroup.findFirst({ where: { restaurantId, isKOTEnabled: false }, orderBy: { sortOrder: 'asc' } });
            const updated = await prisma.itemCategory.update({
                where: { id: catId },
                data: {
                    ...updateData,
                    isKOTEnabled: false,
                    groupId: nonKotGroup?.id ?? undefined
                },
            });
            return { success: true, data: updated };
        }
        catch (err) {
            if (err && (err.name === 'ZodError' || err.errors || err.issues))
                return reply.status(400).send({ success: false, error: 'Validation failed', details: err.errors || err.issues || err });
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/categories/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const catId = Number(id);
        if (isNaN(catId))
            return reply.status(400).send({ success: false, error: 'Invalid category id' });
        try {
            const menuItemExists = await prisma.menuItem.findFirst({ where: { categoryId: catId, restaurantId } });
            if (menuItemExists)
                return reply.status(400).send({ success: false, error: 'Category has menu items and cannot be deleted' });
            const menuCat = await prisma.itemCategory.findFirst({ where: { id: catId, restaurantId } });
            if (menuCat) {
                const invCat = await prisma.inventoryItemCategory.findFirst({ where: { restaurantId, name: menuCat.name } });
                if (invCat) {
                    const invItem = await prisma.inventoryItem.findFirst({ where: { categoryId: invCat.id, restaurantId } });
                    if (invItem)
                        return reply.status(400).send({ success: false, error: 'Category has inventory items and cannot be deleted' });
                    await prisma.inventoryItemCategory.delete({ where: { id: invCat.id } });
                }
            }
            await prisma.itemCategory.delete({ where: { id: catId } });
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // UNITS
    // ═══════════════════════════════════════════════════════
    const defaultUnits = [
        { name: 'Kilogram', symbol: 'kg' },
        { name: 'Gram', symbol: 'g' },
        { name: 'Liter', symbol: 'l' },
        { name: 'Milliliter', symbol: 'ml' },
        { name: 'Piece', symbol: 'pc' },
        { name: 'Box', symbol: 'box' },
        { name: 'Pack', symbol: 'pack' },
    ];
    const ensureDefaultUnits = async (restaurantId) => {
        const existing = await prisma.inventoryUnit.findMany({ where: { restaurantId } });
        const existingNames = new Set(existing.map((u) => String(u.name || '').trim().toLowerCase()));
        const existingSymbols = new Set(existing.map((u) => String(u.symbol || '').trim().toLowerCase()));
        const toCreate = defaultUnits.filter((u) => {
            const name = u.name.trim().toLowerCase();
            const symbol = u.symbol.trim().toLowerCase();
            return !existingNames.has(name) && !existingSymbols.has(symbol);
        });
        if (toCreate.length > 0) {
            await prisma.inventoryUnit.createMany({
                data: toCreate.map((u) => ({ restaurantId, name: u.name, symbol: u.symbol })),
            });
        }
    };
    app.get('/units', async (request) => {
        const restaurantId = request.restaurantId;
        await ensureDefaultUnits(restaurantId);
        const units = await prisma.inventoryUnit.findMany({ where: { restaurantId } });
        return { success: true, data: units };
    });
    app.post('/units', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({ name: z.string().min(1), symbol: z.string().optional() });
        try {
            const body = schema.parse(request.body);
            const unit = await prisma.inventoryUnit.create({ data: { restaurantId, name: body.name, symbol: body.symbol || body.name } });
            return { success: true, data: unit };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.put('/units/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const unitId = Number(id);
        if (isNaN(unitId))
            return reply.status(400).send({ success: false, error: 'Invalid unit id' });
        const { z } = await import('zod');
        const schema = z.object({ name: z.string().min(1), symbol: z.string().optional() });
        try {
            const body = schema.parse(request.body);
            const existing = await prisma.inventoryUnit.findFirst({ where: { id: unitId, restaurantId } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'Unit not found' });
            const updated = await prisma.inventoryUnit.update({ where: { id: unitId }, data: { name: body.name, symbol: body.symbol || body.name } });
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/units/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const unitId = Number(id);
        if (isNaN(unitId))
            return reply.status(400).send({ success: false, error: 'Invalid unit id' });
        try {
            const used = await prisma.inventoryItem.findFirst({ where: { unitId, restaurantId } });
            if (used)
                return reply.status(400).send({ success: false, error: 'Unit is in use by inventory items' });
            await prisma.inventoryUnit.delete({ where: { id: unitId } });
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // SUPPLIERS
    // ═══════════════════════════════════════════════════════
    app.get('/suppliers', async (request) => {
        const restaurantId = request.restaurantId;
        const suppliers = await prisma.supplier.findMany({ where: { restaurantId } });
        const enriched = await Promise.all(suppliers.map(async (s) => {
            const [totalOrders, totalOrderAmountResult] = await Promise.all([
                prisma.purchaseOrder.count({ where: { supplierId: s.id, restaurantId } }),
                prisma.purchaseOrder.aggregate({ where: { supplierId: s.id, restaurantId }, _sum: { total: true } })
            ]);
            return { ...s, totalOrders, totalOrderAmount: Number(totalOrderAmountResult._sum.total || 0) };
        }));
        return { success: true, data: enriched };
    });
    app.post('/suppliers', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({
            name: z.string().min(1, 'name is required'),
            contactPerson: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            address: z.string().optional(),
            creditLimit: z.number().nonnegative().optional(),
            gstNumber: z.string().optional(),
            notes: z.string().optional()
        });
        try {
            const body = schema.parse(request.body);
            const supplier = await prisma.supplier.create({ data: { ...body, restaurantId } });
            return { success: true, data: supplier };
        }
        catch (err) {
            if (err && (err.name === 'ZodError' || err.errors || err.issues))
                return reply.status(400).send({ success: false, error: 'Validation failed', details: err.errors || err.issues });
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.put('/suppliers/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const supplierId = Number(id);
        if (isNaN(supplierId))
            return reply.status(400).send({ success: false, error: 'Invalid supplier id' });
        const { z } = await import('zod');
        const schema = z.object({
            name: z.string().min(1),
            contactPerson: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            address: z.string().optional(),
            creditLimit: z.number().nonnegative().optional(),
            gstNumber: z.string().optional(),
            notes: z.string().optional()
        });
        try {
            const body = schema.parse(request.body);
            const existing = await prisma.supplier.findFirst({ where: { id: supplierId, restaurantId } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'Supplier not found' });
            const updated = await prisma.supplier.update({
                where: { id: supplierId },
                data: {
                    name: body.name,
                    contactPerson: body.contactPerson,
                    email: body.email,
                    phone: body.phone,
                    address: body.address,
                    creditLimit: body.creditLimit,
                    gstNumber: body.gstNumber,
                    notes: body.notes
                }
            });
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/suppliers/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const supplierId = Number(id);
        if (isNaN(supplierId))
            return reply.status(400).send({ success: false, error: 'Invalid supplier id' });
        try {
            const hasPO = await prisma.purchaseOrder.findFirst({ where: { supplierId, restaurantId } });
            const hasMrp = await prisma.inventoryItemMRP.findFirst({ where: { supplierId, inventoryItem: { restaurantId } } });
            if (hasPO || hasMrp)
                return reply.status(400).send({ success: false, error: 'Supplier has associated records and cannot be deleted' });
            await prisma.supplier.delete({ where: { id: supplierId } });
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // SUPPLIER — ITEMS (MRPs assigned to supplier)
    // ═══════════════════════════════════════════════════════
    app.get('/suppliers/:id/items', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const supplierId = Number(request.params.id);
        if (isNaN(supplierId))
            return reply.status(400).send({ success: false, error: 'Invalid supplier id' });
        try {
            const mrps = await prisma.inventoryItemMRP.findMany({
                where: { supplierId, isActive: true, inventoryItem: { restaurantId } },
                include: { inventoryItem: { include: { category: true, unit: true } } },
                orderBy: { createdAt: 'desc' }
            });
            const mapped = mrps.map(computeSellingPrice);
            return { success: true, data: mapped };
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    /**
     * POST /suppliers/:id/items
     *
     * Saves a new MRP entry for this supplier+item.
     *
     * PRICING CONTRACT:
     *   - purchaseRate: cost price paid to supplier (required)
     *   - profitPercent: the FIXED profit margin (required; NEVER auto-changed)
     *   - sellingPrice is COMPUTED: purchaseRate × (1 + profitPercent/100)
     *   - mrp field stores the user-entered MRP (can differ from sellingPrice)
     *     but is NOT used as the POS selling price.
     *
     * ⚠️  DO NOT auto-calculate profitPercent from (mrp - purchaseRate).
     *     profitPercent must come directly from the caller.
     */
    app.post('/suppliers/:id/items', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const supplierId = Number(request.params.id);
        if (isNaN(supplierId))
            return reply.status(400).send({ success: false, error: 'Invalid supplier id' });
        const { z } = await import('zod');
        const schema = z.object({
            inventoryItemId: z.number().int().positive(),
            mrp: z.number().nonnegative(), // printed/max retail price (stored, not used for POS billing)
            purchaseRate: z.number().nonnegative(), // cost price
            profitPercent: z.number().optional() // explicit value only; omitted means inherit latest
        });
        try {
            const body = schema.parse(request.body);
            const inv = await prisma.inventoryItem.findFirst({ where: { id: body.inventoryItemId, restaurantId } });
            if (!inv)
                return reply.status(404).send({ success: false, error: 'Inventory item not found' });
            const sup = await prisma.supplier.findFirst({ where: { id: supplierId, restaurantId } });
            if (!sup)
                return reply.status(404).send({ success: false, error: 'Supplier not found' });
            const profitPercent = await resolveProfitPercent({
                restaurantId,
                inventoryItemId: body.inventoryItemId,
                supplierId,
                profitPercent: body.profitPercent,
            });
            const latestActive = await prisma.inventoryItemMRP.findFirst({
                where: {
                    inventoryItemId: body.inventoryItemId,
                    supplierId,
                    inventoryItem: { restaurantId },
                    isActive: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            if (latestActive &&
                Number(latestActive.purchaseRate) === Number(body.purchaseRate) &&
                Number(latestActive.profitPercent ?? 0) === Number(profitPercent)) {
                return { success: true, data: computeSellingPrice(latestActive) };
            }
            // Historical MRPs are preserved — do NOT deactivate previous records.
            // The POS always shows all active MRPs as options.
            const mrp = await prisma.inventoryItemMRP.create({
                data: {
                    inventoryItemId: body.inventoryItemId,
                    supplierId,
                    mrp: body.mrp,
                    purchaseRate: body.purchaseRate,
                    profitPercent,
                    effectiveFrom: new Date(),
                    isActive: true
                }
            });
            return { success: true, data: computeSellingPrice(mrp) };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/suppliers/:supplierId/items/:itemId', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const supplierId = Number(request.params.supplierId);
        const itemId = Number(request.params.itemId);
        if (isNaN(supplierId) || isNaN(itemId))
            return reply.status(400).send({ success: false, error: 'Invalid id parameters' });
        try {
            await prisma.inventoryItemMRP.updateMany({ where: { supplierId, inventoryItemId: itemId, inventoryItem: { restaurantId } }, data: { isActive: false } });
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // SUPPLIER — OVERVIEW
    // ═══════════════════════════════════════════════════════
    app.get('/suppliers/:id/overview', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const supplierId = Number(request.params.id);
        if (isNaN(supplierId))
            return reply.status(400).send({ success: false, error: 'Invalid supplier id' });
        try {
            const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, restaurantId } });
            if (!supplier)
                return reply.status(404).send({ success: false, error: 'Supplier not found' });
            const mrps = await prisma.inventoryItemMRP.findMany({
                where: { supplierId, inventoryItem: { restaurantId }, isActive: true },
                include: { inventoryItem: { include: { category: true, unit: true } } },
                orderBy: { createdAt: 'desc' }
            });
            const seen = new Set();
            const uniqueMrps = mrps.filter((m) => { if (seen.has(m.inventoryItemId))
                return false; seen.add(m.inventoryItemId); return true; }).map(computeSellingPrice);
            const [purchaseOrders, purchasePayments, supplierPayments, allItems] = await Promise.all([
                prisma.purchaseOrder.findMany({ where: { supplierId, restaurantId }, include: { items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, payments: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
                prisma.purchaseOrderPayment.findMany({ where: { supplierId, restaurantId }, include: { purchaseOrder: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
                prisma.supplierPayment.findMany({ where: { supplierId, restaurantId }, orderBy: { createdAt: 'desc' }, take: 100 }),
                prisma.inventoryItem.findMany({ where: { restaurantId }, include: { category: true, unit: true, inventoryMRPs: { where: { supplierId, isActive: true } } }, take: 200 })
            ]);
            const totalPOAmount = purchaseOrders.reduce((s, p) => s + Number(p.total || 0), 0);
            const totalPaidOnPOs = purchasePayments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const totalSupplierPayments = supplierPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const outstanding = Number(supplier.outstandingBalance || 0);
            const mappedAllItems = (allItems || []).map((it) => ({ ...it, inventoryMRPs: (it.inventoryMRPs || []).map(computeSellingPrice) }));
            return { success: true, data: { supplier, mrps: uniqueMrps, purchaseOrders, purchasePayments, supplierPayments, allItems: mappedAllItems, stats: { totalPOAmount, totalPaidOnPOs, totalSupplierPayments, outstanding, totalOrders: purchaseOrders.length } } };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // MRPS
    // ═══════════════════════════════════════════════════════
    app.get('/mrps', async (request) => {
        const restaurantId = request.restaurantId;
        const mrps = await prisma.inventoryItemMRP.findMany({
            where: { inventoryItem: { restaurantId } },
            include: { inventoryItem: true, supplier: true },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: mrps.map(computeSellingPrice) };
    });
    /**
     * POST /mrps
     *
     * Creates a standalone MRP entry (not linked via supplier item endpoint).
     *
     * PRICING CONTRACT (same as POST /suppliers/:id/items):
     *   - purchaseRate + profitPercent → sellingPrice computed
     *   - mrp is stored as-is (printed retail price reference)
     *   - profitPercent MUST be explicitly provided
     */
    app.post('/mrps', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({
            inventoryItemId: z.number().int().positive(),
            supplierId: z.number().int().positive().optional(),
            mrp: z.number().nonnegative(),
            purchaseRate: z.number().nonnegative(),
            profitPercent: z.number().optional(),
            effectiveFrom: z.string().optional(),
            isActive: z.boolean().optional()
        });
        try {
            const body = schema.parse(request.body);
            const inv = await prisma.inventoryItem.findFirst({ where: { id: body.inventoryItemId, restaurantId } });
            if (!inv)
                return reply.status(404).send({ success: false, error: 'Inventory item not found' });
            const profitPercent = await resolveProfitPercent({
                restaurantId,
                inventoryItemId: body.inventoryItemId,
                supplierId: body.supplierId,
                profitPercent: body.profitPercent,
            });
            const mrp = await prisma.inventoryItemMRP.create({
                data: {
                    inventoryItemId: body.inventoryItemId,
                    supplierId: body.supplierId,
                    mrp: body.mrp,
                    purchaseRate: body.purchaseRate,
                    profitPercent,
                    effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
                    isActive: body.isActive ?? true
                }
            });
            return { success: true, data: computeSellingPrice(mrp) };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    /**
     * PUT /mrps/:id
     *
     * Updates an existing MRP entry. Only purchaseRate and/or profitPercent
     * can be changed. Changing purchaseRate will cause sellingPrice to
     * recalculate (profitPercent stays fixed unless explicitly changed by user).
     */
    app.put('/mrps/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const mrpId = Number(id);
        if (isNaN(mrpId))
            return reply.status(400).send({ success: false, error: 'Invalid MRP id' });
        const { z } = await import('zod');
        const schema = z.object({
            mrp: z.number().nonnegative().optional(),
            purchaseRate: z.number().nonnegative().optional(),
            profitPercent: z.number().optional(), // explicit user edit only
            isActive: z.boolean().optional()
        });
        try {
            const body = schema.parse(request.body);
            const existing = await prisma.inventoryItemMRP.findFirst({ where: { id: mrpId, inventoryItem: { restaurantId } } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'MRP not found' });
            const updateData = {};
            if (body.mrp !== undefined)
                updateData.mrp = body.mrp;
            if (body.purchaseRate !== undefined)
                updateData.purchaseRate = body.purchaseRate;
            // profitPercent only changes if explicitly supplied by user
            if (body.profitPercent !== undefined)
                updateData.profitPercent = body.profitPercent;
            if (body.isActive !== undefined)
                updateData.isActive = body.isActive;
            const updated = await prisma.inventoryItemMRP.update({ where: { id: mrpId }, data: updateData });
            return { success: true, data: computeSellingPrice(updated) };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/mrps/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const mrpId = Number(id);
        if (isNaN(mrpId))
            return reply.status(400).send({ success: false, error: 'Invalid MRP id' });
        try {
            const existing = await prisma.inventoryItemMRP.findFirst({ where: { id: mrpId, inventoryItem: { restaurantId } } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'MRP not found' });
            const upd = await prisma.inventoryItemMRP.update({ where: { id: mrpId }, data: { isActive: false } });
            return { success: true, data: upd };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // PURCHASE ORDERS
    // BUG FIX: /purchase-orders/export MUST be before /purchase-orders/:id
    // ═══════════════════════════════════════════════════════
    app.get('/purchase-orders/export', async (request, reply) => {
        const restaurantId = request.restaurantId;
        try {
            const { startDate, endDate, supplierId } = (request.query || {});
            const where = { restaurantId };
            if (supplierId)
                where.supplierId = Number(supplierId);
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate)
                    where.createdAt.gte = new Date(String(startDate));
                if (endDate)
                    where.createdAt.lte = new Date(String(endDate));
            }
            const orders = await prisma.purchaseOrder.findMany({ where, include: { supplier: true, items: { include: { inventoryItem: true } } }, orderBy: { createdAt: 'desc' } });
            const rows = [['PO#', 'Supplier', 'Order Date', 'Status', 'Items', 'Total']];
            for (const o of orders) {
                rows.push([o.orderNumber, o.supplier?.name || '', o.orderDate ? new Date(o.orderDate).toISOString() : new Date(o.createdAt).toISOString(), o.status, (o.items || []).map((it) => `${it.inventoryItem?.name || it.inventoryItemId} x ${it.quantity}`).join('; '), String(o.total || 0)]);
            }
            const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
            reply.header('Content-Type', 'text/csv');
            reply.header('Content-Disposition', 'attachment; filename="purchase_orders.csv"');
            return csv;
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.get('/purchase-orders', async (request) => {
        const restaurantId = request.restaurantId;
        const supplierId = request.query?.supplierId ? Number(request.query.supplierId) : undefined;
        const status = request.query?.status;
        const where = { restaurantId };
        if (supplierId)
            where.supplierId = supplierId;
        if (status)
            where.status = status;
        const orders = await prisma.purchaseOrder.findMany({ where, include: { supplier: true, items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, payments: true }, orderBy: { createdAt: 'desc' } });
        const enriched = orders.map((o) => ({ ...o, totalPaid: o.payments.reduce((s, p) => s + Number(p.amount || 0), 0) }));
        return { success: true, data: enriched };
    });
    // ═══════════════════════════════════════════════════════
    // CREATE PURCHASE ORDER + AUTO-RECEIVE + PAYMENT (one-shot)
    //
    // PRICING CONTRACT:
    //   - Each item must supply purchaseRate + profitPercent.
    //   - sellingPrice = purchaseRate × (1 + profitPercent/100) is computed.
    //   - mrp is stored as printed max-retail price reference.
    //   - profitPercent is NEVER auto-computed or modified here.
    // ═══════════════════════════════════════════════════════
    app.post('/purchase-orders', async (request, reply) => {
        const restaurantId = request.restaurantId;
        try {
            const { z } = await import('zod');
            const numberFromString = (value) => {
                if (typeof value === 'string' && value.trim() !== '')
                    return Number(value);
                return value;
            };
            const schema = z.object({
                supplierId: z.preprocess(numberFromString, z.number().int().positive()),
                items: z.preprocess((value) => Array.isArray(value) ? value : [], z.array(z.object({
                    inventoryItemId: z.preprocess(numberFromString, z.number().int().positive()),
                    quantity: z.preprocess(numberFromString, z.number().positive()),
                    unitCost: z.preprocess(numberFromString, z.number().nonnegative()),
                    mrp: z.preprocess(numberFromString, z.number().nonnegative().optional()),
                    profitPercent: z.preprocess(numberFromString, z.number().optional()), // caller supplies; NOT auto-computed
                    inventoryItemMRPId: z.preprocess(numberFromString, z.number().int().positive().optional()),
                    taxPercent: z.preprocess(numberFromString, z.number().nonnegative().optional()),
                    discountPercent: z.preprocess(numberFromString, z.number().nonnegative().optional()),
                    purchaseRate: z.preprocess(numberFromString, z.number().nonnegative().optional())
                })).min(1)),
                orderDate: z.string().optional(),
                expectedDate: z.string().optional(),
                note: z.string().optional(),
                paidAmount: z.preprocess(numberFromString, z.number().nonnegative().optional()),
                paymentMethod: z.string().optional(),
                paymentReference: z.string().optional(),
                paymentNotes: z.string().optional(),
                autoReceive: z.preprocess((value) => typeof value === 'string' ? value === 'true' : value, z.boolean().optional()),
                currency: z.string().optional(),
                exchangeRate: z.preprocess(numberFromString, z.number().nonnegative().optional())
            }).passthrough();
            const body = schema.parse(request.body);
            const supplier = await prisma.supplier.findFirst({ where: { id: body.supplierId, restaurantId } });
            if (!supplier)
                return reply.status(404).send({ success: false, error: 'Supplier not found' });
            const autoReceive = body.autoReceive !== false;
            const paidAmount = Number(body.paidAmount ?? 0);
            let createdPO;
            let createdPayment = null;
            await prisma.$transaction(async (tx) => {
                const poItemCreates = [];
                for (const it of body.items) {
                    let mrpId = it.inventoryItemMRPId ?? null;
                    if (!mrpId) {
                        const profitPct = await resolveProfitPercent({
                            restaurantId,
                            inventoryItemId: it.inventoryItemId,
                            supplierId: body.supplierId,
                            profitPercent: it.profitPercent,
                        });
                        const storedMrp = it.mrp !== undefined ? Number(it.mrp) : Number(it.unitCost); // mrp = printed max retail; may differ from selling price
                        const newMRP = await tx.inventoryItemMRP.create({
                            data: {
                                inventoryItemId: it.inventoryItemId,
                                supplierId: body.supplierId,
                                mrp: storedMrp,
                                purchaseRate: it.unitCost,
                                profitPercent: profitPct,
                                effectiveFrom: new Date(),
                                isActive: true
                            }
                        });
                        mrpId = newMRP.id;
                    }
                    const itemSubtotal = Number(it.unitCost) * Number(it.quantity);
                    const discAmt = itemSubtotal * (Number(it.discountPercent ?? 0) / 100);
                    const afterDisc = itemSubtotal - discAmt;
                    const gstAmt = afterDisc * (Number(it.taxPercent ?? 0) / 100);
                    const itemTotal = afterDisc + gstAmt;
                    poItemCreates.push({
                        inventoryItemId: it.inventoryItemId,
                        quantity: it.quantity,
                        unitCost: it.unitCost,
                        total: itemTotal,
                        inventoryItemMRPId: mrpId ?? undefined,
                        taxPercent: it.taxPercent ?? 0,
                        discountPercent: it.discountPercent ?? 0
                    });
                }
                const poTotal = poItemCreates.reduce((s, it) => s + Number(it.total || 0), 0);
                let parsedOrderDate;
                if (body.orderDate) {
                    const d = new Date(body.orderDate);
                    parsedOrderDate = isNaN(d.getTime()) ? undefined : d;
                }
                let parsedExpectedDate;
                if (body.expectedDate) {
                    const d = new Date(body.expectedDate);
                    parsedExpectedDate = isNaN(d.getTime()) ? undefined : d;
                }
                const poData = {
                    restaurantId, supplierId: body.supplierId,
                    orderNumber: `PO-${Date.now()}`,
                    status: autoReceive ? 'received' : 'pending',
                    total: poTotal, orderDate: parsedOrderDate, expectedDate: parsedExpectedDate,
                    note: body.note, receivedAt: autoReceive ? new Date() : undefined,
                    items: { create: poItemCreates }
                };
                createdPO = await tx.purchaseOrder.create({ data: poData, include: { items: true } });
                if (autoReceive) {
                    for (const it of body.items) {
                        await tx.inventoryMovement.create({ data: { restaurantId, itemId: it.inventoryItemId, type: 'purchase', quantity: it.quantity, note: `PO #${createdPO.orderNumber}`, referenceId: createdPO.id } });
                        await tx.inventoryItem.update({ where: { id: it.inventoryItemId }, data: { currentStock: { increment: it.quantity } } });
                    }
                }
                const netIncrease = poTotal - paidAmount;
                try {
                    await tx.supplier.update({ where: { id: body.supplierId }, data: { outstandingBalance: { increment: netIncrease } } });
                }
                catch (_) { }
                if (paidAmount > 0) {
                    createdPayment = await tx.purchaseOrderPayment.create({
                        data: {
                            restaurantId, purchaseOrderId: createdPO.id, supplierId: body.supplierId,
                            amount: paidAmount, method: body.paymentMethod || 'Cash',
                            reference: body.paymentReference, notes: body.paymentNotes,
                            paymentDate: parsedOrderDate ?? new Date()
                        }
                    });
                }
            });
            const fullPO = await prisma.purchaseOrder.findUnique({
                where: { id: createdPO.id },
                include: { items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, supplier: true, payments: true }
            });
            try {
                if (fullPO) {
                    emitToRestaurant(restaurantId, 'purchaseOrder.created', { purchaseOrder: fullPO, stockUpdated: autoReceive });
                    if (createdPayment)
                        emitToRestaurant(restaurantId, 'purchaseOrder.payment', { purchaseOrderId: fullPO.id, payment: createdPayment });
                    try {
                        const updatedSupplier = await prisma.supplier.findUnique({ where: { id: body.supplierId } });
                        if (updatedSupplier)
                            emitToRestaurant(restaurantId, 'supplier.updated', updatedSupplier);
                    }
                    catch (e) { }
                    for (const it of (fullPO?.items || [])) {
                        try {
                            const item = await prisma.inventoryItem.findUnique({ where: { id: it.inventoryItemId } });
                            if (item)
                                emitToRestaurant(restaurantId, 'inventory.item.updated', { itemId: item.id, currentStock: item.currentStock });
                        }
                        catch (e) { }
                    }
                }
            }
            catch (e) { }
            return { success: true, data: { purchaseOrder: fullPO, payment: createdPayment, stockUpdated: autoReceive } };
        }
        catch (err) {
            if (err && (err.name === 'ZodError' || err.errors || err.issues))
                return reply.status(400).send({ success: false, error: 'Validation failed', details: err.errors || err.issues || err });
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // PURCHASE ORDER — single fetch, payments, receive
    // ═══════════════════════════════════════════════════════
    app.get('/purchase-orders/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const poId = Number(id);
        if (isNaN(poId))
            return reply.status(400).send({ success: false, error: 'Invalid PO id' });
        const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, restaurantId }, include: { supplier: true, items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, payments: true } });
        if (!po)
            return reply.status(404).send({ success: false, error: 'Purchase order not found' });
        const totalPaid = po.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        return { success: true, data: { ...po, totalPaid, balance: Number(po.total) - totalPaid } };
    });
    app.post('/purchase-orders/:id/receive', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const poId = Number(id);
        if (isNaN(poId))
            return reply.status(400).send({ success: false, error: 'Invalid purchase order id' });
        const { z } = await import('zod');
        const schema = z.object({ receivedAt: z.string().optional() });
        try {
            const body = schema.parse(request.body);
            const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, restaurantId }, include: { items: true } });
            if (!po)
                return reply.status(404).send({ success: false, error: 'Purchase order not found' });
            if (po.status === 'received') {
                const existing = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, supplier: true, payments: true } });
                return { success: true, data: existing, message: 'Purchase order already received' };
            }
            let parsedReceivedAt = new Date();
            if (body.receivedAt) {
                const d = new Date(body.receivedAt);
                if (!isNaN(d.getTime()))
                    parsedReceivedAt = d;
            }
            await prisma.$transaction(async (tx) => {
                for (const it of po.items) {
                    await tx.inventoryMovement.create({ data: { restaurantId, itemId: it.inventoryItemId, type: 'purchase', quantity: it.quantity, note: `PO #${po.orderNumber}`, referenceId: po.id } });
                    await tx.inventoryItem.update({ where: { id: it.inventoryItemId }, data: { currentStock: { increment: it.quantity } } });
                }
                await tx.purchaseOrder.update({ where: { id: poId }, data: { status: 'received', receivedAt: parsedReceivedAt } });
            });
            const updated = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, supplier: true, payments: true } });
            try {
                emitToRestaurant(restaurantId, 'purchaseOrder.received', updated);
                for (const it of (updated?.items || [])) {
                    try {
                        const item = await prisma.inventoryItem.findUnique({ where: { id: it.inventoryItemId } });
                        if (item)
                            emitToRestaurant(restaurantId, 'inventory.item.updated', { itemId: item.id, currentStock: item.currentStock });
                    }
                    catch (e) { }
                }
            }
            catch (e) { }
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // PURCHASE ORDER PAYMENTS
    // ═══════════════════════════════════════════════════════
    app.get('/purchase-orders/:id/payments', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const poId = Number(id);
        if (isNaN(poId))
            return reply.status(400).send({ success: false, error: 'Invalid PO id' });
        try {
            const payments = await prisma.purchaseOrderPayment.findMany({ where: { purchaseOrderId: poId, restaurantId }, orderBy: { createdAt: 'desc' } });
            return { success: true, data: payments };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.post('/purchase-orders/:id/payments', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const poId = Number(id);
        if (isNaN(poId))
            return reply.status(400).send({ success: false, error: 'Invalid PO id' });
        const { z } = await import('zod');
        const schema = z.object({ amount: z.number().positive(), method: z.string().optional(), reference: z.string().optional(), notes: z.string().optional(), paymentDate: z.string().optional(), supplierId: z.number().int().positive().optional() });
        try {
            const body = schema.parse(request.body);
            const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, restaurantId } });
            if (!po)
                return reply.status(404).send({ success: false, error: 'Purchase order not found' });
            let parsedPaymentDate = new Date();
            if (body.paymentDate) {
                const d = new Date(body.paymentDate);
                if (!isNaN(d.getTime()))
                    parsedPaymentDate = d;
            }
            const payment = await prisma.purchaseOrderPayment.create({
                data: { restaurantId, purchaseOrderId: po.id, supplierId: body.supplierId ?? po.supplierId, amount: body.amount, method: body.method || 'Cash', reference: body.reference, notes: body.notes, paymentDate: parsedPaymentDate }
            });
            try {
                const supId = body.supplierId ?? po.supplierId;
                if (supId) {
                    await prisma.supplier.update({ where: { id: supId }, data: { outstandingBalance: { decrement: body.amount } } });
                    try {
                        const updatedSupplier = await prisma.supplier.findUnique({ where: { id: supId } });
                        if (updatedSupplier)
                            emitToRestaurant(restaurantId, 'supplier.updated', updatedSupplier);
                    }
                    catch (e) { }
                }
            }
            catch (_) { }
            try {
                emitToRestaurant(restaurantId, 'purchaseOrder.payment', { purchaseOrderId: po.id, payment });
            }
            catch (e) { }
            return { success: true, data: payment };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // PAYMENT HISTORY for a supplier
    // ═══════════════════════════════════════════════════════
    app.get('/suppliers/:id/payment-history', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const supplierId = Number(request.params.id);
        if (isNaN(supplierId))
            return reply.status(400).send({ success: false, error: 'Invalid supplier id' });
        try {
            const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, restaurantId } });
            if (!supplier)
                return reply.status(404).send({ success: false, error: 'Supplier not found' });
            const [purchaseOrders, supplierPayments] = await Promise.all([
                prisma.purchaseOrder.findMany({ where: { supplierId, restaurantId }, include: { items: { include: { inventoryItem: { include: { unit: true } }, inventoryItemMRP: true } }, payments: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
                prisma.supplierPayment.findMany({ where: { supplierId, restaurantId }, orderBy: { createdAt: 'desc' } })
            ]);
            const enrichedPOs = purchaseOrders.map((po) => {
                const totalPaid = po.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
                const balance = Number(po.total || 0) - totalPaid;
                return { ...po, totalPaid, balance };
            });
            return { success: true, data: { supplier, purchaseOrders: enrichedPOs, supplierPayments, outstandingBalance: Number(supplier.outstandingBalance || 0) } };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // ═══════════════════════════════════════════════════════
    // RECIPES & MOVEMENTS
    // ═══════════════════════════════════════════════════════
    app.get('/recipes', async (request) => {
        const restaurantId = request.restaurantId;
        const recipes = await prisma.recipe.findMany({ where: { restaurantId }, include: { ingredients: { include: { inventoryItem: true } } } });
        return { success: true, data: recipes };
    });
    app.get('/movements', async (request) => {
        const restaurantId = request.restaurantId;
        const movements = await prisma.inventoryMovement.findMany({ where: { restaurantId }, include: { item: true }, orderBy: { createdAt: 'desc' } });
        return { success: true, data: movements };
    });

    // ═══════════════════════════════════════════════════════
    // PHASE 2: GOODS RECEIVED NOTE (GRN) & MULTI-TYPE LEDGER
    // ═══════════════════════════════════════════════════════
    app.post('/purchase-orders/:id/grn', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const poId = Number(request.params.id);
        if (isNaN(poId)) return reply.status(400).send({ success: false, error: 'Invalid PO id' });

        const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, restaurantId }, include: { items: true, supplier: true } });
        if (!po) return reply.status(404).send({ success: false, error: 'Purchase Order not found' });
        if (po.status === 'received') {
            return reply.status(400).send({ success: false, error: 'PO has already been received' });
        }

        const grnNumber = `GRN-${Date.now()}`;
        const receivedItems = request.body?.items || po.items.map(i => ({ inventoryItemId: i.inventoryItemId, quantity: Number(i.quantity) }));

        await prisma.$transaction(async (tx) => {
            for (const rItem of receivedItems) {
                const qty = Number(rItem.quantity || 0);
                if (qty > 0) {
                    await tx.inventoryMovement.create({
                        data: {
                            restaurantId,
                            itemId: Number(rItem.inventoryItemId),
                            type: 'purchase_receiving',
                            quantity: qty,
                            note: `GRN #${grnNumber} for PO #${po.orderNumber}`,
                            referenceId: po.id
                        }
                    });
                    await tx.inventoryItem.update({
                        where: { id: Number(rItem.inventoryItemId) },
                        data: { currentStock: { increment: qty } }
                    });
                }
            }
            await tx.purchaseOrder.update({
                where: { id: po.id },
                data: { status: 'received', receivedAt: new Date() }
            });
        });

        const updatedPo = await prisma.purchaseOrder.findUnique({
            where: { id: po.id },
            include: { items: { include: { inventoryItem: true } }, supplier: true }
        });

        emitToRestaurant(restaurantId, 'grn_created', { grnNumber, purchaseOrder: updatedPo });
        return { success: true, data: { grnNumber, purchaseOrder: updatedPo } };
    });

    app.post('/movements/ledger', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { itemId, type, quantity, note, referenceId } = request.body || {};

        const validTypes = ['purchase_receiving', 'sales_deduction', 'manual_adjustment', 'wastage', 'expiry', 'damaged', 'stock_transfer'];
        if (!itemId || !type || !validTypes.includes(type) || !quantity || Number(quantity) <= 0) {
            return reply.status(400).send({ success: false, error: 'Valid itemId, type, and positive quantity are required' });
        }

        const item = await prisma.inventoryItem.findFirst({ where: { id: Number(itemId), restaurantId } });
        if (!item) return reply.status(404).send({ success: false, error: 'Inventory Item not found' });

        const isIncrement = ['purchase_receiving', 'manual_adjustment'].includes(type);
        const qty = Number(quantity);

        if (!isIncrement && Number(item.currentStock) < qty) {
            return reply.status(400).send({ success: false, error: `Insufficient stock. Current: ${item.currentStock}` });
        }

        const movement = await prisma.$transaction(async (tx) => {
            const mv = await tx.inventoryMovement.create({
                data: {
                    restaurantId,
                    itemId: item.id,
                    type,
                    quantity: qty,
                    note: note || `Ledger entry: ${type}`,
                    referenceId: referenceId ? Number(referenceId) : undefined
                }
            });
            await tx.inventoryItem.update({
                where: { id: item.id },
                data: { currentStock: isIncrement ? { increment: qty } : { decrement: qty } }
            });
            return mv;
        });

        const updatedItem = await prisma.inventoryItem.findUnique({ where: { id: item.id } });
        emitToRestaurant(restaurantId, 'inventory.movement.created', movement);
        return { success: true, data: { movement, currentStock: updatedItem?.currentStock } };
    });

    app.get('/movements/wastage', async (request) => {
        const restaurantId = request.restaurantId;
        const wastageMovements = await prisma.inventoryMovement.findMany({
            where: {
                restaurantId,
                type: { in: ['wastage', 'expiry', 'damaged'] }
            },
            include: { item: true },
            orderBy: { createdAt: 'desc' }
        });
        return { success: true, data: wastageMovements };
    });
    // ═══════════════════════════════════════════════════════
    // DASHBOARD SUMMARY
    // ═══════════════════════════════════════════════════════
    app.get('/summary', async (request) => {
        const restaurantId = request.restaurantId;
        // Fetch all items
        const all = await prisma.inventoryItem.findMany({
            where: { restaurantId },
            include: {
                unit: true,
                category: true
            }
        });
        // Calculate low stock with proper client-side filter
        const low = all.filter((it) => {
            const current = Number(it.currentStock || 0);
            const threshold = Number(it.thresholdQty || 0);
            return current <= threshold && threshold > 0;
        }).slice(0, 8); // Limit to top 8 for dashboard
        // Sort by urgency (lowest % first)
        const lowSorted = low.sort((a, b) => {
            const pctA = Number(a.thresholdQty || 1) > 0 ? Number(a.currentStock || 0) / Number(a.thresholdQty || 1) : 1;
            const pctB = Number(b.thresholdQty || 1) > 0 ? Number(b.currentStock || 0) / Number(b.thresholdQty || 1) : 1;
            return pctA - pctB;
        });
        const totalValue = all.reduce((s, it) => s + Number(it.currentStock || 0) * Number(it.costPerUnit || 0), 0);
        // Compute menu item impact based on recipe ingredients so the dashboard
        // can surface menu-level warnings (e.g. when a recipe cannot be prepared
        // due to low raw-material stock). Wrap in try/catch so missing DB columns
        // (e.g. during schema migration) do not cause a 500 response.
        let menuImpact = [];
        let lowMenuItems = [];
        let lowMenuCount = 0;
        let packVariantLowStock = [];
        try {
            const menuItems = await prisma.menuItem.findMany({
                where: { restaurantId, isDeleted: false },
                include: { recipeIngredients: { include: { inventoryItem: { include: { unit: true } } } } }
            });
            menuImpact = menuItems.map((mi) => {
                const ingredients = (mi.recipeIngredients || []).map((ing) => ({
                    id: ing.inventoryItemId,
                    name: ing.inventoryItem?.name,
                    currentStock: Number(ing.inventoryItem?.currentStock ?? 0),
                    thresholdQty: Number(ing.inventoryItem?.thresholdQty ?? 0),
                    requiredQty: Number(ing.quantity ?? 0),
                    unit: ing.inventoryItem?.unit?.symbol || ''
                }));
                let availableServings = Number.POSITIVE_INFINITY;
                for (const ing of ingredients) {
                    if (!ing.requiredQty || ing.requiredQty <= 0) {
                        availableServings = 0;
                        break;
                    }
                    const servings = Math.floor(ing.currentStock / ing.requiredQty);
                    availableServings = Math.min(availableServings, servings);
                }
                if (availableServings === Number.POSITIVE_INFINITY)
                    availableServings = 0;
                const isLow = availableServings <= 0;
                // Respect per-menu stock warning threshold when provided, otherwise use default buffer
                const threshold = (typeof mi.stockWarningThreshold === 'number' && mi.stockWarningThreshold >= 0) ? Number(mi.stockWarningThreshold) : 2;
                const isLowSoon = availableServings <= threshold;
                return {
                    id: mi.id,
                    name: mi.name,
                    availableServings,
                    isLow,
                    isLowSoon,
                    ingredients
                };
            });
            lowMenuItems = menuImpact.filter((m) => m.isLow || m.isLowSoon).slice(0, 8);
            lowMenuCount = menuImpact.filter((m) => m.isLow || m.isLowSoon).length;
            // Pack variant warnings for non-KOT items with packOptions.
            // Variants are mapped to inventory item names: "<Menu Item Name> - <Pack Label>".
            const inventoryByName = new Map((all || []).map((it) => [String(it.name || '').trim().toLowerCase(), it]));
            const lowVariantRows = [];
            for (const mi of menuItems) {
                if (!mi.enablePackOptions || !Array.isArray(mi.packOptions))
                    continue;
                for (let i = 0; i < mi.packOptions.length; i++) {
                    const p = mi.packOptions[i] || {};
                    const label = String(p.label || '').trim() || (i === 0 ? 'Main' : `Pack ${i}`);
                    const invName = `${mi.name} - ${label}`;
                    const inv = inventoryByName.get(invName.trim().toLowerCase());
                    if (!inv)
                        continue;
                    const current = Number(inv.currentStock || 0);
                    const thresholdFromPack = Number(p.stockWarningThreshold ?? NaN);
                    const threshold = Number.isFinite(thresholdFromPack) && thresholdFromPack >= 0
                        ? thresholdFromPack
                        : Number(inv.thresholdQty || 0);
                    if (threshold > 0 && current <= threshold) {
                        lowVariantRows.push({
                            menuItemId: mi.id,
                            menuItemName: mi.name,
                            packLabel: label,
                            inventoryItemId: inv.id,
                            inventoryItemName: inv.name,
                            currentStock: current,
                            threshold,
                            unit: inv.unit?.symbol || inv.unit?.name || '',
                        });
                    }
                }
            }
            packVariantLowStock = lowVariantRows.slice(0, 12);
        }
        catch (err) {
            // Likely a schema mismatch (missing column) — log and continue with empty menu impact
            app.log.warn({ err }, 'Skipping menu-impact calculation (possibly missing DB column)');
            menuImpact = [];
            lowMenuItems = [];
            lowMenuCount = 0;
            packVariantLowStock = [];
        }
        return { success: true, data: {
                totalItems: all.length,
                lowStockCount: low.length,
                lowStock: lowSorted,
                totalInventoryValue: totalValue,
                menuImpactSummary: { total: menuImpact.length, lowMenuCount, lowMenuItems },
                packVariantLowStock,
            } };
    });
    // ═══════════════════════════════════════════════════════
    // EXPORT & BULK UPLOAD
    // BUG FIX: /export MUST be before any /:id routes
    // ═══════════════════════════════════════════════════════
    app.get('/export', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const format = (request.query?.format || 'csv').toLowerCase();
        const items = await prisma.inventoryItem.findMany({ where: { restaurantId }, include: { category: true, unit: true } });
        if (format === 'json') {
            reply.header('Content-Type', 'application/json');
            reply.header('Content-Disposition', 'attachment; filename="inventory.json"');
            return reply.send(items);
        }
        if (format === 'csv') {
            const header = ['id', 'name', 'category', 'unit', 'currentStock', 'thresholdQty', 'costPerUnit'].join(',') + '\n';
            const rows = items.map((it) => {
                const name = String(it.name || '').replace(/"/g, '""');
                const category = it.category?.name ? String(it.category.name).replace(/"/g, '""') : '';
                const unit = it.unit?.symbol || it.unit?.name || '';
                return `${it.id},"${name}","${category}","${unit}",${it.currentStock},${it.thresholdQty},${it.costPerUnit}`;
            }).join('\n');
            reply.header('Content-Type', 'text/csv; charset=utf-8');
            reply.header('Content-Disposition', 'attachment; filename="inventory.csv"');
            return reply.send(header + rows);
        }
        if (format === 'xlsx') {
            try {
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet('Inventory');
                sheet.addRow(['ID', 'Name', 'Category', 'Unit', 'Current Stock', 'Threshold', 'Cost Per Unit']);
                for (const it of items) {
                    sheet.addRow([it.id, it.name, it.category?.name || '', it.unit?.symbol || it.unit?.name || '', Number(it.currentStock), Number(it.thresholdQty), Number(it.costPerUnit)]);
                }
                const buf = await workbook.xlsx.writeBuffer();
                reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                reply.header('Content-Disposition', 'attachment; filename="inventory.xlsx"');
                return reply.send(Buffer.from(buf));
            }
            catch (err) {
                return reply.status(500).send({ success: false, error: 'Failed to generate xlsx: ' + (err?.message || String(err)) });
            }
        }
        return reply.status(400).send({ success: false, error: 'Unsupported format. Use csv, json, or xlsx.' });
    });
    app.post('/bulk-upload', async (request, reply) => {
        const restaurantId = request.restaurantId;
        try {
            if (!request.isMultipart || !request.isMultipart())
                return reply.status(400).send({ success: false, error: 'Expected multipart/form-data' });
            const data = await request.file();
            if (!data)
                return reply.status(400).send({ success: false, error: 'No file uploaded' });
            const filename = data.filename || '';
            const chunks = [];
            for await (const chunk of data.file)
                chunks.push(chunk);
            const buf = Buffer.concat(chunks);
            const ext = (filename.split('.').pop() || '').toLowerCase();
            const rows = [];
            const splitCSV = (line) => {
                const out = [];
                let cur = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const ch = line[i];
                    if (ch === '"') {
                        if (inQuotes && line[i + 1] === '"') {
                            cur += '"';
                            i++;
                        }
                        else
                            inQuotes = !inQuotes;
                    }
                    else if (ch === ',' && !inQuotes) {
                        out.push(cur);
                        cur = '';
                    }
                    else {
                        cur += ch;
                    }
                }
                out.push(cur);
                return out.map(s => s.trim().replace(/^"|"$/g, ''));
            };
            if (ext === 'xlsx' || ext === 'xls') {
                const ExcelJS = await import('exceljs');
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buf);
                const worksheet = workbook.worksheets[0];
                if (!worksheet)
                    return reply.status(400).send({ success: false, error: 'No worksheet found' });
                const extractValues = (val) => { if (!val)
                    return []; if (typeof val === 'function') {
                    try {
                        return val();
                    }
                    catch {
                        return [];
                    }
                } if (Array.isArray(val))
                    return val; return []; };
                const headerRow = worksheet.getRow(1);
                const header = extractValues(headerRow.values).slice(1).map((v) => String(v || '').trim().toLowerCase());
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => { if (rowNumber === 1)
                    return; const vals = extractValues(row.values).slice(1); const obj = {}; for (let i = 0; i < header.length; i++)
                    obj[header[i]] = vals[i] ?? ''; rows.push(obj); });
            }
            else {
                const s = buf.toString('utf8');
                const lines = s.split(/\r?\n/).filter((l) => l.trim() !== '');
                if (lines.length === 0)
                    return reply.status(400).send({ success: false, error: 'CSV is empty' });
                const header = splitCSV(lines[0]).map(h => String(h || '').trim().toLowerCase());
                for (let i = 1; i < lines.length; i++) {
                    const values = splitCSV(lines[i]);
                    if (values.every(v => v === ''))
                        continue;
                    const obj = {};
                    for (let j = 0; j < header.length; j++)
                        obj[header[j]] = values[j] ?? '';
                    rows.push(obj);
                }
            }
            const results = { created: 0, updated: 0, errors: [] };
            const getAutoImage = (itemName) => {
                const q = encodeURIComponent(String(itemName || 'food').trim() || 'food');
                const lock = Math.abs(String(itemName || 'food').split('').reduce((s, ch) => s + ch.charCodeAt(0), 0));
                return `https://loremflickr.com/600/600/${q}?lock=${lock}`;
            };
            const nonKotGroup = await prisma.itemGroup.findFirst({ where: { restaurantId, isKOTEnabled: false }, orderBy: { sortOrder: 'asc' } });
            for (let idx = 0; idx < rows.length; idx++) {
                const r = rows[idx];
                try {
                    const name = String(r.name || r['item name'] || r.item || r.title || '').trim();
                    if (!name) {
                        results.errors.push({ row: idx + 2, error: 'Missing name' });
                        continue;
                    }
                    const categoryName = String(r.category || r['category name'] || 'Uncategorized').trim();
                    const groupName = String(r.group || r['group name'] || '').trim();
                    const unitSymbol = String(r.unit || r['unit symbol'] || r.unit_symbol || 'pcs').trim();
                    const thresholdQty = Number(r.threshold || r.thresholdqty || r['threshold qty'] || 0) || 0;
                    const currentStock = Number(r.currentstock || r.stock || r['current stock'] || 0) || 0;
                    const costPerUnit = Number(r.cost || r.costperunit || 0) || 0;
                    const sku = String(r.sku || '').trim() || null;
                    const barcode = String(r.barcode || '').trim() || null;
                    const imageRaw = String(r.image || r.imageurl || r['image url'] || '').trim();
                    const image = imageRaw || getAutoImage(name);
                    // Create/align menu category under selected manual group when possible.
                    if (categoryName) {
                        let targetGroup = nonKotGroup;
                        if (groupName) {
                            const manualGroup = await prisma.itemGroup.findFirst({ where: { restaurantId, name: groupName } });
                            if (manualGroup)
                                targetGroup = manualGroup;
                        }
                        let menuCategory = await prisma.itemCategory.findFirst({ where: { restaurantId, name: categoryName } });
                        if (!menuCategory) {
                            menuCategory = await prisma.itemCategory.create({
                                data: {
                                    restaurantId,
                                    name: categoryName,
                                    groupId: targetGroup?.id,
                                    isKOTEnabled: targetGroup ? Boolean(targetGroup.isKOTEnabled) : false,
                                },
                            });
                        }
                    }
                    let category = await prisma.inventoryItemCategory.findFirst({ where: { restaurantId, name: categoryName } });
                    if (!category)
                        category = await prisma.inventoryItemCategory.create({ data: { restaurantId, name: categoryName } });
                    let unit = await prisma.inventoryUnit.findFirst({ where: { restaurantId, OR: [{ name: unitSymbol }, { symbol: unitSymbol }] } });
                    if (!unit)
                        unit = await prisma.inventoryUnit.create({ data: { restaurantId, name: unitSymbol, symbol: unitSymbol } });
                    
                    let finalSku = sku;
                    if (sku) {
                        const globalItem = await prisma.inventoryItem.findFirst({
                            where: { sku }
                        });
                        if (globalItem && globalItem.restaurantId !== restaurantId) {
                            finalSku = `${sku}-${restaurantId}`;
                        }
                    }

                    let finalBarcode = barcode;
                    if (barcode) {
                        const globalItem = await prisma.inventoryItem.findFirst({
                            where: { barcode }
                        });
                        if (globalItem && globalItem.restaurantId !== restaurantId) {
                            finalBarcode = `${barcode}-${restaurantId}`;
                        }
                    }

                    const existing = await prisma.inventoryItem.findFirst({ where: { restaurantId, OR: [{ name }, ...(finalSku ? [{ sku: finalSku }] : []), ...(finalBarcode ? [{ barcode: finalBarcode }] : [])] } });
                    if (existing) {
                        await prisma.inventoryItem.update({ where: { id: existing.id }, data: { categoryId: category.id, unitId: unit.id, thresholdQty, currentStock, costPerUnit, sku: finalSku ?? undefined, barcode: finalBarcode ?? undefined, image: image ?? undefined } });
                        results.updated++;
                    }
                    else {
                        await prisma.inventoryItem.create({ data: { restaurantId, name, categoryId: category.id, unitId: unit.id, thresholdQty, currentStock, costPerUnit, sku: finalSku ?? undefined, barcode: finalBarcode ?? undefined, image: image ?? undefined } });
                        results.created++;
                    }
                }
                catch (err) {
                    results.errors.push({ row: idx + 2, error: err?.message || String(err) });
                }
            }
            return { success: true, data: results };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
}
