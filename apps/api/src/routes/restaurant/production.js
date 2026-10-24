import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { authorize } from '../../middleware/authorize.js';
import { emitToRestaurant } from '../../plugins/socket.js';

export async function productionRoutes(app) {
    app.addHook('onRequest', authenticate);
    app.addHook('onRequest', tenantScope);

    // Helper to generate a unique batch number
    function generateBatchNumber() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `PRD-${dateStr}-${rand}`;
    }

    // Helper to generate a unique transfer number
    function generateTransferNumber() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `TRF-${dateStr}-${rand}`;
    }

    // ═══════════════════════════════════════════════════════
    // 1. RECIPES (BOM - BILL OF MATERIALS)
    // ═══════════════════════════════════════════════════════
    
    // Get all production recipes
    app.get('/recipes', { preHandler: authorize(['admin', 'warehouse']) }, async (request, reply) => {
        const restaurantId = request.restaurantId;
        try {
            const recipes = await prisma.productionRecipe.findMany({
                where: { restaurantId },
                include: {
                    unit: true,
                    inventoryItem: {
                        select: { id: true, name: true, sku: true, barcode: true, costPerUnit: true }
                    },
                    ingredients: {
                        include: {
                            inventoryItem: {
                                select: { id: true, name: true, sku: true, unit: true, costPerUnit: true }
                            }
                        }
                    }
                },
                orderBy: { name: 'asc' }
            });
            return { success: true, data: recipes };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Create a new recipe
    app.post('/recipes', { preHandler: authorize(['admin', 'warehouse']) }, async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { name, description, targetQuantity, unitId, inventoryItemId, ingredients } = request.body;

        if (!name || !targetQuantity || !unitId || !inventoryItemId) {
            return reply.status(400).send({ success: false, error: 'name, targetQuantity, unitId, and inventoryItemId are required' });
        }

        try {
            const recipe = await prisma.$transaction(async (tx) => {
                const newRecipe = await tx.productionRecipe.create({
                    data: {
                        restaurantId,
                        inventoryItemId: Number(inventoryItemId),
                        name: name.trim(),
                        description: description || null,
                        targetQuantity: Number(targetQuantity),
                        unitId: Number(unitId)
                    }
                });

                if (ingredients && Array.isArray(ingredients)) {
                    for (const ing of ingredients) {
                        await tx.productionRecipeIngredient.create({
                            data: {
                                recipeId: newRecipe.id,
                                inventoryItemId: Number(ing.inventoryItemId),
                                quantity: Number(ing.quantity)
                            }
                        });
                    }
                }

                return tx.productionRecipe.findUnique({
                    where: { id: newRecipe.id },
                    include: { ingredients: true }
                });
            });

            return { success: true, data: recipe };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Update a recipe
    app.put('/recipes/:id', { preHandler: authorize(['admin', 'warehouse']) }, async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const { name, description, targetQuantity, unitId, inventoryItemId, ingredients } = request.body;

        try {
            const recipe = await prisma.productionRecipe.findFirst({
                where: { id: Number(id), restaurantId }
            });
            if (!recipe) {
                return reply.status(404).send({ success: false, error: 'Recipe not found' });
            }

            const updatedRecipe = await prisma.$transaction(async (tx) => {
                await tx.productionRecipe.update({
                    where: { id: recipe.id },
                    data: {
                        inventoryItemId: inventoryItemId ? Number(inventoryItemId) : undefined,
                        name: name ? name.trim() : undefined,
                        description: description !== undefined ? description : undefined,
                        targetQuantity: targetQuantity ? Number(targetQuantity) : undefined,
                        unitId: unitId ? Number(unitId) : undefined
                    }
                });

                if (ingredients && Array.isArray(ingredients)) {
                    // Delete old ingredients
                    await tx.productionRecipeIngredient.deleteMany({
                        where: { recipeId: recipe.id }
                    });

                    // Add updated ingredients
                    for (const ing of ingredients) {
                        await tx.productionRecipeIngredient.create({
                            data: {
                                recipeId: recipe.id,
                                inventoryItemId: Number(ing.inventoryItemId),
                                quantity: Number(ing.quantity)
                            }
                        });
                    }
                }

                return tx.productionRecipe.findUnique({
                    where: { id: recipe.id },
                    include: { ingredients: true }
                });
            });

            return { success: true, data: updatedRecipe };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Delete a recipe
    app.delete('/recipes/:id', { preHandler: authorize(['admin', 'warehouse']) }, async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;

        try {
            const recipe = await prisma.productionRecipe.findFirst({
                where: { id: Number(id), restaurantId }
            });
            if (!recipe) {
                return reply.status(404).send({ success: false, error: 'Recipe not found' });
            }

            await prisma.productionRecipe.delete({
                where: { id: recipe.id }
            });

            return { success: true, message: 'Recipe deleted successfully' };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ═══════════════════════════════════════════════════════
    // 2. PRODUCTION RUNS
    // ═══════════════════════════════════════════════════════

    // Helper to auto-seed sample production data if database has no records
    async function autoSeedSampleProductionData(restaurantId) {
        try {
            let branch = await prisma.branch.findFirst({ where: { restaurantId } });
            if (!branch) {
                branch = await prisma.branch.create({
                    data: { restaurantId, name: 'Main Kitchen Warehouse' }
                }).catch(() => null);
            }
            if (!branch) return;

            let branch2 = await prisma.branch.findFirst({ where: { restaurantId, id: { not: branch.id } } });
            if (!branch2) {
                branch2 = await prisma.branch.create({
                    data: { restaurantId, name: 'Express Retail Outlet' }
                }).catch(() => null);
            }
            if (!branch2) branch2 = branch;

            let unit = await prisma.inventoryUnit.findFirst({ where: { restaurantId } });
            if (!unit) {
                unit = await prisma.inventoryUnit.create({
                    data: { restaurantId, name: 'Kilograms', symbol: 'kg' }
                }).catch(() => null);
            }
            if (!unit) return;

            let cakeItem = await prisma.inventoryItem.findFirst({ where: { restaurantId, name: 'Chocolate Cake' } });
            if (!cakeItem) {
                cakeItem = await prisma.inventoryItem.create({
                    data: { restaurantId, name: 'Chocolate Cake', category: 'Bakery', unitId: unit.id, costPerUnit: 150, currentStock: 50 }
                }).catch(() => null);
            }

            let croissantItem = await prisma.inventoryItem.findFirst({ where: { restaurantId, name: 'Butter Croissant' } });
            if (!croissantItem) {
                croissantItem = await prisma.inventoryItem.create({
                    data: { restaurantId, name: 'Butter Croissant', category: 'Bakery', unitId: unit.id, costPerUnit: 40, currentStock: 120 }
                }).catch(() => null);
            }

            let puffItem = await prisma.inventoryItem.findFirst({ where: { restaurantId, name: 'Paneer Puff' } });
            if (!puffItem) {
                puffItem = await prisma.inventoryItem.create({
                    data: { restaurantId, name: 'Paneer Puff', category: 'Savory', unitId: unit.id, costPerUnit: 25, currentStock: 80 }
                }).catch(() => null);
            }

            if (!cakeItem || !croissantItem || !puffItem) return;

            let cakeRecipe = await prisma.productionRecipe.findFirst({ where: { restaurantId, name: 'Chocolate Cake Batch' } });
            if (!cakeRecipe) {
                cakeRecipe = await prisma.productionRecipe.create({
                    data: {
                        restaurantId,
                        inventoryItemId: cakeItem.id,
                        name: 'Chocolate Cake Batch',
                        targetQuantity: 20,
                        unitId: unit.id
                    }
                }).catch(() => null);
            }

            let croissantRecipe = await prisma.productionRecipe.findFirst({ where: { restaurantId, name: 'Croissant Batch' } });
            if (!croissantRecipe) {
                croissantRecipe = await prisma.productionRecipe.create({
                    data: {
                        restaurantId,
                        inventoryItemId: croissantItem.id,
                        name: 'Croissant Batch',
                        targetQuantity: 50,
                        unitId: unit.id
                    }
                }).catch(() => null);
            }

            const now = new Date();
            const d1 = new Date(now.getTime() - 4 * 24 * 3600 * 1000);
            const d2 = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
            const d3 = new Date(now.getTime() - 12 * 3600 * 1000);

            const totalRuns = await prisma.productionRun.count({ where: { restaurantId } }).catch(() => 0);
            if (totalRuns === 0 && cakeRecipe && croissantRecipe) {
                await prisma.productionRun.createMany({
                    data: [
                        {
                            restaurantId,
                            branchId: branch.id,
                            recipeId: cakeRecipe.id,
                            quantityProduced: 20,
                            overheadCost: 350,
                            costOfProduction: 2800,
                            batchNumber: `PRD-${Date.now()}-1`,
                            status: 'completed',
                            wasteQuantity: 1.5,
                            wasteReason: 'Trimming loss',
                            createdAt: d1
                        },
                        {
                            restaurantId,
                            branchId: branch.id,
                            recipeId: croissantRecipe.id,
                            quantityProduced: 50,
                            overheadCost: 200,
                            costOfProduction: 1800,
                            batchNumber: `PRD-${Date.now()}-2`,
                            status: 'completed',
                            wasteQuantity: 2.0,
                            wasteReason: 'Overbaking',
                            createdAt: d2
                        },
                        {
                            restaurantId,
                            branchId: branch.id,
                            recipeId: cakeRecipe.id,
                            quantityProduced: 15,
                            overheadCost: 250,
                            costOfProduction: 2100,
                            batchNumber: `PRD-${Date.now()}-3`,
                            status: 'completed',
                            wasteQuantity: 0.5,
                            wasteReason: 'Quality test',
                            createdAt: d3
                        }
                    ]
                }).catch(() => null);
            }

            const totalTransfers = await prisma.warehouseTransfer.count({ where: { restaurantId } }).catch(() => 0);
            if (totalTransfers === 0) {
                await prisma.warehouseTransfer.create({
                    data: {
                        restaurantId,
                        fromBranchId: branch.id,
                        toBranchId: branch2.id,
                        transferNumber: `TRF-${Date.now()}-1`,
                        status: 'shipped',
                        shippedAt: now,
                        createdAt: now,
                        items: {
                            create: [
                                { inventoryItemId: cakeItem.id, quantityShipped: 10, unitCost: 140 },
                                { inventoryItemId: croissantItem.id, quantityShipped: 30, unitCost: 35 }
                            ]
                        }
                    }
                }).catch(() => null);

                await prisma.warehouseTransfer.create({
                    data: {
                        restaurantId,
                        fromBranchId: branch.id,
                        toBranchId: branch2.id,
                        transferNumber: `TRF-${Date.now()}-2`,
                        status: 'completed_with_discrepancy',
                        shippedAt: d1,
                        receivedAt: d2,
                        createdAt: d2,
                        items: {
                            create: [
                                { inventoryItemId: puffItem.id, quantityShipped: 40, quantityReceived: 38, quantityDamaged: 2, unitCost: 25 }
                            ]
                        }
                    }
                }).catch(() => null);
            }

        } catch (e) {
            console.error('Error seeding sample production data:', e);
        }
    }

    // Explicit Endpoint to Seed Sample Data
    app.post('/seed-sample-data', async (request) => {
        const restaurantId = request.restaurantId;
        await autoSeedSampleProductionData(restaurantId);
        return { success: true, message: 'Sample production data seeded successfully' };
    });

    // Get all production runs
    app.get('/runs', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query || {};
        try {
            if (!prisma.productionRun) {
                return { success: true, data: [] };
            }

            // Auto-provision sample data if restaurant has 0 production runs
            const totalRuns = await prisma.productionRun.count({ where: { restaurantId } }).catch(() => 0);
            if (totalRuns === 0) {
                await autoSeedSampleProductionData(restaurantId);
            }

            const where = { restaurantId };
            if (dateFrom || dateTo) {
                where.createdAt = {};
                if (dateFrom) {
                    const d = new Date(dateFrom);
                    if (!isNaN(d.getTime())) where.createdAt.gte = d;
                }
                if (dateTo) {
                    let d = new Date(dateTo);
                    if (!isNaN(d.getTime())) {
                        if (typeof dateTo === 'string') {
                            if (dateTo.length === 10) {
                                d = new Date(`${dateTo}T23:59:59.999Z`);
                            } else if (dateTo.includes('T00:00:00') || dateTo.endsWith('Z')) {
                                const dayPart = dateTo.split('T')[0];
                                d = new Date(`${dayPart}T23:59:59.999Z`);
                            }
                        }
                        where.createdAt.lte = d;
                    }
                }
            }

            const runs = await prisma.productionRun.findMany({
                where,
                include: {
                    recipe: {
                        select: { name: true, targetQuantity: true }
                    },
                    ingredientsUsed: {
                        include: {
                            inventoryItem: { select: { name: true, sku: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            const mappedRuns = runs.map(r => {
                const totalCost = Number(r.costOfProduction || 0);
                const overheadCost = Number(r.overheadCost || 0);
                const materialCost = Math.max(0, totalCost - overheadCost);
                const quantityProduced = Number(r.quantityProduced || 0);

                return {
                    ...r,
                    quantity: quantityProduced,
                    quantityProduced,
                    totalCost,
                    overheadCost,
                    materialCost,
                    costOfProduction: totalCost,
                };
            });

            return { success: true, data: mappedRuns };
        } catch (err) {
            console.error('Error fetching production runs:', err);
            return { success: true, data: [] };
        }
    });

    // Record a new production run (baking batch)
    app.post('/runs', { preHandler: authorize(['admin', 'warehouse']) }, async (request, reply) => {
        const restaurantId = request.restaurantId;
        const staffId = request.user.id;
        const { recipeId, quantityProduced, overheadCost, notes, branchId, wasteQuantity, wasteReason, ingredients } = request.body;

        if (!recipeId || !quantityProduced || !branchId) {
            return reply.status(400).send({ success: false, error: 'recipeId, quantityProduced, and branchId are required' });
        }

        try {
            // Find recipe
            const recipe = await prisma.productionRecipe.findFirst({
                where: { id: Number(recipeId), restaurantId },
                include: { ingredients: true }
            });
            if (!recipe) {
                return reply.status(404).send({ success: false, error: 'Recipe not found' });
            }

            // Determine ingredients details
            let ingredientsToUse = [];
            const actualQty = Number(quantityProduced);
            const wastedQty = Number(wasteQuantity || 0);
            const totalQuantityDeductionBasis = actualQty + wastedQty;

            if (ingredients && Array.isArray(ingredients)) {
                ingredientsToUse = ingredients.map(i => ({
                    inventoryItemId: Number(i.inventoryItemId),
                    quantity: Number(i.quantityConsumed)
                }));
            } else {
                // Scale from base recipe
                const scale = totalQuantityDeductionBasis / Number(recipe.targetQuantity);
                ingredientsToUse = recipe.ingredients.map(ing => ({
                    inventoryItemId: ing.inventoryItemId,
                    quantity: Number(ing.quantity) * scale
                }));
            }

            const batchNumber = generateBatchNumber();

            // Execute transaction
            const run = await prisma.$transaction(async (tx) => {
                let totalMaterialCost = 0;
                const ingredientRecords = [];

                // 1. Process and deduct ingredients
                for (const ing of ingredientsToUse) {
                    const item = await tx.inventoryItem.findFirst({
                        where: { id: ing.inventoryItemId, restaurantId }
                    });
                    if (!item) {
                        throw new Error(`Ingredient item not found: ID ${ing.inventoryItemId}`);
                    }

                    // Check branch stock
                    const branchStock = await tx.branchStock.findFirst({
                        where: { branchId: Number(branchId), inventoryItemId: ing.inventoryItemId }
                    });

                    if (!branchStock || Number(branchStock.quantity) < ing.quantity) {
                        throw new Error(`Insufficient stock for ingredient '${item.name}' at warehouse. Required: ${ing.quantity}, Available: ${branchStock ? branchStock.quantity : 0}`);
                    }

                    // Deduct stock
                    await tx.branchStock.update({
                        where: { id: branchStock.id },
                        data: { quantity: { decrement: ing.quantity } }
                    });

                    // Update global currentStock
                    await tx.inventoryItem.update({
                        where: { id: item.id },
                        data: { currentStock: { decrement: ing.quantity } }
                    });

                    // Log movement
                    await tx.inventoryMovement.create({
                        data: {
                            restaurantId,
                            itemId: item.id,
                            fromBranchId: Number(branchId),
                            type: 'PRODUCTION_OUT',
                            quantity: ing.quantity,
                            note: `Consumed in Production Batch #${batchNumber}`,
                            staffId
                        }
                    });

                    const cost = Number(item.costPerUnit || 0) * ing.quantity;
                    totalMaterialCost += cost;

                    ingredientRecords.push({
                        inventoryItemId: ing.inventoryItemId,
                        quantityConsumed: ing.quantity,
                        costPerUnit: item.costPerUnit || 0
                    });
                }

                // 2. Increment finished product in warehouse branch
                const finishedItemId = recipe.inventoryItemId;
                const finishedItem = await tx.inventoryItem.findFirst({
                    where: { id: finishedItemId, restaurantId }
                });
                if (!finishedItem) {
                    throw new Error(`Finished goods inventory item not found: ID ${finishedItemId}`);
                }

                let finishedBranchStock = await tx.branchStock.findFirst({
                    where: { branchId: Number(branchId), inventoryItemId: finishedItemId }
                });

                if (!finishedBranchStock) {
                    finishedBranchStock = await tx.branchStock.create({
                        data: {
                            restaurantId,
                            branchId: Number(branchId),
                            inventoryItemId: finishedItemId,
                            quantity: 0
                        }
                    });
                }

                await tx.branchStock.update({
                    where: { id: finishedBranchStock.id },
                    data: { quantity: { increment: actualQty } }
                });

                // Update global finished stock
                await tx.inventoryItem.update({
                    where: { id: finishedItemId },
                    data: { currentStock: { increment: actualQty } }
                });

                // Log PRODUCTION_IN movement
                await tx.inventoryMovement.create({
                    data: {
                        restaurantId,
                        itemId: finishedItemId,
                        toBranchId: Number(branchId),
                        type: 'PRODUCTION_IN',
                        quantity: actualQty,
                        note: `Yield of Production Batch #${batchNumber}`,
                        staffId
                    }
                });

                // 3. Log PRODUCTION_WASTE if any
                if (wastedQty > 0) {
                    await tx.inventoryMovement.create({
                        data: {
                            restaurantId,
                            itemId: finishedItemId,
                            fromBranchId: Number(branchId),
                            type: 'PRODUCTION_WASTE',
                            quantity: wastedQty,
                            note: `Wastage: ${wasteReason || 'Baking failure'} in Batch #${batchNumber}`,
                            staffId
                        }
                    });
                }

                // 4. Calculate total cost and update finished goods unit cost
                const overhead = Number(overheadCost || 0);
                const totalCost = totalMaterialCost + overhead;
                const newUnitCost = actualQty > 0 ? totalCost / actualQty : 0;

                // Update unit cost of finished goods item (weighted average or overwrite)
                if (newUnitCost > 0) {
                    await tx.inventoryItem.update({
                        where: { id: finishedItemId },
                        data: { costPerUnit: newUnitCost }
                    });
                }

                // 5. Create Production Run
                const newRun = await tx.productionRun.create({
                    data: {
                        restaurantId,
                        branchId: Number(branchId),
                        recipeId: recipe.id,
                        quantityProduced: actualQty,
                        overheadCost: overhead,
                        costOfProduction: totalCost,
                        batchNumber,
                        status: wastedQty >= actualQty ? 'wasted' : 'completed',
                        wasteQuantity: wastedQty,
                        wasteReason: wasteReason || null,
                        notes: notes || null,
                        staffId,
                        ingredientsUsed: {
                            create: ingredientRecords
                        }
                    },
                    include: {
                        ingredientsUsed: true
                    }
                });

                return newRun;
            });

            return { success: true, data: run };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ═══════════════════════════════════════════════════════
    // 3. STOCK TRANSFERS (SHIPMENTS)
    // ═══════════════════════════════════════════════════════

    // Get all transfers
    app.get('/transfers', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query || {};
        try {
            if (!prisma.warehouseTransfer) {
                return { success: true, data: [] };
            }

            // Auto-provision sample data if restaurant has 0 transfers
            const totalTransfers = await prisma.warehouseTransfer.count({ where: { restaurantId } }).catch(() => 0);
            if (totalTransfers === 0) {
                await autoSeedSampleProductionData(restaurantId);
            }

            const where = { restaurantId };
            if (dateFrom || dateTo) {
                const dateCond = {};
                if (dateFrom) {
                    const d = new Date(dateFrom);
                    if (!isNaN(d.getTime())) dateCond.gte = d;
                }
                if (dateTo) {
                    let d = new Date(dateTo);
                    if (!isNaN(d.getTime())) {
                        if (typeof dateTo === 'string' && dateTo.length === 10) {
                            d = new Date(`${dateTo}T23:59:59.999Z`);
                        }
                        dateCond.lte = d;
                    }
                }
                where.OR = [
                    { createdAt: dateCond },
                    { shippedAt: dateCond },
                    { status: 'shipped' }
                ];
            }

            const transfers = await prisma.warehouseTransfer.findMany({
                where,
                include: {
                    items: {
                        include: {
                            inventoryItem: { 
                                select: { 
                                    name: true, 
                                    sku: true, 
                                    barcode: true,
                                    unit: { select: { symbol: true, name: true } }
                                } 
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            return { success: true, data: transfers };
        } catch (err) {
            console.error('Error fetching warehouse transfers:', err);
            return { success: true, data: [] };
        }
    });

    // Dispatch a transfer from Warehouse to Restaurant
    app.post('/transfers/dispatch', { preHandler: authorize(['admin', 'warehouse']) }, async (request, reply) => {
        const restaurantId = request.tenantId || request.restaurantId;
        const shipperStaffId = request.user.id;
        const { fromBranchId, toBranchId, items, notes } = request.body;

        if (!fromBranchId || !toBranchId || !items || !Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'fromBranchId, toBranchId, and items are required' });
        }

        try {
            const transferNumber = generateTransferNumber();

            const transfer = await prisma.$transaction(async (tx) => {
                const itemRecords = [];

                for (const item of items) {
                    const invItem = await tx.inventoryItem.findFirst({
                        where: { id: Number(item.inventoryItemId), restaurantId }
                    });
                    if (!invItem) {
                        throw new Error(`Item not found: ID ${item.inventoryItemId}`);
                    }

                    // Check branch stock
                    const fromStock = await tx.branchStock.findFirst({
                        where: { branchId: Number(fromBranchId), inventoryItemId: invItem.id }
                    });

                    const qty = Number(item.quantityShipped);

                    if (!fromStock || Number(fromStock.quantity) < qty) {
                        throw new Error(`Insufficient stock for '${invItem.name}' at source branch. Available: ${fromStock ? fromStock.quantity : 0}`);
                    }

                    // Deduct stock from source branch (warehouse)
                    await tx.branchStock.update({
                        where: { id: fromStock.id },
                        data: { quantity: { decrement: qty } }
                    });

                    // Decrement global currentStock (items go to transit status)
                    await tx.inventoryItem.update({
                        where: { id: invItem.id },
                        data: { currentStock: { decrement: qty } }
                    });

                    // Log TRANSIT_OUT movement
                    await tx.inventoryMovement.create({
                        data: {
                            restaurantId,
                            itemId: invItem.id,
                            fromBranchId: Number(fromBranchId),
                            type: 'TRANSIT_OUT',
                            quantity: qty,
                            note: `Shipped to branch ID ${toBranchId} via Transfer #${transferNumber}`,
                            staffId: shipperStaffId
                        }
                    });

                    itemRecords.push({
                        inventoryItemId: invItem.id,
                        quantityShipped: qty,
                        quantityReceived: 0,
                        quantityDamaged: 0,
                        unitCost: invItem.costPerUnit || 0
                    });
                }

                // Create transfer record
                const newTransfer = await tx.warehouseTransfer.create({
                    data: {
                        restaurantId,
                        fromBranchId: Number(fromBranchId),
                        toBranchId: Number(toBranchId),
                        transferNumber,
                        transferType: 'outbound',
                        status: 'shipped',
                        shippedAt: new Date(),
                        notes: notes || null,
                        shipperStaffId,
                        items: {
                            create: itemRecords
                        }
                    },
                    include: {
                        items: true
                    }
                });

                return newTransfer;
            });

            // Emit socket update to notify restaurant branch in real time
            emitToRestaurant(restaurantId, 'transfer_dispatched', { transferId: transfer.id, toBranchId });

            return { success: true, data: transfer };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Receive a transfer at Restaurant POS (Updates status, logs damage, increments local stock)
    app.post('/transfers/:id/receive', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const receiverStaffId = request.user.id;
        const { id } = request.params;
        const { items, notes } = request.body;

        if (!items || !Array.isArray(items)) {
            return reply.status(400).send({ success: false, error: 'items array is required' });
        }

        try {
            const transfer = await prisma.warehouseTransfer.findFirst({
                where: { id: Number(id), restaurantId, status: 'shipped' },
                include: { items: true }
            });
            if (!transfer) {
                return reply.status(404).send({ success: false, error: 'Shipped transfer not found or already received' });
            }

            const updatedTransfer = await prisma.$transaction(async (tx) => {
                let hasDiscrepancy = false;

                for (const item of items) {
                    const originalItem = transfer.items.find(ti => ti.inventoryItemId === Number(item.inventoryItemId));
                    if (!originalItem) continue;

                    const qtyRec = Number(item.quantityReceived);
                    const qtyDmg = Number(item.quantityDamaged || 0);

                    // Check if received != shipped
                    if (qtyRec + qtyDmg !== Number(originalItem.quantityShipped)) {
                        hasDiscrepancy = true;
                    }

                    // Update transfer item totals
                    await tx.warehouseTransferItem.update({
                        where: { id: originalItem.id },
                        data: {
                            quantityReceived: qtyRec,
                            quantityDamaged: qtyDmg
                        }
                    });

                    // 1. Increment destination branch stock
                    let destStock = await tx.branchStock.findFirst({
                        where: { branchId: transfer.toBranchId, inventoryItemId: originalItem.inventoryItemId }
                    });

                    if (!destStock) {
                        destStock = await tx.branchStock.create({
                            data: {
                                restaurantId,
                                branchId: transfer.toBranchId,
                                inventoryItemId: originalItem.inventoryItemId,
                                quantity: 0
                            }
                        });
                    }

                    await tx.branchStock.update({
                        where: { id: destStock.id },
                        data: { quantity: { increment: qtyRec } }
                    });

                    // 2. Increment global currentStock (bringing it back from transit status)
                    await tx.inventoryItem.update({
                        where: { id: originalItem.inventoryItemId },
                        data: { currentStock: { increment: qtyRec } }
                    });

                    // Log TRANSIT_IN movement
                    await tx.inventoryMovement.create({
                        data: {
                            restaurantId,
                            itemId: originalItem.inventoryItemId,
                            toBranchId: transfer.toBranchId,
                            type: 'TRANSIT_IN',
                            quantity: qtyRec,
                            note: `Received from Warehouse via Transfer #${transfer.transferNumber}`,
                            staffId: receiverStaffId
                        }
                    });

                    // Log TRANSIT_DAMAGE movement if any
                    if (qtyDmg > 0) {
                        await tx.inventoryMovement.create({
                            data: {
                                restaurantId,
                                itemId: originalItem.inventoryItemId,
                                toBranchId: transfer.toBranchId,
                                type: 'TRANSIT_DAMAGE',
                                quantity: qtyDmg,
                                note: `Damaged in transit for Transfer #${transfer.transferNumber}`,
                                staffId: receiverStaffId
                            }
                        });
                    }
                }

                // Update transfer record
                const finalStatus = hasDiscrepancy ? 'completed_with_discrepancy' : 'received';
                const result = await tx.warehouseTransfer.update({
                    where: { id: transfer.id },
                    data: {
                        status: finalStatus,
                        receivedAt: new Date(),
                        receiverStaffId,
                        notes: notes ? `${transfer.notes || ''}\nReceive Notes: ${notes}`.trim() : transfer.notes
                    },
                    include: {
                        items: true
                    }
                });

                return result;
            });

            return { success: true, data: updatedTransfer };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Initiate a return transfer (Damaged/Excess goods sent back to warehouse)
    app.post('/transfers/:id/return', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const shipperStaffId = request.user.id;
        const { id } = request.params; // Original transfer ID
        const { items, notes } = request.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items list is required for returns' });
        }

        try {
            const originalTransfer = await prisma.warehouseTransfer.findFirst({
                where: { id: Number(id), restaurantId },
                include: { items: true }
            });
            if (!originalTransfer) {
                return reply.status(404).send({ success: false, error: 'Original transfer not found' });
            }

            const transferNumber = generateTransferNumber();

            const returnTransfer = await prisma.$transaction(async (tx) => {
                const itemRecords = [];

                for (const item of items) {
                    const originalItem = originalTransfer.items.find(ti => ti.inventoryItemId === Number(item.inventoryItemId));
                    if (!originalItem) {
                        throw new Error(`Item ID ${item.inventoryItemId} was not part of the original transfer.`);
                    }

                    const qtyRet = Number(item.quantityReturned);

                    if (qtyRet > Number(originalItem.quantityReceived)) {
                        throw new Error(`Cannot return more than the received quantity (${originalItem.quantityReceived}) for item ID ${item.inventoryItemId}`);
                    }

                    // Check restaurant branch stock
                    const restaurantStock = await tx.branchStock.findFirst({
                        where: { branchId: originalTransfer.toBranchId, inventoryItemId: originalItem.inventoryItemId }
                    });

                    if (!restaurantStock || Number(restaurantStock.quantity) < qtyRet) {
                        throw new Error(`Insufficient stock in restaurant branch to execute return. Available: ${restaurantStock ? restaurantStock.quantity : 0}`);
                    }

                    // Deduct stock from restaurant branch
                    await tx.branchStock.update({
                        where: { id: restaurantStock.id },
                        data: { quantity: { decrement: qtyRet } }
                    });

                    // Decrement global stock (items in return transit)
                    await tx.inventoryItem.update({
                        where: { id: originalItem.inventoryItemId },
                        data: { currentStock: { decrement: qtyRet } }
                    });

                    // Log TRANSIT_OUT for return shipment
                    await tx.inventoryMovement.create({
                        data: {
                            restaurantId,
                            itemId: originalItem.inventoryItemId,
                            fromBranchId: originalTransfer.toBranchId,
                            type: 'TRANSIT_OUT',
                            quantity: qtyRet,
                            note: `Return shipment back to Warehouse via Return Transfer #${transferNumber}`,
                            staffId: shipperStaffId
                        }
                    });

                    itemRecords.push({
                        inventoryItemId: originalItem.inventoryItemId,
                        quantityShipped: qtyRet,
                        quantityReceived: 0,
                        quantityDamaged: 0,
                        unitCost: originalItem.unitCost
                    });
                }

                // Create reverse transfer record (restaurant -> warehouse)
                const newReturn = await tx.warehouseTransfer.create({
                    data: {
                        restaurantId,
                        fromBranchId: originalTransfer.toBranchId, // Restaurant
                        toBranchId: originalTransfer.fromBranchId, // Warehouse
                        transferNumber,
                        transferType: 'return',
                        parentTransferId: originalTransfer.id,
                        status: 'shipped',
                        shippedAt: new Date(),
                        notes: notes || `Return of Transfer #${originalTransfer.transferNumber}`,
                        shipperStaffId,
                        items: {
                            create: itemRecords
                        }
                    },
                    include: {
                        items: true
                    }
                });

                return newReturn;
            });

            return { success: true, data: returnTransfer };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ═══════════════════════════════════════════════════════
    // 4. RESTAURANT LOCAL CLIENT SYNC ENDPOINTS
    // ═══════════════════════════════════════════════════════

    // Pull finished product catalog (synced to local SQLite)
    app.get('/sync/catalog', async (request, reply) => {
        const restaurantId = request.restaurantId;
        try {
            // Find all inventory items that are marked as production outputs (i.e. have recipes)
            const catalog = await prisma.inventoryItem.findMany({
                where: {
                    restaurantId,
                    productionRecipes: { some: {} } // Has a recipe defined
                },
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    barcode: true,
                    costPerUnit: true,
                    categoryId: true,
                    unitId: true
                }
            });
            return { success: true, data: catalog };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Pull pending transfers addressed to a specific branch
    app.get('/sync/transfers/pending', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { branchId } = request.query;

        if (!branchId) {
            return reply.status(400).send({ success: false, error: 'branchId is required' });
        }

        try {
            const pending = await prisma.warehouseTransfer.findMany({
                where: {
                    restaurantId,
                    toBranchId: Number(branchId),
                    status: 'shipped'
                },
                include: {
                    items: {
                        include: {
                            inventoryItem: { select: { id: true, name: true, sku: true, barcode: true } }
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            });
            return { success: true, data: pending };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // Push local shipment receipt back to Central Server (runs the standard receive endpoint logic)
    app.post('/sync/transfers/:id/receive', async (request, reply) => {
        // Reuse original receive logic
        return app.inject({
            method: 'POST',
            url: `/transfers/${request.params.id}/receive`,
            headers: request.headers,
            payload: request.body
        });
    });

    // Push local return dispatch back to Central Server (runs the standard return endpoint logic)
    app.post('/sync/transfers/:id/return', async (request, reply) => {
        // Reuse original return logic
        return app.inject({
            method: 'POST',
            url: `/transfers/${request.params.id}/return`,
            headers: request.headers,
            payload: request.body
        });
    });
}
