import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../app.js';
import { mainposAuth } from '../../middleware/posAuth.js';
import { getNextTokenNumber } from '../../utils/tokenCounter.js';
import { recalculateTokenTotals } from '../../utils/taxCalculator.js';
import { applyKOTConsumption } from '../../utils/inventory.js';
import { emitToRestaurant } from '../../plugins/socket.js';
export async function mainposRoutes(app) {
    const normalizeKotQty = (qty) => Math.max(1, Math.round(Number(qty || 0)));
    const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '').trim();
    const getPhoneVariants = (value) => {
        const raw = String(value ?? '').trim();
        const digits = normalizePhone(raw);
        const set = new Set();
        if (raw)
            set.add(raw);
        if (digits) {
            set.add(digits);
            set.add(`+${digits}`);
            if (digits.length === 10) {
                set.add(`91${digits}`);
                set.add(`+91${digits}`);
            }
            if (digits.length > 10) {
                const last10 = digits.slice(-10);
                set.add(last10);
                set.add(`91${last10}`);
                set.add(`+91${last10}`);
            }
        }
        return Array.from(set).filter(Boolean);
    };
    const findCustomerByPhone = async (restaurantId, phone) => {
        const variants = getPhoneVariants(phone);
        if (variants.length === 0)
            return null;
        return prisma.customer.findFirst({
            where: {
                restaurantId,
                OR: variants.map((p) => ({ phone: { equals: p } })),
            },
            orderBy: { createdAt: 'desc' },
        });
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
    // ── POST /api/mainpos/login ── (no auth required)
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
                return reply.status(400).send({ success: false, error: 'terminalCode/username and pin/password are required' });
            }
            const terminal = await prisma.mainPOSTerminal.findUnique({ where: { terminalCode } });
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
                type: 'mainpos',
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
                    },
                },
            };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/:qr/present ── present token on customer displays (broadcast)
    app.post('/token/:qr/present', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        try {
            const token = await prisma.bakeryToken.findFirst({
                where: { qrCode: qr, restaurantId },
                include: { items: { include: { menuItem: true } }, customer: true },
            });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            // Map items with images to be sent directly to display
            const items = token.items.map((it) => ({
                id: it.id,
                menuItemId: it.menuItemId,
                name: it.menuItemName,
                price: Number(it.price),
                quantity: it.quantity,
                image: it.menuItem?.image ?? null,
            }));
            // small customer summary for display clients
            const customerSummary = token.customer ? {
                id: token.customer.id,
                name: token.customer.name,
                phone: token.customer.phone,
                loyaltyPoints: Number(token.customer.loyaltyPoints || 0),
                totalOrders: Number(token.customer.totalOrders || 0),
            } : null;
            emitToRestaurant(restaurantId, 'customer_display_show_bill', {
                tokenId: token.id,
                tokenNumber: token.tokenNumber,
                customerName: token.customerName,
                customerPhone: token.customerPhone,
                customer: customerSummary,
                items,
                subtotal: Number(token.subtotal),
                sgst: Number(token.sgst),
                cgst: Number(token.cgst),
                total: Number(token.total),
            });
            return { success: true, data: { tokenNumber: token.tokenNumber } };
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/present ── present ephemeral cart to customer displays without creating a token
    app.post('/token/present', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const schema = z.object({
            items: z.array(z.object({
                menuItemId: z.number(),
                name: z.string().optional(),
                price: z.number(),
                quantity: z.number(),
                image: z.string().optional().nullable(),
            })),
            subtotal: z.number().optional(),
            sgst: z.number().optional(),
            cgst: z.number().optional(),
            total: z.number().optional(),
            customerName: z.string().optional(),
            customerPhone: z.string().optional(),
        });
        try {
            const body = schema.parse(request.body);
            emitToRestaurant(restaurantId, 'customer_display_show_bill', {
                ephemeral: true,
                items: body.items,
                subtotal: body.subtotal ?? body.items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0),
                sgst: body.sgst ?? 0,
                cgst: body.cgst ?? 0,
                total: body.total ?? 0,
                customerName: body.customerName,
                customerPhone: body.customerPhone,
            });
            return { success: true, data: { presented: true } };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // All routes below require Main POS auth
    app.addHook('onRequest', mainposAuth);
    // ── GET /api/mainpos/loyalty-config ──
    app.get('/loyalty-config', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const config = await prisma.loyaltyProgram.findUnique({
            where: { restaurantId },
        });
        return { success: true, data: config };
    });
    // ── GET /api/mainpos/bill-settings ──
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
    // ── GET /api/mainpos/kots ── held KOT history for the current Main POS terminal
    app.get('/kots', async (request) => {
        const restaurantId = request.restaurantId;
        const terminalId = request.user?.terminalId;
        const { status, page = 1, limit = 50, includeUnassigned = 'true', dateFilter = 'today', dateFrom, dateTo, } = request.query;
        const includeUnassignedKots = String(includeUnassigned).toLowerCase() !== 'false';
        const where = { restaurantId };
        // Show KOTs created by this terminal and optionally customer/unassigned KOTs
        // so MainPOS can view customer-origin orders as well.
        if (terminalId) {
            where.OR = includeUnassignedKots
                ? [{ createdByTerminalId: terminalId }, { createdByTerminalId: null }]
                : [{ createdByTerminalId: terminalId }];
        }
        if (status)
            where.status = status;
        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const tomorrowStart = new Date(todayStart);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const yesterdayStart = new Date(todayStart);
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        const normalizedDateFilter = String(dateFilter || 'today').toLowerCase();
        if (normalizedDateFilter === 'today') {
            where.createdAt = { gte: todayStart, lt: tomorrowStart };
        }
        else if (normalizedDateFilter === 'yesterday') {
            where.createdAt = { gte: yesterdayStart, lt: todayStart };
        }
        else if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) {
                const from = new Date(dateFrom);
                if (!Number.isNaN(from.getTime()))
                    where.createdAt.gte = from;
            }
            if (dateTo) {
                const to = new Date(dateTo);
                if (!Number.isNaN(to.getTime()))
                    where.createdAt.lte = to;
            }
            if (Object.keys(where.createdAt).length === 0) {
                delete where.createdAt;
            }
        }
        const kots = await prisma.kOT.findMany({
            where,
            include: {
                items: { include: { menuItem: true } },
                order: { include: { table: true, staff: { select: { name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
        });
        return { success: true, data: kots };
    });
    // ── GET /api/mainpos/items ── all items (Main POS sees everything)
    app.get('/items', async (request) => {
        const restaurantId = request.restaurantId;
        const items = await prisma.menuItem.findMany({
            where: { restaurantId, isAvailable: true, isDeleted: false },
            include: { 
                category: true, 
                inventoryItem: { include: { inventoryMRPs: { where: { isActive: true }, orderBy: { createdAt: 'desc' } } } },
                itemModifiers: { include: { modifierGroup: true } }
            },
            orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
        });
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
    // ── GET /api/mainpos/customers ──
    app.get('/customers', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { search } = request.query;
        const rawSearch = String(search ?? '').trim();
        const numericSearch = normalizePhone(rawSearch);
        if ((!rawSearch || rawSearch.length < 3) && numericSearch.length < 3)
            return { success: true, data: [] };
        const phoneCandidates = getPhoneVariants(rawSearch);
        const customers = await prisma.customer.findMany({
            where: {
                restaurantId,
                OR: [
                    { name: { contains: rawSearch } },
                    { phone: { contains: rawSearch } },
                    ...(numericSearch ? [{ phone: { contains: numericSearch } }] : []),
                    ...phoneCandidates.map((p) => ({ phone: { equals: p } })),
                ],
            },
            take: 10,
        });
        const normalized = customers.map((c) => ({
            ...c,
            loyaltyPoints: Number(c.loyaltyPoints || 0),
            totalOrders: Number(c.totalOrders || 0),
        }));
        return { success: true, data: normalized };
    });
    // ── GET /api/mainpos/categories ── all categories
    app.get('/categories', async (request) => {
        const restaurantId = request.restaurantId;
        const categories = await prisma.itemCategory.findMany({
            where: { restaurantId },
            orderBy: { sortOrder: 'asc' },
        });
        return { success: true, data: categories };
    });
    // ── POST /api/mainpos/token/lookup ── find token by QR or number
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
    // ── GET /api/mainpos/token/:qr ── full token details
    app.get('/token/:qr', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const token = await prisma.bakeryToken.findFirst({
            where: { qrCode: qr, restaurantId },
            include: {
                items: { include: { menuItem: true } },
                payments: true,
                edits: true,
                customer: true,
            },
        });
        if (!token)
            return reply.status(404).send({ success: false, error: 'Token not found' });
        return { success: true, data: token };
    });
    // ── POST /api/mainpos/token/create ──
    app.post('/token/create', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const branchId = request.branchId;
        const terminalName = request.user?.username ?? 'Main POS';
        const schema = z.object({
            items: z.array(z.object({
                menuItemId: z.number(),
                quantity: z.number().positive(),
                inventoryItemMRPId: z.number().optional(),
                purchaseRate: z.coerce.number().optional(),
                linePrice: z.number().positive().optional(),
                menuItemName: z.string().min(1).optional(),
            })).min(1),
            customerName: z.string().optional(),
            customerPhone: z.string().optional(),
            staffId: z.number().optional(),
            orderId: z.number().optional(),
            tableId: z.number().optional(),
            chairNumbers: z.array(z.number()).optional(),
            isEntireTable: z.boolean().optional(),
        });
        try {
            const body = schema.parse(request.body);
            // Fetch items with categories
            const menuItems = await Promise.all(body.items.map(async (i) => {
                const mi = await prisma.menuItem.findFirst({
                    where: { id: i.menuItemId, restaurantId, isDeleted: false },
                    include: { category: true, inventoryItem: { include: { inventoryMRPs: { orderBy: { createdAt: 'desc' } } } } }
                });
                if (!mi)
                    throw new Error(`Item ${i.menuItemId} not found`);
                return {
                    ...mi,
                    requestedQty: Number(i.quantity),
                    selectedMRPId: i.inventoryItemMRPId ?? null,
                    selectedPurchaseRate: i.purchaseRate ?? null,
                    selectedLinePrice: i.linePrice ?? null,
                    selectedMenuItemName: i.menuItemName ?? null,
                };
            }));
            const tokenNumber = await getNextTokenNumber(restaurantId, branchId, prisma);
            const qrCode = uuidv4();
            let customerId;
            let resolvedCustomerName;
            if (body.customerPhone) {
                const normalizedPhone = normalizePhone(body.customerPhone);
                if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
                    return reply.status(400).send({ success: false, error: 'Invalid customer phone number' });
                }
                const canonicalPhone = normalizedPhone;
                const existing = await findCustomerByPhone(restaurantId, body.customerPhone);
                if (existing) {
                    customerId = existing.id;
                    resolvedCustomerName = existing.name;
                }
                else {
                    const newCustomer = await prisma.customer.create({
                        data: { restaurantId, name: body.customerName || 'Walk-in', phone: canonicalPhone },
                    });
                    customerId = newCustomer.id;
                    resolvedCustomerName = newCustomer.name;
                }
            }
            const kotItems = menuItems.filter(mi => !mi.category || mi.category.isKOTEnabled);
            const createdKots = [];
            const token = await prisma.$transaction(async (tx) => {
                const tok = await tx.bakeryToken.create({
                    data: {
                        restaurantId,
                        branchId,
                        tokenNumber,
                        qrCode,
                        customerName: resolvedCustomerName ?? body.customerName,
                        customerPhone: body.customerPhone ? normalizePhone(body.customerPhone) : undefined,
                        customerId,
                        items: {
                            create: menuItems.map((mi) => ({
                                menuItemId: mi.id,
                                menuItemName: mi.selectedMenuItemName || mi.name,
                                price: mi.selectedLinePrice ?? mi.price,
                                quantity: mi.requestedQty,
                                total: Number(mi.selectedLinePrice ?? mi.price) * Number(mi.requestedQty),
                                addedBy: `mainpos:${terminalName}`,
                                inventoryItemMRPId: mi.selectedMRPId ?? undefined,
                                purchaseRate: mi.selectedPurchaseRate ?? undefined,
                            })),
                        },
                    },
                    include: { items: true, customer: true, payments: true },
                });

                let linkedOrderId = body.orderId ? Number(body.orderId) : null;
                if (linkedOrderId) {
                    await tx.bakeryToken.update({ where: { id: tok.id }, data: { orderId: linkedOrderId } });
                    if (body.tableId) {
                        await tx.order.update({
                            where: { id: linkedOrderId },
                            data: { tableId: Number(body.tableId) }
                        });
                    }
                } else if (kotItems.length > 0) {
                    const settings = await tx.restaurantSettings.findUnique({ where: { restaurantId } });
                    const subtotal = kotItems.reduce((s, i) => s + (Number(i.price) * normalizeKotQty(Number(i.requestedQty))), 0);
                    const order = await tx.order.create({
                        data: {
                            restaurantId,
                            branchId,
                            orderNumber: `${settings?.orderPrefix || 'ORD'}-TEMP`,
                            type: 'token',
                            tableId: body.tableId ? Number(body.tableId) : null,
                            subtotal,
                            total: subtotal,
                            status: 'running',
                            staffId: body.staffId ?? null,
                        }
                    });
                    linkedOrderId = order.id;
                    const finalOrderNumber = `${settings?.orderPrefix || 'ORD'}-${String(order.id).padStart(5, '0')}`;
                    await tx.order.update({ where: { id: order.id }, data: { orderNumber: finalOrderNumber } });
                    const kot = await tx.kOT.create({
                        data: {
                            orderId: order.id,
                            restaurantId,
                            kotNumber: `${settings?.kotPrefix || 'KOT'}-TEMP`,
                            createdByTerminalId: request.user?.terminalId ?? null,
                            createdByTerminalName: terminalName ?? request.user?.username ?? null,
                            createdByTerminalType: 'mainpos',
                            items: {
                                create: kotItems.map(ki => ({
                                    menuItemId: ki.id,
                                    quantity: normalizeKotQty(Number(ki.requestedQty)),
                                    price: ki.price,
                                }))
                            }
                        }
                    });
                    const finalKotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kot.id).padStart(5, '0')}`;
                    await tx.kOT.update({ where: { id: kot.id }, data: { kotNumber: finalKotNumber } });
                    await tx.bakeryToken.update({ where: { id: tok.id }, data: { orderId: order.id } });
                    const refreshedKot = await tx.kOT.findUnique({ where: { id: kot.id }, include: { items: { include: { menuItem: true } } } });
                    if (refreshedKot)
                        createdKots.push(refreshedKot.id);
                    emitToRestaurant(restaurantId, 'new_kot', {
                        ...order,
                        kots: [refreshedKot],
                        createdByTerminalId: request.user?.terminalId,
                        createdByTerminalName: terminalName,
                        createdByTerminalType: 'mainpos',
                    });
                }
                return tok;
            });
            await recalculateTokenTotals(token.id, prisma);
            // Apply inventory consumption for created KOTs (best-effort)
            for (const kid of createdKots) {
                try {
                    await applyKOTConsumption(kid, prisma);
                }
                catch (err) {
                    app.log.warn({ err }, `Failed to apply inventory consumption for KOT ${kid}`);
                }
            }
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { where: { isRemoved: false } }, payments: true, customer: true },
            });
            emitToRestaurant(restaurantId, 'token_created', { tokenId: token.id, tokenNumber, branchId });
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/:qr/items/bulk ── add multiple items
    app.post('/token/:qr/items/bulk', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const terminalName = request.user?.username ?? 'Main POS';
        const schema = z.object({
            items: z.array(z.object({
                menuItemId: z.number(),
                quantity: z.number().positive(),
                inventoryItemMRPId: z.number().optional(),
                purchaseRate: z.coerce.number().optional(),
                linePrice: z.number().positive().optional(),
                menuItemName: z.string().min(1).optional(),
            })).min(1),
            staffId: z.number().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const token = await prisma.bakeryToken.findFirst({
                where: { qrCode: qr, restaurantId },
                include: { order: true }
            });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            if (token.status === 'paid' || token.status === 'cancelled') {
                return reply.status(400).send({ success: false, error: 'Token is already closed' });
            }
            const itemsToCreate = [];
            const kotItemsData = [];
            for (const i of body.items) {
                const mi = await prisma.menuItem.findFirst({
                    where: { id: i.menuItemId, restaurantId, isDeleted: false },
                    include: { category: true, inventoryItem: { include: { inventoryMRPs: { orderBy: { createdAt: 'desc' } } } } }
                });
                if (mi) {
                    itemsToCreate.push({
                        tokenId: token.id,
                        menuItemId: i.menuItemId,
                        menuItemName: i.menuItemName || mi.name,
                        price: i.linePrice ?? mi.price,
                        quantity: Number(i.quantity),
                        total: Number(i.linePrice ?? mi.price) * Number(i.quantity),
                        addedBy: `mainpos:${terminalName}`,
                        inventoryItemMRPId: i.inventoryItemMRPId ?? undefined,
                        purchaseRate: i.purchaseRate ?? undefined,
                    });
                    if (!mi.category || mi.category.isKOTEnabled) {
                        kotItemsData.push({
                            menuItemId: mi.id,
                            quantity: normalizeKotQty(Number(i.quantity)),
                            price: mi.price,
                        });
                    }
                }
            }
            const createdKotsBulk = [];
            await prisma.$transaction(async (tx) => {
                if (itemsToCreate.length > 0) {
                    await tx.bakeryTokenItem.createMany({ data: itemsToCreate });
                }
                if (kotItemsData.length > 0) {
                    const settings = await tx.restaurantSettings.findUnique({ where: { restaurantId } });
                    let orderId = token.orderId;
                    if (!orderId) {
                        const subtotal = kotItemsData.reduce((s, i) => s + (Number(i.price) * Number(i.quantity)), 0);
                        const order = await tx.order.create({ data: { restaurantId, branchId: token.branchId, orderNumber: `${settings?.orderPrefix || 'ORD'}-TEMP`, type: 'token', subtotal, total: subtotal, status: 'running', staffId: body.staffId ?? null } });
                        const finalOrderNumber = `${settings?.orderPrefix || 'ORD'}-${String(order.id).padStart(5, '0')}`;
                        await tx.order.update({ where: { id: order.id }, data: { orderNumber: finalOrderNumber } });
                        orderId = order.id;
                        await tx.bakeryToken.update({ where: { id: token.id }, data: { orderId } });
                    } else if (body.staffId) {
                        await tx.order.update({ where: { id: orderId }, data: { staffId: body.staffId } });
                    }
                    const kot = await tx.kOT.create({
                        data: {
                            orderId,
                            restaurantId,
                            kotNumber: `${settings?.kotPrefix || 'KOT'}-TEMP`,
                            createdByTerminalId: request.user?.terminalId ?? null,
                            createdByTerminalName: terminalName ?? request.user?.username ?? null,
                            createdByTerminalType: 'mainpos',
                            items: { create: kotItemsData }
                        },
                        include: { items: { include: { menuItem: true } } }
                    });
                    const finalKotNumber = `${settings?.kotPrefix || 'KOT'}-${String(kot.id).padStart(5, '0')}`;
                    await tx.kOT.update({ where: { id: kot.id }, data: { kotNumber: finalKotNumber } });
                    // capture created kot id for post-transaction inventory consumption
                    if (kot?.id)
                        createdKotsBulk.push(kot.id);
                    emitToRestaurant(restaurantId, 'new_kot', {
                        id: orderId,
                        kots: [kot],
                        createdByTerminalId: request.user?.terminalId,
                        createdByTerminalName: terminalName,
                        createdByTerminalType: 'mainpos',
                    });
                }
            });
            await recalculateTokenTotals(token.id, prisma);
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { include: { menuItem: true } }, payments: true, customer: true },
            });
            emitToRestaurant(restaurantId, 'token_updated', updated);
            // apply inventory consumption for bulk-created KOTs
            for (const kid of createdKotsBulk) {
                try {
                    await applyKOTConsumption(kid, prisma);
                }
                catch (err) {
                    app.log.warn({ err }, `KOT consume failed ${kid}`);
                }
            }
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/:qr/items ── add item to token
    app.post('/token/:qr/items', async (request, reply) => {
        // TODO: implement adding item to token
        return reply.status(501).send({ success: false, error: 'Not implemented' });
    });
    // ── POST /api/mainpos/token/:qr/merge-order ── Waiter merges table order
    app.post('/token/:qr/merge-order', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const terminalName = request.user?.username ?? 'System';
        const schema = z.object({ orderId: z.number() });
        try {
            const { orderId } = schema.parse(request.body);
            const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
            if (!token || token.status === 'paid' || token.status === 'cancelled') {
                return reply.status(400).send({ success: false, error: 'Invalid or closed token' });
            }
            const order = await prisma.order.findUnique({
                where: { id: orderId, restaurantId },
                include: { kots: { include: { items: { include: { menuItem: true } } } } }
            });
            if (!order)
                return reply.status(404).send({ success: false, error: 'Order not found' });
            // Extract all valid kot items
            const newItems = [];
            for (const kot of order.kots) {
                for (const item of kot.items) {
                    if (item.status !== 'cancelled') {
                        newItems.push({
                            tokenId: token.id,
                            menuItemId: item.menuItemId,
                            menuItemName: item.menuItem.name,
                            price: item.price,
                            quantity: item.quantity,
                            total: Number(item.price) * item.quantity,
                            addedBy: `waiter:${order.tableId || orderId}`,
                        });
                    }
                }
            }
            await prisma.$transaction(async (tx) => {
                if (newItems.length > 0) {
                    await tx.bakeryTokenItem.createMany({ data: newItems });
                }
                await tx.order.update({
                    where: { id: order.id },
                    data: { status: 'merged_to_token' },
                });
                if (order.tableId) {
                    await tx.table.update({ where: { id: order.tableId }, data: { status: 'available' } });
                }
            });
            await recalculateTokenTotals(token.id, prisma);
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { include: { menuItem: true } }, payments: true },
            });
            emitToRestaurant(restaurantId, 'token_updated', updated);
            emitToRestaurant(restaurantId, 'order_updated', { orderId: order.id, status: 'merged_to_token' });
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── DELETE /api/mainpos/token/:qr/items/:itemId ── soft-delete with password + reason
    app.delete('/token/:qr/items/:itemId', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr, itemId } = request.params;
        const terminalName = request.user?.username ?? 'Main POS';
        const schema = z.object({
            adminPassword: z.string().min(1),
            reason: z.string().min(1),
        });
        try {
            const body = schema.parse(request.body);
            // Verify POS delete password
            const settings = await prisma.restaurantSettings.findFirst({ where: { restaurantId } });
            if (!settings?.posDeletePassword) {
                return reply.status(403).send({ success: false, error: 'POS delete password not configured' });
            }
            const isValid = await bcrypt.compare(body.adminPassword, settings.posDeletePassword);
            if (!isValid)
                return reply.status(403).send({ success: false, error: 'Incorrect password' });
            const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            const item = await prisma.bakeryTokenItem.findFirst({
                where: { id: Number(itemId), tokenId: token.id, isRemoved: false },
            });
            if (!item)
                return reply.status(404).send({ success: false, error: 'Item not found or already removed' });
            // Soft delete only
            await prisma.bakeryTokenItem.update({
                where: { id: item.id },
                data: { isRemoved: true, removedAt: new Date(), removedBy: terminalName, removeReason: body.reason },
            });
            // Log edit
            await prisma.auditLog.create({
                data: {
                    restaurantId,
                    branchId: token.branchId,
                    action: 'DELETE_ITEM',
                    reason: body.reason,
                    referenceId: token.tokenNumber.toString(),
                    details: JSON.stringify({
                        tokenId: token.id,
                        menuItemName: item.menuItemName,
                        oldQty: item.quantity,
                        newQty: 0,
                        staffUsername: terminalName,
                    }),
                },
            });
            await recalculateTokenTotals(token.id, prisma);
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { include: { menuItem: true } }, payments: true },
            });
            emitToRestaurant(restaurantId, 'token_updated', updated);
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── PUT /api/mainpos/token/:qr/items/:itemId ── edit quantity with password + reason
    app.put('/token/:qr/items/:itemId', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr, itemId } = request.params;
        const terminalName = request.user?.username ?? 'Main POS';
        const schema = z.object({
            quantity: z.number().positive(),
            adminPassword: z.string().min(1),
            reason: z.string().min(1),
        });
        try {
            const body = schema.parse(request.body);
            const settings = await prisma.restaurantSettings.findFirst({ where: { restaurantId } });
            if (!settings?.posDeletePassword) {
                return reply.status(403).send({ success: false, error: 'POS delete password not configured' });
            }
            const isValid = await bcrypt.compare(body.adminPassword, settings.posDeletePassword);
            if (!isValid)
                return reply.status(403).send({ success: false, error: 'Incorrect password' });
            const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            const item = await prisma.bakeryTokenItem.findFirst({
                where: { id: Number(itemId), tokenId: token.id, isRemoved: false },
            });
            if (!item)
                return reply.status(404).send({ success: false, error: 'Item not found' });
            const oldQty = item.quantity;
            const newTotal = Number(item.price) * body.quantity;
            await prisma.bakeryTokenItem.update({
                where: { id: item.id },
                data: { quantity: body.quantity, total: newTotal },
            });
            await prisma.auditLog.create({
                data: {
                    restaurantId,
                    branchId: token.branchId,
                    action: 'EDIT_ITEM_QTY',
                    reason: body.reason,
                    referenceId: token.tokenNumber.toString(),
                    details: JSON.stringify({
                        tokenId: token.id,
                        menuItemName: item.menuItemName,
                        oldQty: oldQty,
                        newQty: body.quantity,
                        staffUsername: terminalName,
                    }),
                },
            });
            await recalculateTokenTotals(token.id, prisma);
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { include: { menuItem: true } }, payments: true },
            });
            emitToRestaurant(restaurantId, 'token_updated', updated);
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/:qr/customer ── attach customer
    app.post('/token/:qr/customer', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const schema = z.object({
            customerName: z.string().optional(),
            customerPhone: z.string().min(1),
        });
        try {
            const body = schema.parse(request.body);
            const normalizedPhone = normalizePhone(body.customerPhone);
            if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
                return reply.status(400).send({ success: false, error: 'Invalid customer phone number' });
            }
            const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            const previouslyHadCustomer = Boolean(token.customerId);
            let customerId = token.customerId ?? undefined;
            let resolvedCustomerName = body.customerName;
            const existing = await findCustomerByPhone(restaurantId, body.customerPhone);
            if (existing) {
                customerId = existing.id;
                resolvedCustomerName = existing.name;
            }
            else {
                const newC = await prisma.customer.create({
                    data: { restaurantId, name: body.customerName || 'Walk-in', phone: normalizedPhone },
                });
                customerId = newC.id;
                resolvedCustomerName = newC.name;
            }
            // Attach customer to token
            let updated = await prisma.bakeryToken.update({
                where: { id: token.id },
                data: {
                    customerName: resolvedCustomerName,
                    customerPhone: normalizedPhone,
                    customerId,
                },
                include: { items: { include: { menuItem: true } }, payments: true, customer: true },
            });
            // If token was already paid and previously had no customer, award retroactive order count and loyalty points
            if (!previouslyHadCustomer && updated.status === 'paid' && customerId) {
                try {
                    const tokenTotal = Number(updated.total || 0);
                    const totalPaid = (updated.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
                    // Always increment totalOrders for retroactive attachment
                    await prisma.customer.update({ where: { id: customerId }, data: { totalOrders: { increment: 1 } } });
                    // Award loyalty points if program active
                    const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
                    if (loyaltyProgram?.isActive) {
                        const rupeesPerPoint = Number(loyaltyProgram?.rupeesPerPoint ?? 100);
                        const pointsEarned = rupeesPerPoint > 0 ? Math.floor(tokenTotal / rupeesPerPoint) : 0;
                        if (pointsEarned > 0) {
                            await prisma.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: pointsEarned } } });
                            await prisma.loyaltyTransaction.create({
                                data: {
                                    customerId,
                                    restaurantId,
                                    loyaltyProgramId: loyaltyProgram.id,
                                    type: 'earned',
                                    points: pointsEarned,
                                    note: `Retroactive Token #${updated.tokenNumber}`,
                                },
                            });
                            await prisma.bakeryToken.update({ where: { id: updated.id }, data: { loyaltyPointsEarned: pointsEarned } });
                            // Refresh updated token with customer info
                            updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
                            // Notify displays about earned points and updated token
                            emitToRestaurant(restaurantId, 'token_updated', updated);
                            emitToRestaurant(restaurantId, 'customer_display_payment_ok', {
                                customerName: updated.customerName,
                                pointsEarned,
                                paid: totalPaid,
                                due: Math.max(0, tokenTotal - totalPaid),
                            });
                        }
                        else {
                            // No points but still update token view
                            updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
                            emitToRestaurant(restaurantId, 'token_updated', updated);
                        }
                    }
                    else {
                        // Loyalty disabled: just refresh token and emit update
                        updated = await prisma.bakeryToken.findUniqueOrThrow({ where: { id: updated.id }, include: { items: { include: { menuItem: true } }, payments: true, customer: true } });
                        emitToRestaurant(restaurantId, 'token_updated', updated);
                    }
                }
                catch (err) {
                    app.log.warn({ err }, 'Retroactive loyalty awarding failed');
                }
            }
            else {
                // Normal path: simply present updated token to displays
                emitToRestaurant(restaurantId, 'customer_display_show_bill', {
                    tokenId: token.id,
                    tokenNumber: token.tokenNumber,
                    customerName: updated.customerName,
                    total: Number(updated.total),
                });
            }
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/:qr/loyalty/claim ── claim loyalty points for discount
    app.post('/token/:qr/loyalty/claim', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const schema = z.object({
            customerId: z.number(),
            pointsToClaim: z.number().min(1),
        });
        try {
            const body = schema.parse(request.body);
            const token = await prisma.bakeryToken.findFirst({ where: { qrCode: qr, restaurantId } });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            if (token.status === 'paid') {
                return reply.status(400).send({ success: false, error: 'Cannot claim points on a paid token' });
            }
            const customer = await prisma.customer.findFirst({ where: { id: body.customerId, restaurantId } });
            if (!customer)
                return reply.status(404).send({ success: false, error: 'Customer not found' });
            if (customer.loyaltyPoints < body.pointsToClaim) {
                return reply.status(400).send({ success: false, error: 'Insufficient loyalty points' });
            }
            const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
            if (!loyaltyProgram || !loyaltyProgram.isActive) {
                return reply.status(400).send({ success: false, error: 'Loyalty program is disabled' });
            }
            if (body.pointsToClaim < Number(loyaltyProgram.minClaimPoints || 0)) {
                return reply.status(400).send({ success: false, error: `Minimum ${loyaltyProgram.minClaimPoints} points required to redeem` });
            }
            const maxClaimPercent = Number(loyaltyProgram.maxClaimPercent || 100);
            // Each point gives discount proportional to earn rate: (1 point / rupeesPerPoint) * bill = discount fraction
            const rupeesPerPoint = Number(loyaltyProgram?.rupeesPerPoint ?? 100);
            const discountPerPoint = rupeesPerPoint > 0 ? (1 / rupeesPerPoint) : 0;
            const discountPct = Math.min(body.pointsToClaim * discountPerPoint * 100, maxClaimPercent);
            const discount = Math.round((discountPct / 100) * Number(token.total) * 100) / 100;
            const maxDiscountValue = (Number(token.total) * maxClaimPercent) / 100;
            if (discount > maxDiscountValue) {
                return reply.status(400).send({ success: false, error: `Maximum redemption allowed is ${maxClaimPercent}% of the bill (₹${maxDiscountValue.toFixed(2)})` });
            }
            await prisma.bakeryToken.update({
                where: { id: token.id },
                data: {
                    discountApplied: { increment: discount },
                    loyaltyPointsClaimed: { increment: body.pointsToClaim },
                    customerId: body.customerId,
                    customerName: customer.name,
                    customerPhone: customer.phone || token.customerPhone,
                },
            });
            await prisma.customer.update({
                where: { id: body.customerId },
                data: { loyaltyPoints: { decrement: body.pointsToClaim } },
            });
            if (loyaltyProgram) {
                await prisma.loyaltyTransaction.create({
                    data: {
                        customerId: body.customerId,
                        restaurantId,
                        loyaltyProgramId: loyaltyProgram.id,
                        type: 'redeemed',
                        points: -body.pointsToClaim,
                        note: `Token #${token.tokenNumber}`,
                    },
                });
            }
            await recalculateTokenTotals(token.id, prisma);
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: { include: { menuItem: true } }, payments: true, customer: true },
            });
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // ── POST /api/mainpos/token/:qr/payment ── record payment, mark paid, award loyalty
    app.post('/token/:qr/payment', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { qr } = request.params;
        const schema = z.object({
            method: z.enum(['cash', 'gpay', 'card', 'upi', 'other']),
            amount: z.number().positive(),
            transactionId: z.string().optional(),
            staffId: z.number().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const token = await prisma.bakeryToken.findFirst({
                where: { qrCode: qr, restaurantId },
                include: {
                    items: { where: { isRemoved: false } },
                    payments: true,
                    customer: true,
                },
            });
            if (!token)
                return reply.status(404).send({ success: false, error: 'Token not found' });
            if (token.status === 'paid')
                return reply.status(400).send({ success: false, error: 'Already paid' });
            const tokenTotal = Number(token.total);
            if (isNaN(tokenTotal) || tokenTotal <= 0) {
                return reply.status(400).send({ success: false, error: 'Invalid token total' });
            }
            const totalPaidAggBefore = await prisma.bakeryTokenPayment.aggregate({
                where: { tokenId: token.id },
                _sum: { amount: true },
            });
            const totalPaidBefore = Number(totalPaidAggBefore._sum.amount ?? 0);
            const remainingBefore = Math.max(0, tokenTotal - totalPaidBefore);
            if (remainingBefore <= 0) {
                // Token has already been fully paid via previous payments; synchronize status.
                await prisma.bakeryToken.update({
                    where: { id: token.id },
                    data: { status: 'paid', paidAt: token.paidAt ?? new Date() },
                });
                const updatedToken = await prisma.bakeryToken.findUnique({
                    where: { id: token.id },
                    include: { items: true, payments: true, customer: true },
                });
                return reply.status(200).send({ success: true, data: { token: updatedToken, totalPaid: totalPaidBefore, pointsEarned: token.loyaltyPointsEarned ?? 0, message: 'Token already was fully paid' } });
            }
            if (body.amount <= 0) {
                return reply.status(400).send({ success: false, error: 'Payment amount must be greater than zero' });
            }
            if (body.amount > remainingBefore * 5) {
                // Protect from accidental huge overpayments
                return reply.status(400).send({ success: false, error: 'Payment amount is too large' });
            }
            const payment = await prisma.bakeryTokenPayment.create({
                data: {
                    tokenId: token.id,
                    method: body.method,
                    amount: body.amount,
                    transactionId: body.transactionId,
                },
            });
            const totalPaidAgg = await prisma.bakeryTokenPayment.aggregate({
                where: { tokenId: token.id },
                _sum: { amount: true },
            });
            const totalPaid = Number(totalPaidAgg._sum.amount ?? 0);
            // Audit log for payments
            await prisma.auditLog.create({
                data: {
                    restaurantId,
                    branchId: token.branchId,
                    action: 'TOKEN_PAYMENT',
                    referenceId: token.tokenNumber.toString(),
                    reason: `Payment of ₹${body.amount.toFixed(2)} via ${body.method}`,
                    details: JSON.stringify({
                        tokenId: token.id,
                        paymentId: payment.id,
                        method: body.method,
                        amount: body.amount,
                        transactionId: body.transactionId,
                        customerId: token.customerId,
                        staffUsername: request.staff?.name || 'unknown',
                    }),
                },
            });
            let pointsEarned = 0;
            let statusToUpdate = null;
            if (totalPaid >= tokenTotal) {
                statusToUpdate = 'paid';
            }
            else if (totalPaid > 0) {
                statusToUpdate = 'partial_paid';
            }
            if (statusToUpdate) {
                await prisma.bakeryToken.update({
                    where: { id: token.id },
                    data: { status: statusToUpdate, paidAt: statusToUpdate === 'paid' ? new Date() : token.paidAt || null },
                });
            }
            // If token became fully paid, also mark linked Order as paid so reports include its KOT items
            if (statusToUpdate === 'paid') {
                try {
                    // Mark token items as paid
                    await prisma.bakeryTokenItem.updateMany({
                        where: { tokenId: token.id },
                        data: { isPaid: true, chairNumber: null }
                    }).catch(() => {});

                    const tokLink = await prisma.bakeryToken.findUnique({ where: { id: token.id }, select: { orderId: true } });
                    const tableIdsToSync = new Set();
                    const ordersToMarkPaid = new Set();

                    if (tokLink?.orderId) {
                        ordersToMarkPaid.add(tokLink.orderId);
                        const tokOrder = await prisma.order.findUnique({ where: { id: tokLink.orderId } });
                        if (tokOrder?.tableId) tableIdsToSync.add(tokOrder.tableId);

                        const bgMatch = tokOrder?.note ? tokOrder.note.match(/\[BillGroup:(BG-[^\]]+)\]/) : null;
                        if (bgMatch) {
                            const bgOrders = await prisma.order.findMany({
                                where: { restaurantId, note: { contains: bgMatch[1] }, status: { notIn: ['paid', 'cancelled', 'completed'] } }
                            });
                            for (const bgo of bgOrders) {
                                ordersToMarkPaid.add(bgo.id);
                                if (bgo.tableId) tableIdsToSync.add(bgo.tableId);
                            }
                        }
                    }

                    // Mark all related orders as paid & their items as paid
                    for (const ordId of ordersToMarkPaid) {
                        const updateData = { status: 'paid' };
                        if (body.staffId) updateData.staffId = body.staffId;
                        await prisma.order.update({ where: { id: ordId }, data: updateData }).catch(() => {});
                        await prisma.kOTItem.updateMany({
                            where: { kot: { orderId: ordId }, status: { not: 'removed' } },
                            data: { status: 'paid', isPaid: true, chairNumber: null }
                        }).catch(() => {});
                    }

                    // Synchronize table status and emit socket events for ALL involved tables
                    for (const tableIdToSync of tableIdsToSync) {
                        const remainingKotItems = await prisma.kOTItem.findMany({
                            where: {
                                kot: { order: { tableId: tableIdToSync, restaurantId, status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid', 'bill_requested'] } } },
                                status: { notIn: ['removed', 'paid'] },
                                isPaid: false
                            },
                            select: { chairNumber: true }
                        });
                        const remainingTokenItems = await prisma.bakeryTokenItem.findMany({
                            where: {
                                token: { order: { tableId: tableIdToSync, restaurantId, status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid', 'bill_requested'] } } },
                                isRemoved: false,
                                isPaid: false
                            },
                            select: { chairNumber: true }
                        });

                        const tableObj = await prisma.table.findUnique({ where: { id: tableIdToSync } });
                        const remainingChairs = Array.from(
                            new Set([
                                ...remainingKotItems.map(i => i.chairNumber).filter(c => c !== null && c !== undefined && c !== '').map(Number),
                                ...remainingTokenItems.map(i => i.chairNumber).filter(c => c !== null && c !== undefined && c !== '').map(Number),
                            ])
                        ).sort((a, b) => a - b);

                        let newStatus = remainingChairs.length === 0 ? 'available' : (remainingChairs.length >= Number(tableObj?.capacity || 4) ? 'occupied' : 'partially_occupied');

                        await prisma.table.update({
                            where: { id: tableIdToSync },
                            data: { status: newStatus }
                        });

                        emitToRestaurant(restaurantId, 'table_updated', {
                            id: tableIdToSync,
                            tableId: tableIdToSync,
                            status: newStatus,
                            occupiedSeats: remainingChairs,
                            remainingChairs
                        });
                        emitToRestaurant(restaurantId, 'table_closed', {
                            tableId: tableIdToSync,
                            entireTable: newStatus === 'available',
                            remainingChairs
                        });
                        emitToRestaurant(restaurantId, 'waiter_bill_cleared', {
                            tableId: tableIdToSync,
                            tokenId: token.id,
                            orderId: tokLink?.orderId
                        });
                    }

                    emitToRestaurant(restaurantId, 'token_paid', {
                        id: token.id,
                        tokenNumber: token.tokenNumber
                    });
                } catch (err) {
                    app.log?.warn?.({ err }, 'Failed to update linked order/table status after token payment');
                }
            }
            // Award loyalty points when fully paid and customer exists; always increment totalOrders
            if (statusToUpdate === 'paid' && token.customerId) {
                const loyaltyProgram = await prisma.loyaltyProgram.findFirst({ where: { restaurantId } });
                const tokenTotalAfter = tokenTotal;
                let pointsToAdd = 0;
                if (loyaltyProgram?.isActive) {
                    const rupeesPerPoint = Number(loyaltyProgram?.rupeesPerPoint ?? 100);
                    pointsToAdd = rupeesPerPoint > 0 ? Math.floor(tokenTotalAfter / rupeesPerPoint) : 0;
                }
                // Build update payload for customer: always increment totalOrders, and loyaltyPoints if any
                const customerUpdate = { totalOrders: { increment: 1 } };
                if (pointsToAdd > 0)
                    customerUpdate.loyaltyPoints = { increment: pointsToAdd };
                if (Object.keys(customerUpdate).length > 0) {
                    await prisma.customer.update({ where: { id: token.customerId }, data: customerUpdate });
                }
                if (pointsToAdd > 0 && loyaltyProgram) {
                    await prisma.loyaltyTransaction.create({
                        data: {
                            customerId: token.customerId,
                            restaurantId,
                            loyaltyProgramId: loyaltyProgram.id,
                            type: 'earned',
                            points: pointsToAdd,
                            note: `Token #${token.tokenNumber}`,
                        },
                    });
                    await prisma.bakeryToken.update({ where: { id: token.id }, data: { loyaltyPointsEarned: pointsToAdd } });
                    pointsEarned = pointsToAdd;
                }
            }
            // Auto stock deduct
            deductStockForToken(token.id, restaurantId, prisma).catch((deductErr) => {
                console.error('Stock deduction failed for token', token.id, deductErr);
            });
            emitToRestaurant(restaurantId, 'token_paid', { tokenId: token.id, tokenNumber: token.tokenNumber, payment, totalPaid });
            emitToRestaurant(restaurantId, 'customer_display_payment_ok', {
                customerName: token.customerName,
                pointsEarned,
                paid: totalPaid,
                due: Math.max(0, tokenTotal - totalPaid),
            });
            const updated = await prisma.bakeryToken.findUnique({
                where: { id: token.id },
                include: { items: true, payments: true, customer: true },
            });
            return { success: true, data: { token: updated, totalPaid, pointsEarned } };
        }
        catch (err) {
            console.error('Payment endpoint failed', err);
            return reply.status(500).send({ success: false, error: err?.message || 'Internal server error' });
        }
    });
    // ── GET /api/mainpos/recent-tokens ── last 20 tokens for this branch
    app.get('/recent-tokens', async (request) => {
        const restaurantId = request.restaurantId;
        const branchId = request.branchId;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const tokens = await prisma.bakeryToken.findMany({
            where: { restaurantId, branchId, createdAt: { gte: todayStart } },
            orderBy: { tokenNumber: 'desc' },
            take: 20,
            select: { id: true, tokenNumber: true, qrCode: true, status: true, total: true, customerName: true, createdAt: true },
        });
        return { success: true, data: tokens };
    });
    // ── GET /api/mainpos/today-orders ── all today's tokens for this branch
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
    // ── GET /api/mainpos/today-collection ── paid collection summary for today
    app.get('/today-collection', async (request) => {
        const restaurantId = request.restaurantId;
        const branchId = request.branchId;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [tokenPaymentsAgg, orderPaymentsAgg, ordersCount] = await Promise.all([
            prisma.bakeryTokenPayment.aggregate({
                where: {
                    paidAt: { gte: todayStart },
                    token: { restaurantId, branchId },
                },
                _sum: { amount: true },
            }),
            // Include Order payments too so Main POS reflects all collections for the branch
            prisma.orderPayment.aggregate({
                where: {
                    paidAt: { gte: todayStart },
                    order: { restaurantId, branchId },
                },
                _sum: { amount: true },
            }),
            prisma.bakeryToken.count({
                where: { restaurantId, branchId, createdAt: { gte: todayStart } },
            }),
        ]);
        const collectionAmount = Number(tokenPaymentsAgg?._sum?.amount || 0) + Number(orderPaymentsAgg?._sum?.amount || 0);
        return {
            success: true,
            data: {
                ordersCount,
                collectionAmount,
            },
        };
    });
    // ── GET /api/mainpos/expense-categories ── categories for expense entry
    app.get('/expense-categories', async (request) => {
        const restaurantId = request.restaurantId;
        const categories = await prisma.expenseCategory.findMany({
            where: { restaurantId },
            orderBy: { name: 'asc' },
            include: { _count: { select: { expenses: true } } },
        });
        return { success: true, data: categories };
    });
    // ── POST /api/mainpos/expenses ── add expense from MainPOS Total A modal
    app.post('/expenses', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        try {
            const { title, amount, categoryId, paymentMethod, description } = body || {};
            const parsedAmount = Number(amount);
            if (!String(title || '').trim()) {
                return reply.status(400).send({ success: false, error: 'title is required' });
            }
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                return reply.status(400).send({ success: false, error: 'amount must be a positive number' });
            }
            if (!categoryId) {
                return reply.status(400).send({ success: false, error: 'categoryId is required' });
            }
            const expense = await prisma.expense.create({
                data: {
                    restaurantId,
                    title: String(title).trim(),
                    amount: parsedAmount,
                    categoryId: Number(categoryId),
                    expenseDate: new Date(),
                    paymentStatus: 'paid',
                    paymentDate: new Date(),
                    paymentMethod: paymentMethod ? String(paymentMethod) : 'cash',
                    description: description ? String(description) : null,
                },
                include: { category: true },
            });
            return { success: true, data: expense };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });

    // ── GET pending bills for Main POS ──
    const getPendingBillsData = async (restaurantId) => {
        const activeOrders = await prisma.order.findMany({
            where: {
                restaurantId,
                OR: [
                    { status: 'bill_requested' },
                    { table: { status: 'bill_requested' } }
                ],
                isDraft: false
            },
            include: {
                table: true,
                staff: true,
                customer: true,
                bakeryToken: { include: { items: { include: { menuItem: true } } } },
                kots: { include: { items: { include: { menuItem: true } } } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const activeTokens = await prisma.bakeryToken.findMany({
            where: {
                restaurantId,
                status: 'bill_requested',
                orderId: { not: null }
            },
            include: {
                order: { include: { table: true, staff: true } },
                items: { include: { menuItem: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        const rawBillsMap = new Map();

        for (const ord of activeOrders) {
            const items = ord.bakeryToken?.items?.length
                ? ord.bakeryToken.items.filter(i => !i.isPaid).map(i => ({ menuItemId: i.menuItemId, name: i.menuItemName || i.menuItem?.name || 'Item', price: Number(i.price), quantity: i.quantity, chairNumber: i.chairNumber ?? null }))
                : (ord.kots || []).flatMap(k => (k.items || []).filter(i => !i.isPaid).map(i => ({ menuItemId: i.menuItemId, name: i.menuItem?.name || i.name || 'Item', price: Number(i.price), quantity: i.quantity, chairNumber: i.chairNumber ?? null })));

            if (items.length > 0) {
                const bgMatch = ord.note ? ord.note.match(/\[BillGroup:(BG-[^\]]+)\]/) : null;
                const billGroupId = bgMatch ? bgMatch[1] : null;
                const key = billGroupId ? `billgroup-${billGroupId}` : (ord.tableId ? `table-${ord.tableId}` : `ord-${ord.id}`);

                if (!rawBillsMap.has(key)) {
                    rawBillsMap.set(key, {
                        id: billGroupId ? `bg-${billGroupId}` : `ord-${ord.id}`,
                        billGroupId: billGroupId || undefined,
                        orderId: ord.id,
                        orderIds: [ord.id],
                        tableId: ord.tableId,
                        tableIds: ord.tableId ? [ord.tableId] : [],
                        tableChairs: ord.tableId ? [{ tableId: ord.tableId, chairNumbers: items.map(i => i.chairNumber).filter(Boolean) }] : [],
                        rawTableName: ord.table?.name || (ord.tableId ? `${ord.tableId}` : ''),
                        tableStatus: ord.table?.status || 'occupied',
                        staffName: ord.staff?.name || 'Waiter',
                        customerName: ord.customer?.name || ord.bakeryToken?.customerName || '',
                        customerPhone: ord.customer?.phone || ord.bakeryToken?.customerPhone || '',
                        bakeryTokenId: ord.bakeryTokenId,
                        tokenNumber: ord.bakeryToken?.tokenNumber || ord.orderNumber,
                        createdAt: ord.createdAt,
                        items: [...items]
                    });
                } else {
                    const existing = rawBillsMap.get(key);
                    existing.items.push(...items);
                    if (!existing.orderIds.includes(ord.id)) existing.orderIds.push(ord.id);
                    if (ord.tableId && !existing.tableIds.includes(ord.tableId)) existing.tableIds.push(ord.tableId);
                    if (ord.tableId) {
                        const existingTc = existing.tableChairs.find(tc => tc.tableId === ord.tableId);
                        const chairsForOrd = items.map(i => i.chairNumber).filter(Boolean);
                        if (existingTc) {
                            existingTc.chairNumbers = Array.from(new Set([...existingTc.chairNumbers, ...chairsForOrd]));
                        } else {
                            existing.tableChairs.push({ tableId: ord.tableId, chairNumbers: chairsForOrd });
                        }
                    }
                }
            }
        }

        for (const tok of activeTokens) {
            const items = (tok.items || []).filter(i => !i.isPaid).map(i => ({
                menuItemId: i.menuItemId,
                name: i.menuItemName || i.menuItem?.name || 'Item',
                price: Number(i.price),
                quantity: i.quantity,
                chairNumber: i.chairNumber ?? null,
            }));

            if (items.length > 0) {
                const tbl = tok.order?.table;
                const tableId = tok.order?.tableId || null;
                const key = tableId ? `table-${tableId}` : `tok-${tok.id}`;

                if (!rawBillsMap.has(key)) {
                    rawBillsMap.set(key, {
                        id: `tok-${tok.id}`,
                        bakeryTokenId: tok.id,
                        tableId,
                        tableIds: tableId ? [tableId] : [],
                        tableChairs: tableId ? [{ tableId, chairNumbers: items.map(i => i.chairNumber).filter(Boolean) }] : [],
                        rawTableName: tbl?.name || (tableId ? `${tableId}` : ''),
                        tableStatus: tbl?.status || 'occupied',
                        staffName: tok.order?.staff?.name || 'Waiter',
                        customerName: tok.customerName || '',
                        customerPhone: tok.customerPhone || '',
                        tokenNumber: tok.tokenNumber,
                        createdAt: tok.createdAt,
                        items: [...items]
                    });
                } else {
                    const existing = rawBillsMap.get(key);
                    existing.items.push(...items);
                }
            }
        }

        const pendingBills = Array.from(rawBillsMap.values()).map(b => {
            const chairs = Array.from(
                new Set(b.items.map(i => i.chairNumber).filter(n => n !== null && n !== undefined).map(Number))
            ).sort((a, b) => a - b);

            let tableName = b.rawTableName ? (b.rawTableName.toLowerCase().startsWith('table') ? b.rawTableName : `Table ${b.rawTableName}`) : 'Takeaway';
            if (b.tableChairs && b.tableChairs.length > 1) {
                tableName = b.tableChairs.map(tc => {
                    const cStr = (tc.chairNumbers || []).length > 0 ? ` (Chair ${tc.chairNumbers.join(',')})` : '';
                    return `Table ${tc.tableId}${cStr}`;
                }).join(' + ');
            } else {
                const chairLabel = chairs.length === 1
                    ? ` (Chair ${chairs[0]})`
                    : (chairs.length > 1 ? ` (Chairs ${chairs.join(', ')})` : '');
                tableName = `${tableName}${chairLabel}`;
            }

            const subtotal = b.items.reduce((s, i) => s + (Number(i.price) * Number(i.quantity || 1)), 0);

            return {
                ...b,
                tableName,
                chairNumbers: chairs,
                chairNumber: chairs[0] || null,
                customerName: b.customerName || tableName,
                subtotal,
                total: subtotal,
            };
        });

        return pendingBills;
    };

    app.get('/restaurant/tables/pending-bills', async (request, reply) => {
        try {
            const pendingBills = await getPendingBillsData(request.restaurantId);
            return { success: true, data: pendingBills };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });

    app.get('/tables/pending-bills', async (request, reply) => {
        try {
            const pendingBills = await getPendingBillsData(request.restaurantId);
            return { success: true, data: pendingBills };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });

    const closeSingleTableHelper = async (restaurantId, tableId, requestedChairs, isEntireTable, bakeryTokenId = null) => {
        const table = await prisma.table.findFirst({
            where: { id: tableId, restaurantId }
        });
        if (!table) return null;

        const activeOrders = await prisma.order.findMany({
            where: {
                tableId,
                restaurantId,
                status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid', 'bill_requested'] }
            },
            include: { kots: { include: { items: true } }, bakeryToken: { include: { items: true } } }
        });

        if (isEntireTable) {
            await prisma.$transaction(async tx => {
                for (const order of activeOrders) {
                    await tx.kOTItem.updateMany({
                        where: { kot: { orderId: order.id }, status: { not: 'removed' } },
                        data: { status: 'paid', isPaid: true, chairNumber: null }
                    });
                    await tx.order.update({
                        where: { id: order.id },
                        data: { status: 'paid' }
                    });
                }

                if (bakeryTokenId) {
                    await tx.bakeryTokenItem.updateMany({
                        where: { tokenId: bakeryTokenId },
                        data: { isPaid: true, chairNumber: null }
                    }).catch(() => {});
                    await tx.bakeryToken.updateMany({
                        where: { id: bakeryTokenId, restaurantId },
                        data: { status: 'paid', paidAt: new Date() }
                    });
                }

                await tx.table.update({
                    where: { id: tableId },
                    data: { status: 'available' }
                });
            });

            emitToRestaurant(restaurantId, 'table_updated', {
                id: tableId,
                status: 'available',
                occupiedSeats: []
            });
            emitToRestaurant(restaurantId, 'table_closed', {
                tableId,
                entireTable: true
            });
            emitToRestaurant(restaurantId, 'waiter_bill_cleared', {
                tableId,
                entireTable: true
            });
            return { tableId, status: 'available', occupiedSeats: [] };
        }

        // Chair-level close
        await prisma.$transaction(async tx => {
            for (const order of activeOrders) {
                await tx.kOTItem.updateMany({
                    where: { kot: { orderId: order.id }, chairNumber: { in: requestedChairs }, status: { not: 'removed' } },
                    data: { status: 'paid', isPaid: true, chairNumber: null }
                });

                if (order.bakeryTokenId) {
                    await tx.bakeryTokenItem.updateMany({
                        where: { tokenId: order.bakeryTokenId, chairNumber: { in: requestedChairs } },
                        data: { isPaid: true, chairNumber: null }
                    }).catch(() => {});
                }

                const remainingItems = await tx.kOTItem.count({
                    where: { kot: { orderId: order.id }, status: { notIn: ['removed', 'paid'] }, isPaid: false }
                });

                await tx.order.update({
                    where: { id: order.id },
                    data: { status: remainingItems === 0 ? 'paid' : 'partially_paid' }
                });
            }

            const remainingKotItems = await tx.kOTItem.findMany({
                where: {
                    kot: { order: { tableId, restaurantId, status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid', 'bill_requested'] } } },
                    status: { notIn: ['removed', 'paid'] },
                    isPaid: false
                },
                select: { chairNumber: true }
            });
            const remainingTokenItems = await tx.bakeryTokenItem.findMany({
                where: {
                    token: { order: { tableId, restaurantId, status: { in: ['placed', 'running', 'confirmed', 'preparing', 'ready', 'served', 'partially_paid', 'bill_requested'] } } },
                    isRemoved: false,
                    isPaid: false
                },
                select: { chairNumber: true }
            });

            const remainingChairs = Array.from(
                new Set([
                    ...remainingKotItems.map(item => item.chairNumber).filter(chair => chair !== null && chair !== undefined && chair !== '').map(Number),
                    ...remainingTokenItems.map(item => item.chairNumber).filter(chair => chair !== null && chair !== undefined && chair !== '').map(Number),
                ])
            ).sort((a, b) => a - b);

            const newTableStatus = remainingChairs.length === 0
                ? 'available'
                : remainingChairs.length >= Number(table.capacity || 4)
                    ? 'occupied'
                    : 'partially_occupied';

            await tx.table.update({
                where: { id: tableId },
                data: { status: newTableStatus }
            });

            if (bakeryTokenId && remainingChairs.length === 0) {
                await tx.bakeryToken.updateMany({
                    where: { id: bakeryTokenId, restaurantId },
                    data: { status: 'paid', paidAt: new Date() }
                });
            }

            emitToRestaurant(restaurantId, 'table_updated', {
                id: tableId,
                status: newTableStatus,
                occupiedSeats: remainingChairs
            });
            emitToRestaurant(restaurantId, 'table_closed', {
                tableId,
                closedChairs: requestedChairs,
                remainingChairs
            });
            emitToRestaurant(restaurantId, 'waiter_bill_cleared', {
                tableId,
                closedChairs: requestedChairs,
                remainingChairs
            });
        });

        return { tableId, status: 'updated' };
    };

    // ── Close Table / Settle Bill Endpoint for Main POS ──
    const closeTableHandler = async (request, reply) => {
        const restaurantId = request.restaurantId;
        const tableId = Number(request.params.id);
        const body = request.body || {};
        const bakeryTokenId = body.bakeryTokenId ? Number(body.bakeryTokenId) : null;

        try {
            if (Array.isArray(body.tableChairs) && body.tableChairs.length > 0) {
                const results = [];
                for (const tc of body.tableChairs) {
                    const subTableId = Number(tc.tableId);
                    const subChairs = (tc.chairNumbers || []).map(Number).filter(n => n > 0);
                    const isWhole = tc.isEntireTable === true || subChairs.length === 0;
                    const res = await closeSingleTableHelper(restaurantId, subTableId, subChairs, isWhole, bakeryTokenId);
                    if (res) results.push(res);
                }
                return { success: true, data: results };
            }

            const isEntireTable = body.isEntireTable === true || !Array.isArray(body.chairNumbers) || body.chairNumbers.length === 0;
            const requestedChairs = Array.from(
                new Set(
                    (body.chairNumbers || [])
                        .map(Number)
                        .filter(Number.isInteger)
                        .filter(n => n > 0)
                )
            );

            const res = await closeSingleTableHelper(restaurantId, tableId, requestedChairs, isEntireTable, bakeryTokenId);
            if (!res) {
                return reply.status(404).send({ success: false, error: 'Table not found' });
            }
            return { success: true, data: res };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    };

    app.post('/tables/:id/close', closeTableHandler);
    app.post('/restaurant/tables/:id/close', closeTableHandler);
}
// ── Stock auto-deduction (internal, not exported as route) ──
async function deductStockForToken(tokenId, restaurantId, prisma) {
    const token = await prisma.bakeryToken.findUnique({
        where: { id: tokenId },
        include: { items: { where: { isRemoved: false }, include: { menuItem: { include: { category: true } } } } },
    });
    if (!token)
        return;
    await prisma.$transaction(async (tx) => {
        for (const tokenItem of token.items) {
            // Try recipe-based consumption first
            const recipe = await tx.recipe.findUnique({ where: { menuItemId: tokenItem.menuItemId }, include: { ingredients: true } });
            if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
                for (const ingredient of recipe.ingredients) {
                    const deductQty = Number(ingredient.quantity) * tokenItem.quantity;
                    await tx.inventoryItem.update({ where: { id: ingredient.inventoryItemId }, data: { currentStock: { decrement: deductQty } } });
                    await tx.inventoryMovement.create({ data: { restaurantId, itemId: ingredient.inventoryItemId, type: 'out', quantity: deductQty, note: `Token #${token.tokenNumber}` } });
                }
                continue;
            }
            // If no recipe, and this is NOT a KOT (food) item, check if menuItem maps directly to an inventory item (retail/non-food)
            const menuItem = tokenItem.menuItem;
            const isKOT = !!(menuItem && menuItem.category && menuItem.category.isKOTEnabled);
            if (!isKOT && menuItem && menuItem.inventoryItemId) {
                const invId = Number(menuItem.inventoryItemId);
                if (invId) {
                    const deductQty = Number(tokenItem.quantity || 0);
                    await tx.inventoryItem.update({ where: { id: invId }, data: { currentStock: { decrement: deductQty } } });
                    await tx.inventoryMovement.create({ data: { restaurantId, itemId: invId, type: 'out', quantity: deductQty, note: `Token #${token.tokenNumber}` } });
                }
            }
        }
    });
}
