import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../app.js';
import { subposAuth } from '../../middleware/posAuth.js';
import { getNextTokenNumber } from '../../utils/tokenCounter.js';
import { recalculateTokenTotals } from '../../utils/taxCalculator.js';
import { emitToRestaurant } from '../../plugins/socket.js';
import { applyKOTConsumption } from '../../utils/inventory.js';
export async function subposRoutes(app) {
    const normalizeKotQty = (qty) => Math.max(1, Math.round(Number(qty || 0)));
    const getGroupIds = (user) => {
        const val = user?.groupIds;
        if (!val)
            return [];
        try {
            const arr = typeof val === 'string' ? JSON.parse(val) : val;
            return Array.isArray(arr) ? arr.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n)) : [];
        }
        catch (e) {
            return [];
        }
    };
    // helper: compute sellingPrice from purchaseRate + profitPercent
    const computeSellingPrice = (m) => {
        if (!m)
            return m;
        const purchase = Number(m.purchaseRate ?? 0);
        const profit = Number(m.profitPercent ?? 0);
        const selling = Math.round(purchase * (1 + profit / 100) * 100) / 100;
        return { ...m, sellingPrice: selling };
    };
    // keep all active MRPs (newest first) so POS can show full MRP dropdown
    const activeMrps = (arr = []) => {
        const active = (arr || []).filter((m) => m?.isActive !== false);
        if (active.length === 0)
            return [];
        return [...active].sort((a, b) => {
            const aTime = new Date(a?.createdAt ?? 0).getTime();
            const bTime = new Date(b?.createdAt ?? 0).getTime();
            return bTime - aTime;
        });
    };
    // ── POST /api/subpos/login ─── (no auth required)
    app.post('/login', async (request, reply) => {
        const schema = z.object({
            terminalCode: z.string().min(1).optional(),
            username: z.string().min(1).optional(),
            pin: z.string().min(1).optional(),
            password: z.string().min(1).optional(),
        });
        try {
            const body = schema.parse(request.body);
            const terminalCode = body.terminalCode ?? body.username;
            const pin = body.pin ?? body.password;
            if (!terminalCode || !pin) {
                return reply.status(400).send({ success: false, error: 'terminalCode and pin are required' });
            }
            const terminal = await prisma.subPOSTerminal.findUnique({ where: { terminalCode } });
            if (!terminal || !terminal.isActive) {
                return reply.status(401).send({ success: false, error: 'Invalid credentials or terminal inactive' });
            }
            const valid = await bcrypt.compare(pin, terminal.pin);
            if (!valid)
                return reply.status(401).send({ success: false, error: 'Invalid credentials' });
            const token = await app.jwt.sign({
                terminalId: terminal.id,
                restaurantId: terminal.restaurantId,
                branchId: terminal.branchId,
                type: 'subpos',
                groupIds: terminal.groupIds ? JSON.parse(terminal.groupIds).map(Number) : [],
                username: terminal.name,
            }, { expiresIn: '12h' });
            return {
                success: true,
                data: {
                    token,
                    terminal: {
                        id: terminal.id,
                        name: terminal.name,
                        branchId: terminal.branchId,
                        groupIds: terminal.groupIds ? JSON.parse(terminal.groupIds).map(Number) : [],
                    },
                },
            };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // All routes below require Sub POS auth
    app.addHook('onRequest', subposAuth);
    // ── GET /api/subpos/items ── returns only items in terminal's groupIds
    app.get('/items', async (request) => {
        const restaurantId = request.restaurantId;
        const groupIds = getGroupIds(request.user);
        const items = await prisma.menuItem.findMany({
            where: {
                restaurantId,
                isAvailable: true,
                isDeleted: false,
                ...(groupIds.length > 0 ? { categoryId: { in: groupIds } } : {}),
            },
            include: { 
                category: true, 
                inventoryItem: { include: { inventoryMRPs: { where: { isActive: true }, orderBy: { createdAt: 'desc' } }, unit: true } },
                itemModifiers: { include: { modifierGroup: true } }
            },
            orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
        });
        // enrich inventoryMRPs with computed sellingPrice and parse modifiers
        const enriched = items.map((it) => ({
            ...it,
            inventoryItem: it.inventoryItem
                ? {
                    ...it.inventoryItem,
                    inventoryMRPs: activeMrps(it.inventoryItem.inventoryMRPs || []).map(computeSellingPrice),
                }
                : it.inventoryItem,
            itemModifiers: (it.itemModifiers || []).map((im) => {
                let options = [];
                if (im.modifierGroup) {
                    try {
                        options = typeof im.modifierGroup.options === 'string'
                            ? JSON.parse(im.modifierGroup.options)
                            : (Array.isArray(im.modifierGroup.options) ? im.modifierGroup.options : []);
                    }
                    catch (e) {}
                }
                return {
                    ...im,
                    modifierGroup: im.modifierGroup
                        ? { ...im.modifierGroup, options }
                        : im.modifierGroup
                };
            })
        }));
        return { success: true, data: enriched };
    });
    // ── GET /api/subpos/categories ── only accessible categories
    app.get('/categories', async (request) => {
        const restaurantId = request.restaurantId;
        const groupIds = getGroupIds(request.user);
        const categories = await prisma.itemCategory.findMany({
            where: {
                restaurantId,
                ...(groupIds.length > 0 ? { id: { in: groupIds } } : {}),
            },
            orderBy: { sortOrder: 'asc' },
        });
        return { success: true, data: categories };
    });
    // ── GET /api/subpos/bill-settings ──
    app.get('/bill-settings', async (request) => {
        const restaurantId = request.restaurantId;
        let settings = await prisma.billSettings.findUnique({ where: { restaurantId } });
        const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
        if (!settings) {
            settings = await prisma.billSettings.create({
                data: {
                    restaurantId,
                    showGST: false,
                    showUnitForKOT: false,
                    showUnitForNonKOT: true,
                    loyaltyDiscountFormat: 'small_line',
                    thankYouMessage: 'Thank you for your business!',
                    showTokenNumber: true,
                    showRestaurantInfo: true,
                    showPhoneNumber: true,
                    itemTaxDisplay: 'item_level',
                },
            });
        }
        return {
            success: true,
            data: {
                ...settings,
                upiVpa: settings.upiVpa || settings.upiId || '',
                restaurantName: restaurant?.name || '',
                restaurantAddress: settings.restaurantAddress || restaurant?.address || '',
                restaurantPhone: settings.restaurantPhone || restaurant?.phone || '',
                logoUrl: settings.logoUrl || restaurant?.logo || '',
            }
        };
    });
    // ── GET /api/subpos/customers ──
    app.get('/customers', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { search } = request.query;
        if (!search || search.length < 3)
            return { success: true, data: [] };
        const customers = await prisma.customer.findMany({
            where: {
                restaurantId,
                OR: [
                    { phone: { contains: search } },
                    { name: { contains: search } }
                ]
            },
            take: 10,
        });
        return { success: true, data: customers };
    });
    // ── POST /api/subpos/token/create ── create new BakeryToken + add initial items
    app.post('/token/create', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const branchId = request.branchId;
        const terminalName = request.user?.username ?? 'Sub POS';
        const groupIds = getGroupIds(request.user);
        const schema = z.object({
            tableId: z.number().optional(),
            items: z
                .array(z.object({
                menuItemId: z.number(),
                quantity: z.number().positive(),
                inventoryItemMRPId: z.number().optional(),
                purchaseRate: z.coerce.number().optional(),
                linePrice: z.number().positive().optional(),
                menuItemName: z.string().min(1).optional(),
            }))
                .min(1),
            customerName: z.string().optional(),
            customerPhone: z.string().optional(),
            staffId: z.number().optional(),
        });
        try {
            const body = schema.parse(request.body);
            // 1. Fetch items with categories
            const menuItems = await Promise.all(body.items.map(async (i) => {
                const mi = await prisma.menuItem.findFirst({
                    where: { id: i.menuItemId, restaurantId },
                    include: { category: { include: { group: true } } }
                });
                if (!mi)
                    throw new Error(`Item ${i.menuItemId} not found`);
                if (groupIds.length > 0 && mi.categoryId && !groupIds.includes(mi.categoryId)) {
                    throw new Error(`Item "${mi.name}" is not accessible on this terminal`);
                }
                return {
                    ...mi,
                    requestedQty: Number(i.quantity),
                    selectedLinePrice: i.linePrice ?? null,
                    selectedMenuItemName: i.menuItemName ?? null,
                };
            }));
            const tokenNumber = await getNextTokenNumber(restaurantId, branchId, prisma);
            const qrCode = uuidv4();
            // Resolve customer if phone provided
            let customerId;
            let resolvedCustomerName;
            if (body.customerPhone) {
                const existing = await prisma.customer.findFirst({
                    where: { restaurantId, phone: body.customerPhone },
                });
                if (existing) {
                    customerId = existing.id;
                    resolvedCustomerName = existing.name;
                }
                else {
                    const newCustomer = await prisma.customer.create({
                        data: { restaurantId, name: body.customerName || 'Walk-in', phone: body.customerPhone },
                    });
                    customerId = newCustomer.id;
                    resolvedCustomerName = newCustomer.name;
                }
            }
            // Check for KOT-enabled items
            const kotItems = menuItems.filter((mi) => {
                if (!mi.category)
                    return true;
                if (mi.category.group && typeof mi.category.group.isKOTEnabled === 'boolean') {
                    return Boolean(mi.category.group.isKOTEnabled);
                }
                return Boolean(mi.category.isKOTEnabled);
            });
            const createdKots = [];
            const token = await prisma.$transaction(async (tx) => {
                // Create Bakery Token
                const tok = await tx.bakeryToken.create({
                    data: {
                        restaurantId,
                        branchId,
                        tokenNumber,
                        qrCode,
                        customerName: resolvedCustomerName ?? body.customerName,
                        customerPhone: body.customerPhone,
                        customerId,
                        items: {
                            create: menuItems.map((mi) => {
                                // find the submitted item entry for this menuItem
                                const submitted = (body.items.find((it) => it.menuItemId === mi.id) || {});
                                return {
                                    menuItemId: mi.id,
                                    menuItemName: (submitted.menuItemName || mi.selectedMenuItemName || mi.name),
                                    price: (submitted.linePrice ?? mi.selectedLinePrice ?? mi.price),
                                    quantity: mi.requestedQty,
                                    total: Number(submitted.linePrice ?? mi.selectedLinePrice ?? mi.price) * Number(mi.requestedQty),
                                    addedBy: `subpos:${terminalName}`,
                                    inventoryItemMRPId: submitted.inventoryItemMRPId ?? undefined,
                                    purchaseRate: submitted.purchaseRate ?? undefined,
                                };
                            }),
                        },
                    },
                    include: { items: true },
                });
                // Create Order + KOT if needed
                if (kotItems.length > 0) {
                    const settings = await tx.restaurantSettings.findUnique({ where: { restaurantId } });
                    const subtotal = kotItems.reduce((s, i) => s + (Number(i.price) * normalizeKotQty(Number(i.requestedQty))), 0);
                    const order = await tx.order.create({
                        data: {
                            restaurantId,
                            branchId,
                            tableId: body.tableId ?? null,
                            orderNumber: `${settings?.orderPrefix || 'ORD'}-TEMP`,
                            type: 'token',
                            subtotal,
                            total: subtotal,
                            status: 'running',
                            staffId: body.staffId ?? null,
                        }
                    });
                    // set deterministic orderNumber using DB id
                    const finalOrderNumber = `${settings?.orderPrefix || 'ORD'}-${String(order.id).padStart(5, '0')}`;
                    await tx.order.update({ where: { id: order.id }, data: { orderNumber: finalOrderNumber } });
                    const kot = await tx.kOT.create({
                        data: {
                            orderId: order.id,
                            restaurantId,
                            kotNumber: `${settings?.kotPrefix || 'KOT'}-TEMP`,
                            createdByTerminalId: request.user?.terminalId ?? null,
                            createdByTerminalName: terminalName ?? request.user?.username ?? null,
                            createdByTerminalType: 'subpos',
                            items: {
                                create: kotItems.map(ki => ({
                                    menuItemId: ki.id,
                                    quantity: normalizeKotQty(Number(ki.requestedQty)),
                                    price: ki.price,
                                }))
                            }
                        }
                    });
                    // set deterministic kotNumber
                    const finalKotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kot.id).padStart(5, '0')}`;
                    await tx.kOT.update({ where: { id: kot.id }, data: { kotNumber: finalKotNumber } });
                    await tx.bakeryToken.update({ where: { id: tok.id }, data: { orderId: order.id } });
                    // refresh kot
                    const refreshedKot = await tx.kOT.findUnique({ where: { id: kot.id }, include: { items: { include: { menuItem: true } } } });
                    if (refreshedKot)
                        createdKots.push(refreshedKot.id);
                    // include originating terminal metadata so POS/admin clients can filter
                    emitToRestaurant(restaurantId, 'new_kot', {
                        ...order,
                        kots: [refreshedKot],
                        createdByTerminalId: request.user?.terminalId,
                        createdByTerminalName: terminalName,
                        createdByTerminalType: 'subpos',
                    });
                }
                if (body.tableId) {
                    await tx.table.update({
                        where: { id: body.tableId, restaurantId },
                        data: { status: 'occupied' },
                    });
                }
                return tok;
            });
            await recalculateTokenTotals(token.id, prisma);
            for (const kid of createdKots) {
                try {
                    await applyKOTConsumption(kid, prisma);
                }
                catch (err) {
                    app.log.warn({ err }, `KOT consume failed ${kid}`);
                }
            }
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { where: { isRemoved: false } } },
            });
            emitToRestaurant(restaurantId, 'token_created', { tokenId: token.id, tokenNumber, branchId });
            return {
                success: true,
                data: {
                    tokenId: token.id,
                    tokenNumber,
                    qrCode,
                    qrUrl: `/token/${qrCode}`,
                    token: updated,
                },
            };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/subpos/token/:qr/items ── add item to existing token
    app.post('/token/:qr/items', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const terminalName = request.user?.username ?? 'Sub POS';
        const groupIds = getGroupIds(request.user);
        const schema = z.object({
            menuItemId: z.number(),
            quantity: z.number().positive(),
            inventoryItemMRPId: z.number().optional(),
            purchaseRate: z.coerce.number().optional(),
            linePrice: z.number().positive().optional(),
            menuItemName: z.string().min(1).optional(),
            staffId: z.number().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const token = await prisma.bakeryToken.findFirst({
                where: { qrCode: qr, restaurantId },
            });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            if (token.status !== 'open' && token.status !== 'partial_paid') {
                return reply.status(400).send({ success: false, error: 'Token is already closed' });
            }
            const menuItem = await prisma.menuItem.findFirst({ where: { id: body.menuItemId, restaurantId } });
            if (!menuItem)
                return reply.status(404).send({ success: false, error: 'Item not found' });
            if (groupIds.length > 0 && menuItem.categoryId && !groupIds.includes(menuItem.categoryId)) {
                return reply.status(403).send({ success: false, error: 'Item not accessible on this terminal' });
            }
            if (body.staffId && token.orderId) {
                await prisma.order.update({ where: { id: token.orderId }, data: { staffId: body.staffId } });
            }
            await prisma.bakeryTokenItem.create({
                data: {
                    tokenId: token.id,
                    menuItemId: body.menuItemId,
                    menuItemName: body.menuItemName || menuItem.name,
                    price: body.linePrice ?? menuItem.price,
                    quantity: Number(body.quantity),
                    total: Number(body.linePrice ?? menuItem.price) * Number(body.quantity),
                    addedBy: `subpos:${terminalName}`,
                    inventoryItemMRPId: body.inventoryItemMRPId ?? undefined,
                    purchaseRate: body.purchaseRate ?? undefined,
                },
            });
            await recalculateTokenTotals(token.id, prisma);
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { where: { isRemoved: false } } },
            });
            emitToRestaurant(restaurantId, 'token_updated', updated);
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── GET /api/subpos/token/:qr ── get full token details
    app.get('/token/:qr', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const token = await prisma.bakeryToken.findFirst({
            where: { qrCode: qr, restaurantId },
            include: {
                items: { where: { isRemoved: false }, include: { menuItem: true } },
                payments: true,
                edits: true,
            },
        });
        if (!token)
            return reply.status(404).send({ success: false, error: 'Token not found' });
        return { success: true, data: token };
    });
    // ── POST /api/subpos/token/lookup ── find token by QR or number
    app.post('/token/lookup', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const schema = z.object({
            qrCode: z.string().optional(),
            tokenNumber: z.number().optional(),
        }).refine((d) => d.qrCode || d.tokenNumber, { message: 'Provide qrCode or tokenNumber' });
        try {
            const body = schema.parse(request.body);
            const where = { restaurantId };
            if (body.qrCode)
                where.qrCode = body.qrCode;
            else {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                where.tokenNumber = body.tokenNumber;
                where.createdAt = { gte: todayStart };
            }
            const token = await prisma.bakeryToken.findFirst({
                where,
                include: {
                    items: { include: { menuItem: true } },
                    payments: true,
                    edits: true,
                    customer: true,
                },
                orderBy: { createdAt: 'desc' },
            });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            return { success: true, data: token };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/subpos/token/:qr/customer ── attach customer to token
    app.post('/token/:qr/customer', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const schema = z.object({
            customerName: z.string().optional(),
            customerPhone: z.string().min(1),
        });
        try {
            const body = schema.parse(request.body);
            const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            const previouslyHadCustomer = Boolean(token.customerId);
            let customerId = token.customerId ?? undefined;
            let resolvedCustomerName = body.customerName;
            const existing = await prisma.customer.findFirst({ where: { restaurantId, phone: body.customerPhone } });
            if (existing) {
                customerId = existing.id;
                resolvedCustomerName = existing.name;
            }
            else {
                const newC = await prisma.customer.create({
                    data: { restaurantId, name: body.customerName || 'Walk-in', phone: body.customerPhone },
                });
                customerId = newC.id;
                resolvedCustomerName = newC.name;
            }
            let updated = await prisma.bakeryToken.update({
                where: { id: token.id },
                data: { customerName: resolvedCustomerName, customerPhone: body.customerPhone, customerId },
                include: { items: { include: { menuItem: true } }, payments: true, customer: true },
            });
            // Retroactive awarding if token already paid and customer was not previously attached
            if (!previouslyHadCustomer && updated.status === 'paid' && customerId) {
                try {
                    const tokenTotal = Number(updated.total || 0);
                    const totalPaid = (updated.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
                    // increment orders
                    await prisma.customer.update({ where: { id: customerId }, data: { totalOrders: { increment: 1 } } });
                    const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
                    if (loyaltyProgram?.isActive) {
                        const rupeesPerPoint = Number(loyaltyProgram?.rupeesPerPoint ?? 100);
                        const pointsEarned = rupeesPerPoint > 0 ? Math.floor(tokenTotal / rupeesPerPoint) : 0;
                        if (pointsEarned > 0) {
                            await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: pointsEarned } } });
                            await prisma.loyaltyTransaction.create({ data: { customerId, restaurantId, loyaltyProgramId: loyaltyProgram.id, type: 'earned', points: pointsEarned, note: `Retroactive Token #${updated.tokenNumber}` } });
                            await prisma.bakeryToken.update({ where: { id: updated.id }, data: { loyaltyPointsEarned: pointsEarned } });
                            updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
                            emitToRestaurant(restaurantId, 'token_updated', updated);
                            emitToRestaurant(restaurantId, 'customer_display_payment_ok', { customerName: updated.customerName, pointsEarned, paid: totalPaid, due: Math.max(0, tokenTotal - totalPaid) });
                        }
                        else {
                            updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
                            emitToRestaurant(restaurantId, 'token_updated', updated);
                        }
                    }
                    else {
                        updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
                        emitToRestaurant(restaurantId, 'token_updated', updated);
                    }
                }
                catch (err) {
                    app.log.warn({ err }, 'Retroactive loyalty awarding failed (subpos)');
                }
            }
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── GET /api/subpos/tokens-today ── counter for today
    app.get('/tokens-today', async (request) => {
        const restaurantId = request.restaurantId;
        const branchId = request.branchId;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const count = await prisma.bakeryToken.count({
            where: { restaurantId, branchId, createdAt: { gte: todayStart } },
        });
        return { success: true, data: { count } };
    });
    // ── GET /api/subpos/today-orders ── all today's tokens for this branch
    app.get('/today-orders', async (request) => {
        const restaurantId = request.restaurantId;
        const branchId = request.branchId;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tokens = await prisma.bakeryToken.findMany({
            where: { restaurantId, branchId, createdAt: { gte: todayStart } },
            orderBy: { tokenNumber: 'desc' },
            include: {
                items: {
                    where: { isRemoved: false },
                    select: {
                        id: true,
                        menuItemName: true,
                        price: true,
                        quantity: true,
                        total: true,
                        isRemoved: true,
                    },
                },
                payments: {
                    select: { id: true, amount: true, method: true, paidAt: true },
                    orderBy: { paidAt: 'desc' },
                },
            },
        });
        return { success: true, data: tokens };
    });
}
