import { prisma } from '../../app.js';
export async function aiInsightsRoutes(app) {
    app.post('/chat', async (request) => {
        const restaurantId = request.restaurantId;
        const { message, from_date, to_date } = request.body;
        if (!message)
            return { success: false, error: 'Message required' };
        const lowerMsg = message.toLowerCase();
        // Build date filter
        const dateFilter = {};
        if (from_date)
            dateFilter.gte = new Date(from_date);
        if (to_date) {
            const toEnd = new Date(to_date);
            toEnd.setHours(23, 59, 59, 999);
            dateFilter.lte = toEnd;
        }
        const hasDateFilter = Object.keys(dateFilter).length > 0;
        const orderDateWhere = hasDateFilter ? { createdAt: dateFilter } : {};
        const dateRangeLabel = from_date && to_date
            ? ` from ${from_date} to ${to_date}`
            : '';
        let responseText = "I can analyze your restaurant data. Try asking about 'sales', 'top items', 'taxes', 'payment methods', 'delivery', 'expenses', 'cancellations', 'refunds', 'reservations', 'kitchen', 'inventory', or 'categories'.";
        try {
            // ── Sales / Revenue ────────────────────────────────────────────────
            if (lowerMsg.includes('sale') || lowerMsg.includes('revenue') || lowerMsg.includes('total') || lowerMsg.includes('earning')) {
                const aggs = await prisma.order.aggregate({
                    where: { restaurantId, status: 'paid', ...orderDateWhere },
                    _sum: { total: true, sgst: true, cgst: true },
                    _count: { id: true },
                    _avg: { total: true }
                });
                const total = Number(aggs._sum.total || 0);
                const sgst = Number(aggs._sum.sgst || 0);
                const cgst = Number(aggs._sum.cgst || 0);
                const tax = sgst + cgst;
                const avg = Number(aggs._avg.total || 0);
                responseText = `📊 **Sales Summary${dateRangeLabel}**\n\n` +
                    `• Total Revenue: $${total.toFixed(2)}\n` +
                    `• Total Orders: ${aggs._count.id}\n` +
                    `• Average Order Value: $${avg.toFixed(2)}\n` +
                    `• Total Tax Collected: $${tax.toFixed(2)}\n` +
                    `• Net Revenue (excl. tax): $${(total - tax).toFixed(2)}`;
            }
            // ── Top Items ──────────────────────────────────────────────────────
            else if (lowerMsg.includes('item') || lowerMsg.includes('selling') || lowerMsg.includes('dish') || lowerMsg.includes('food') || lowerMsg.includes('popular')) {
                const kots = await prisma.kOTItem.findMany({
                    where: {
                        kot: {
                            restaurantId,
                            ...(hasDateFilter ? { createdAt: dateFilter } : {})
                        }
                    },
                    include: { menuItem: { select: { name: true, price: true } } }
                });
                const counts = {};
                kots.forEach(k => {
                    const name = k.menuItem?.name;
                    if (name) {
                        if (!counts[name])
                            counts[name] = { qty: 0, revenue: 0 };
                        counts[name].qty += k.quantity;
                        counts[name].revenue += k.quantity * Number(k.price || k.menuItem?.price || 0);
                    }
                });
                const top = Object.entries(counts)
                    .sort((a, b) => b[1].qty - a[1].qty)
                    .slice(0, 5);
                if (top.length) {
                    responseText = `🍽️ **Top Selling Items${dateRangeLabel}**\n\n` +
                        top.map((t, i) => `${i + 1}. ${t[0]} — ${t[1].qty} sold ($${t[1].revenue.toFixed(2)})`).join('\n');
                }
                else {
                    responseText = "No KOT item data found for the selected period.";
                }
            }
            // ── Categories ────────────────────────────────────────────────────
            else if (lowerMsg.includes('categor')) {
                const kots = await prisma.kOTItem.findMany({
                    where: {
                        kot: {
                            restaurantId,
                            ...(hasDateFilter ? { createdAt: dateFilter } : {})
                        }
                    },
                    include: {
                        menuItem: {
                            include: { category: { select: { name: true } } }
                        }
                    }
                });
                const catData = {};
                kots.forEach(k => {
                    const cat = k.menuItem?.category?.name || 'Uncategorized';
                    if (!catData[cat])
                        catData[cat] = { qty: 0, revenue: 0 };
                    catData[cat].qty += k.quantity;
                    catData[cat].revenue += k.quantity * Number(k.price || k.menuItem?.price || 0);
                });
                const sorted = Object.entries(catData).sort((a, b) => b[1].revenue - a[1].revenue);
                if (sorted.length) {
                    responseText = `📂 **Sales by Category${dateRangeLabel}**\n\n` +
                        sorted.map((c, i) => `${i + 1}. ${c[0]} — $${c[1].revenue.toFixed(2)} (${c[1].qty} items)`).join('\n');
                }
                else {
                    responseText = "No category data found for the selected period.";
                }
            }
            // ── Taxes ─────────────────────────────────────────────────────────
            else if (lowerMsg.includes('tax') || lowerMsg.includes('sgst') || lowerMsg.includes('cgst') || lowerMsg.includes('gst')) {
                const aggs = await prisma.order.aggregate({
                    where: { restaurantId, status: 'paid', ...orderDateWhere },
                    _sum: { sgst: true, cgst: true, total: true }
                });
                const sgst = Number(aggs._sum.sgst || 0);
                const cgst = Number(aggs._sum.cgst || 0);
                const gross = Number(aggs._sum.total || 0);
                responseText = `🧾 **Tax Breakdown${dateRangeLabel}**\n\n` +
                    `• SGST Collected: $${sgst.toFixed(2)}\n` +
                    `• CGST Collected: $${cgst.toFixed(2)}\n` +
                    `• Total Tax: $${(sgst + cgst).toFixed(2)}\n` +
                    `• Gross Sales: $${gross.toFixed(2)}\n` +
                    `• Net Revenue: $${(gross - sgst - cgst).toFixed(2)}`;
            }
            // ── Payment Methods ───────────────────────────────────────────────
            else if (lowerMsg.includes('method') || lowerMsg.includes('cash') || lowerMsg.includes('upi') || lowerMsg.includes('card') || lowerMsg.includes('payment method')) {
                const payments = await prisma.orderPayment.groupBy({
                    by: ['method'],
                    where: {
                        order: { restaurantId },
                        isDue: false,
                        ...(hasDateFilter ? { createdAt: dateFilter } : {})
                    },
                    _sum: { amount: true },
                    _count: { id: true }
                });
                if (payments.length) {
                    responseText = `💳 **Payment Methods${dateRangeLabel}**\n\n` +
                        payments.map(p => `• ${p.method}: $${(p._sum.amount || 0).toFixed(2)} (${p._count.id} txns)`).join('\n');
                }
                else {
                    responseText = "No payment transactions recorded for the selected period.";
                }
            }
            // ── Cancellations ─────────────────────────────────────────────────
            else if (lowerMsg.includes('cancel')) {
                const cancelled = await prisma.order.findMany({
                    where: { restaurantId, status: 'cancelled', ...orderDateWhere },
                    include: { table: { select: { name: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                });
                const total = await prisma.order.aggregate({
                    where: { restaurantId, status: 'cancelled', ...orderDateWhere },
                    _count: { id: true },
                    _sum: { total: true }
                });
                responseText = `❌ **Cancellations${dateRangeLabel}**\n\n` +
                    `• Total Cancelled: ${total._count.id} orders\n` +
                    `• Lost Revenue: $${(total._sum.total || 0).toFixed(2)}\n\n` +
                    (cancelled.length ? `**Recent Cancellations:**\n` +
                        cancelled.slice(0, 5).map(o => `• Order #${o.orderNumber} — $${o.total} (${o.cancelReason || 'no reason'})`).join('\n') : '');
            }
            // ── Refunds ───────────────────────────────────────────────────────
            else if (lowerMsg.includes('refund')) {
                const refunds = await prisma.orderPayment.aggregate({
                    where: {
                        order: { restaurantId },
                        ...(hasDateFilter ? { createdAt: dateFilter } : {})
                    },
                    _count: { id: true },
                    _sum: { amount: true }
                });
                responseText = `🔄 **Refund Summary${dateRangeLabel}**\n\n` +
                    `• Transactions Processed: ${refunds._count.id}\n` +
                    `• Total Amount: $${(refunds._sum.amount || 0).toFixed(2)}\n\n` +
                    `_For detailed breakdowns, visit Reports → Refund Report._`;
            }
            // ── Delivery ──────────────────────────────────────────────────────
            else if (lowerMsg.includes('delivery') || lowerMsg.includes('platform') || lowerMsg.includes('app')) {
                const orders = await prisma.order.aggregate({
                    where: { restaurantId, type: 'delivery', ...orderDateWhere },
                    _count: { id: true },
                    _sum: { total: true }
                });
                responseText = `🚚 **Delivery Orders${dateRangeLabel}**\n\n` +
                    `• Total Delivery Orders: ${orders._count.id}\n` +
                    `• Delivery Revenue: $${(orders._sum.total || 0).toFixed(2)}\n\n` +
                    `_For platform-wise breakdown, visit Reports → Delivery App Report._`;
            }
            // ── Expenses ──────────────────────────────────────────────────────
            else if (lowerMsg.includes('expense') || lowerMsg.includes('cost') || lowerMsg.includes('spending')) {
                const exps = await prisma.expense.aggregate({
                    where: {
                        restaurantId,
                        ...(hasDateFilter ? { expenseDate: dateFilter } : {})
                    },
                    _sum: { amount: true },
                    _count: { id: true }
                });
                const pending = await prisma.expense.aggregate({
                    where: {
                        restaurantId,
                        paymentStatus: 'pending',
                        ...(hasDateFilter ? { expenseDate: dateFilter } : {})
                    },
                    _sum: { amount: true }
                });
                responseText = `💸 **Expenses${dateRangeLabel}**\n\n` +
                    `• Total Expenses: $${(exps._sum.amount || 0).toFixed(2)}\n` +
                    `• Number of Records: ${exps._count.id}\n` +
                    `• Pending Payments: $${(pending._sum.amount || 0).toFixed(2)}`;
            }
            // ── Reservations ──────────────────────────────────────────────────
            else if (lowerMsg.includes('reservation') || lowerMsg.includes('booking') || lowerMsg.includes('table book')) {
                const res = await prisma.reservation.groupBy({
                    by: ['status'],
                    where: {
                        restaurantId,
                        ...(hasDateFilter ? { date: dateFilter } : {})
                    },
                    _count: { id: true }
                });
                const total = res.reduce((sum, r) => sum + r._count.id, 0);
                responseText = `📅 **Reservations${dateRangeLabel}**\n\n` +
                    `• Total: ${total}\n` +
                    res.map(r => `• ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}: ${r._count.id}`).join('\n');
            }
            // ── Kitchen ───────────────────────────────────────────────────────
            else if (lowerMsg.includes('kitchen') || lowerMsg.includes('kot') || lowerMsg.includes('prep')) {
                const kotStats = await prisma.kOT.aggregate({
                    where: {
                        restaurantId,
                        ...(hasDateFilter ? { createdAt: dateFilter } : {})
                    },
                    _count: { id: true }
                });
                const pending = await prisma.kOT.count({
                    where: {
                        restaurantId,
                        status: 'pending',
                        ...(hasDateFilter ? { createdAt: dateFilter } : {})
                    }
                });
                const preparing = await prisma.kOT.count({
                    where: {
                        restaurantId,
                        status: 'preparing',
                        ...(hasDateFilter ? { createdAt: dateFilter } : {})
                    }
                });
                responseText = `👨‍🍳 **Kitchen Performance${dateRangeLabel}**\n\n` +
                    `• Total KOTs: ${kotStats._count.id}\n` +
                    `• Currently Pending: ${pending}\n` +
                    `• Preparing: ${preparing}\n` +
                    `• Completed: ${kotStats._count.id - pending - preparing}`;
            }
            // ── Inventory ─────────────────────────────────────────────────────
            else if (lowerMsg.includes('inventor') || lowerMsg.includes('stock')) {
                const items = await prisma.inventoryItem.findMany({
                    where: { restaurantId },
                    orderBy: { currentStock: 'asc' },
                    take: 10
                });
                if (items.length) {
                    const lowStock = items.filter(item => Number(item.currentStock) <= Number(item.thresholdQty || 0));
                    responseText = `📦 **Inventory Status**\n\n` +
                        `• Total Items: ${items.length}\n` +
                        `• Low Stock Alerts: ${lowStock.length}\n\n` +
                        (lowStock.length > 0
                            ? `**⚠️ Low Stock Items:**\n` + lowStock.slice(0, 5).map(i => `• ${i.name}: ${Number(i.currentStock).toFixed(2)} units remaining`).join('\n')
                            : `✅ All inventory levels are adequate.`);
                }
                else {
                    responseText = "No inventory items configured. Set up inventory in the Inventory module.";
                }
            }
            // ── Staff / Waiter ────────────────────────────────────────────────
            else if (lowerMsg.includes('waiter') || lowerMsg.includes('staff') || lowerMsg.includes('employee') || lowerMsg.includes('efficiency')) {
                const staffOrders = await prisma.order.groupBy({
                    by: ['staffId'],
                    where: { restaurantId, staffId: { not: null }, ...orderDateWhere },
                    _count: { id: true },
                    _sum: { total: true }
                });
                if (staffOrders.length) {
                    const top = staffOrders.sort((a, b) => b._count.id - a._count.id)[0];
                    responseText = `👤 **Staff Performance${dateRangeLabel}**\n\n` +
                        `• Active Staff Members: ${staffOrders.length}\n` +
                        `• Total Orders Handled: ${staffOrders.reduce((s, r) => s + r._count.id, 0)}\n` +
                        `• Top Performer: Staff serving ${top._count.id} orders ($${(top._sum.total || 0).toFixed(2)})\n\n` +
                        `_Go to Staff page for full breakdown._`;
                }
                else {
                    responseText = "No staff-linked orders found for this period.";
                }
            }
            return { success: true, data: { text: responseText, timestamp: new Date() } };
        }
        catch (e) {
            console.error('AI Insights error:', e);
            return { success: false, error: 'AI engine error: ' + e.message };
        }
    });
}
