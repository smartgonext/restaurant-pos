import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
// GET: Fetch modifier groups for an item
export async function getItemModifierGroups(request, reply) {
    try {
        const { menuItemId } = request.params;
        const itemModifiers = await prisma.itemModifier.findMany({
            where: { menuItemId: Number(menuItemId) },
            include: {
                modifierGroup: {
                    include: {
                        itemModifiers: {
                            where: { menuItemId: Number(menuItemId) },
                        },
                    },
                },
            },
        });
        // Group by modifier group
        const groupedModifiers = itemModifiers.reduce((acc, im) => {
            const groupId = im.modifierGroup.id;
            if (!acc[groupId]) {
                let options = [];
                try {
                    options = typeof im.modifierGroup.options === 'string'
                        ? JSON.parse(im.modifierGroup.options)
                        : (Array.isArray(im.modifierGroup.options) ? im.modifierGroup.options : []);
                }
                catch (e) { }
                acc[groupId] = {
                    id: im.modifierGroup.id,
                    name: im.modifierGroup.name,
                    isRequired: im.isRequired,
                    allowMultiple: im.allowMultiple,
                    options: options,
                };
            }
            return acc;
        }, {});
        return reply.send(Object.values(groupedModifiers));
    }
    catch (error) {
        console.error('Error fetching modifier groups:', error);
        reply.status(500).send({ message: 'Failed to fetch modifier groups' });
    }
}
// POST: Process return
export async function processReturn(request, reply) {
    try {
        await authenticate(request, reply);
        const { originalTokenId, returnItems, returnedBy, returnReason, totalReturnAmount, } = request.body;
        if (!originalTokenId) {
            return reply.status(400).send({ message: 'originalTokenId is required' });
        }
        if (!Array.isArray(returnItems) || returnItems.length === 0) {
            return reply.status(400).send({ message: 'Return items are required' });
        }
        const effectiveTotalReturnAmount = totalReturnAmount ?? returnItems.reduce((sum, item) => sum + Number(item.totalReturn || 0), 0);
        // Get original token
        const originalToken = await prisma.bakeryToken.findUnique({
            where: { id: originalTokenId },
            include: { items: true },
        });
        if (!originalToken) {
            return reply.status(404).send({ message: 'Token not found' });
        }
        // Create return record
        const tokenReturn = await prisma.bakeryTokenReturn.create({
            data: {
                originalTokenId,
                restaurantId: originalToken.restaurantId,
                branchId: originalToken.branchId,
                returnedBy,
                returnReason,
                totalReturnAmount: effectiveTotalReturnAmount,
                status: 'completed',
                returnItems: {
                    createMany: {
                        data: returnItems.map(item => ({
                            tokenItemId: item.tokenItemId,
                            menuItemId: item.menuItemId,
                            menuItemName: item.menuItemName,
                            quantity: item.quantity,
                            price: item.price,
                            totalReturn: item.totalReturn,
                        })),
                    },
                },
            },
            include: { returnItems: true },
        });
        // Add stock back to inventory for each item
        for (const item of returnItems) {
            const menuItem = await prisma.menuItem.findUnique({
                where: { id: item.menuItemId },
                include: { inventoryItem: true },
            });
            if (menuItem?.inventoryItem) {
                // Add back to inventory
                await prisma.inventoryItem.update({
                    where: { id: menuItem.inventoryItem.id },
                    data: {
                        currentStock: { increment: item.quantity },
                    },
                });
            }
        }
        return reply.send({
            message: 'Return processed successfully',
            return: tokenReturn,
            totalRefunded: totalReturnAmount,
        });
    }
    catch (error) {
        console.error('Error processing return:', error);
        reply.status(500).send({ message: 'Failed to process return' });
    }
}
// GET: Get today's returns
export async function getTodaysReturns(request, reply) {
    try {
        await authenticate(request, reply);
        const { restaurantId } = request.query;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const returns = await prisma.bakeryTokenReturn.findMany({
            where: {
                restaurantId: Number(restaurantId),
                createdAt: {
                    gte: today,
                },
            },
            include: {
                returnItems: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        const summary = {
            totalReturns: returns.length,
            totalAmount: returns.reduce((sum, r) => sum + Number(r.totalReturnAmount), 0),
            byReason: {},
        };
        returns.forEach(r => {
            if (r.returnReason) {
                summary.byReason[r.returnReason] = (summary.byReason[r.returnReason] || 0) + 1;
            }
        });
        return reply.send({ returns, summary });
    }
    catch (error) {
        console.error('Error fetching today\'s returns:', error);
        reply.status(500).send({ message: 'Failed to fetch returns' });
    }
}
// GET: Get all tables
export async function getTables(request, reply) {
    try {
        const { restaurantId } = request.query;
        const tables = await prisma.table.findMany({
            where: {
                restaurantId: Number(restaurantId),
                isActive: true,
            },
            include: {
                area: { select: { name: true } },
            },
            orderBy: { name: 'asc' },
        });
        // Map to include occupancy info
        const tablesWithOccupancy = await Promise.all(tables.map(async (table) => {
            // Count active orders for this table
            const activeOrders = await prisma.order.count({
                where: {
                    tableId: table.id,
                    status: { in: ['placed', 'preparing', 'ready'] },
                },
            });
            return {
                ...table,
                areaName: table.area?.name,
                currentOccupancy: activeOrders > 0 ? activeOrders : 0,
                status: activeOrders > 0 ? 'occupied' : 'available',
            };
        }));
        return reply.send(tablesWithOccupancy);
    }
    catch (error) {
        console.error('Error fetching tables:', error);
        reply.status(500).send({ message: 'Failed to fetch tables' });
    }
}
// PATCH: Update table occupancy
export async function updateTableOccupancy(request, reply) {
    try {
        await authenticate(request, reply);
        const { tableId } = request.params;
        const { occupancy } = request.body;
        const table = await prisma.table.update({
            where: { id: Number(tableId) },
            data: {
            // Store occupancy in a custom field or just use orders count
            },
        });
        return reply.send(table);
    }
    catch (error) {
        console.error('Error updating table occupancy:', error);
        reply.status(500).send({ message: 'Failed to update table' });
    }
}
// GET: Fetch token by number for returns
export async function getTokenForReturn(request, reply) {
    try {
        const { tokenNumber } = request.params;
        const { restaurantId } = request.query;
        const token = await prisma.bakeryToken.findFirst({
            where: {
                restaurantId: Number(restaurantId),
                OR: [
                    { tokenNumber: Number(tokenNumber) },
                    { order: { is: { orderNumber: tokenNumber } } }, // match via related Order
                ],
            },
            include: {
                items: true,
                payments: true,
                order: true,
            },
        });
        if (!token) {
            return reply.status(404).send({ message: 'Token/Bill not found' });
        }
        // Check if already fully returned
        const returnRecord = await prisma.bakeryTokenReturn.findFirst({
            where: { originalTokenId: token.id, status: 'completed' },
        });
        if (returnRecord) {
            return reply.status(400).send({ message: 'This token has already been fully returned' });
        }
        return reply.send(token);
    }
    catch (error) {
        console.error('Error fetching token for return:', error);
        reply.status(500).send({ message: 'Failed to fetch token details' });
    }
}
