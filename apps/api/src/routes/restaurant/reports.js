import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import ExcelJS from 'exceljs';
// Small helpers for PDF/Excel exports
const formatNumber = (v) => Number(v ?? 0).toFixed(2);
async function sendExcel(reply, filename, sheets) {
    const workbook = new ExcelJS.Workbook();
    sheets.forEach(s => {
        const ws = workbook.addWorksheet(s.name);
        s.rows.forEach((r) => ws.addRow(r));
    });
    const buffer = await workbook.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return reply.send(Buffer.from(buffer));
}
async function sendPDF(reply, filename, title, lines, table) {
    let PDFDocument;
    try {
        PDFDocument = (await import('pdfkit')).default;
    }
    catch (err) {
        return reply.status(501).send({ success: false, error: 'PDF export not available: install pdfkit in @restaurant-saas/api' });
    }
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    const endPromise = new Promise(resolve => doc.on('end', () => resolve()));
    doc.fontSize(16).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11);
    lines.forEach(l => doc.text(l));
    doc.moveDown();
    if (table) {
        table.headers.forEach((h, i) => {
            doc.font('Helvetica-Bold').text(h, { continued: i !== table.headers.length - 1 });
            doc.font('Helvetica');
        });
        doc.moveDown(0.5);
        table.rows.forEach(row => {
            row.forEach((cell, i) => {
                doc.text(String(cell ?? ''), { continued: i !== row.length - 1 });
            });
            doc.moveDown(0.2);
        });
    }
    doc.end();
    await endPromise;
    const pdfData = Buffer.concat(buffers);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return reply.send(pdfData);
}
export async function reportRoutes(app) {
    // ── Cancelled Orders Report ──
    app.get('/cancelled-orders', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const where = { restaurantId, status: 'cancelled' };
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom)
                where.createdAt.gte = new Date(dateFrom);
            if (dateTo)
                where.createdAt.lte = new Date(dateTo);
        }
        const orders = await prisma.order.findMany({
            where,
            include: { table: true, staff: true },
            orderBy: { createdAt: 'desc' },
        });
        const summary = {
            totalCancelled: orders.length,
            totalLostRevenue: orders.reduce((sum, o) => sum + Number(o.total), 0),
        };
        return { success: true, data: { orders, summary } };
    });
    // ── Due Payments Report ──
    app.get('/due-payments', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const where = { isDue: true, order: { restaurantId } };
        if (dateFrom || dateTo) {
            where.paidAt = {};
            if (dateFrom)
                where.paidAt.gte = new Date(dateFrom);
            if (dateTo)
                where.paidAt.lte = new Date(dateTo);
        }
        const payments = await prisma.orderPayment.findMany({
            where,
            include: { order: true },
            orderBy: { paidAt: 'desc' },
        });
        const summary = {
            totalDue: payments.reduce((sum, p) => sum + Number(p.amount), 0),
            totalCollected: 0,
            pending: payments.length,
        };
        return { success: true, data: { payments, summary } };
    });
    // ── Removed KOT Items Report ──
    app.get('/removed-kot-items', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        // Include both KOTItem.removedAt and BakeryTokenItem.isRemoved (token-based removals)
        const kotWhere = { kot: { order: { restaurantId } }, removedAt: { not: null } };
        const tokenWhere = { token: { restaurantId }, isRemoved: true };
        if (dateFrom || dateTo) {
            kotWhere.removedAt = {};
            tokenWhere.removedAt = {};
            if (dateFrom) {
                kotWhere.removedAt.gte = new Date(dateFrom);
                tokenWhere.removedAt.gte = new Date(dateFrom);
            }
            if (dateTo) {
                kotWhere.removedAt.lte = new Date(dateTo);
                tokenWhere.removedAt.lte = new Date(dateTo);
            }
        }
        const kotItems = await prisma.kOTItem.findMany({
            where: kotWhere,
            include: { menuItem: true, kot: { include: { order: true } } },
            orderBy: { removedAt: 'desc' },
        });
        const tokenItems = await prisma.bakeryTokenItem.findMany({
            where: tokenWhere,
            include: { menuItem: true, token: true },
            orderBy: { removedAt: 'desc' },
        });
        // Normalize union of removed items
        const items = [
            ...kotItems.map((i) => ({
                id: i.id,
                source: 'kot',
                menuItemId: i.menuItemId,
                name: i.menuItem?.name,
                quantity: i.quantity,
                price: Number(i.price),
                removedAt: i.removedAt,
                details: { kotId: i.kotId, orderId: i.kot?.orderId },
            })),
            ...tokenItems.map((i) => ({
                id: i.id,
                source: 'token',
                menuItemId: i.menuItemId,
                name: i.menuItemName || i.menuItem?.name,
                quantity: i.quantity,
                price: Number(i.price),
                removedAt: i.removedAt,
                details: { tokenId: i.tokenId },
            })),
        ].sort((a, b) => (b.removedAt || 0) - (a.removedAt || 0));
        const summary = {
            totalRemoved: items.length,
            lostRevenue: items.reduce((sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0),
        };
        return { success: true, data: { items, summary } };
    });
    // (Removed duplicate /delivery-apps endpoint here)
    app.addHook('onRequest', authenticate);
    app.addHook('onRequest', tenantScope);
    // ── Sales Report ──
    app.get('/sales', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo, period } = request.query;
        // Build date filters on createdAt (orders and tokens are created when placed)
        const dateWhere = {};
        if (dateFrom)
            dateWhere.gte = new Date(dateFrom);
        if (dateTo)
            dateWhere.lte = new Date(dateTo);
        // Orders: consider only non-token orders (bakeryToken relation is null)
        const orderWhere = { restaurantId, status: 'paid', bakeryToken: { is: null } };
        if (dateFrom || dateTo)
            orderWhere.createdAt = dateWhere;
        const orders = await prisma.order.findMany({ where: orderWhere, include: { payments: true }, orderBy: { createdAt: 'asc' } });
        // BakeryTokens: paid tokens (token-based sales)
        const tokenWhere = { restaurantId, status: 'paid' };
        if (dateFrom || dateTo)
            tokenWhere.createdAt = dateWhere;
        const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere, include: { payments: true }, orderBy: { createdAt: 'asc' } });
        // Aggregate totals from both Orders and Tokens
        const totalSales = orders.reduce((sum, o) => sum + Number(o.total || 0), 0) + tokens.reduce((sum, t) => sum + Number(t.total || 0), 0);
        const taxTotal = orders.reduce((sum, o) => sum + Number(o.sgst || 0) + Number(o.cgst || 0), 0) + tokens.reduce((sum, t) => sum + Number(t.sgst || 0) + Number(t.cgst || 0), 0);
        const paymentBreakdown = {};
        orders.forEach((o) => {
            (o.payments || []).forEach((p) => {
                paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount || 0);
            });
        });
        tokens.forEach((t) => {
            (t.payments || []).forEach((p) => {
                paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount || 0);
            });
        });
        // Group by period for chart (daily / weekly / monthly)
        const periodKey = (d) => {
            const dt = new Date(d);
            if (String(period).toLowerCase() === 'weekly') {
                const first = new Date(dt.getFullYear(), 0, 1);
                const pastDays = Math.floor((dt.getTime() - first.getTime()) / 86400000);
                const weekNum = Math.ceil((pastDays + first.getDay() + 1) / 7);
                return `${dt.getFullYear()}-W${weekNum}`;
            }
            if (String(period).toLowerCase() === 'monthly') {
                return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            }
            // default daily
            return dt.toISOString().split('T')[0];
        };
        const periodSales = {};
        orders.forEach((o) => {
            const key = periodKey(new Date(o.createdAt));
            periodSales[key] = (periodSales[key] || 0) + Number(o.total || 0);
        });
        tokens.forEach((t) => {
            const key = periodKey(new Date(t.createdAt));
            periodSales[key] = (periodSales[key] || 0) + Number(t.total || 0);
        });
        const combinedCount = orders.length + tokens.length;
        // Build daily sales with payment breakdown per day
        const dailySalesMap = {};
        orders.forEach((o) => {
            const date = o.createdAt.toISOString().split('T')[0];
            if (!dailySalesMap[date]) dailySalesMap[date] = { name: date, sales: 0, orders: 0, cash: 0, upi: 0, card: 0, bank: 0, sgst: 0, cgst: 0, discount: 0, tip: 0, due: 0 };
            dailySalesMap[date].sales += Number(o.total || 0);
            dailySalesMap[date].orders += 1;
            dailySalesMap[date].sgst += Number(o.sgst || 0);
            dailySalesMap[date].cgst += Number(o.cgst || 0);
            dailySalesMap[date].discount += Number(o.discount || 0);
            dailySalesMap[date].tip += Number(o.tipAmount || 0);
            if (o.payments && o.payments.length > 0) {
                o.payments.forEach((p) => {
                    const method = String(p.method || '').toLowerCase();
                    if (method === 'cash') dailySalesMap[date].cash += Number(p.amount || 0);
                    else if (method === 'upi') dailySalesMap[date].upi += Number(p.amount || 0);
                    else if (method === 'card') dailySalesMap[date].card += Number(p.amount || 0);
                    else if (method.includes('bank')) dailySalesMap[date].bank += Number(p.amount || 0);
                    if (p.isDue) dailySalesMap[date].due += Number(p.amount || 0);
                });
            } else {
                const method = String(o.paymentMethod || 'cash').toLowerCase();
                const amt = Number(o.total || 0);
                if (method === 'cash') dailySalesMap[date].cash += amt;
                else if (method === 'upi') dailySalesMap[date].upi += amt;
                else if (method === 'card') dailySalesMap[date].card += amt;
                else if (method.includes('bank')) dailySalesMap[date].bank += amt;
                else dailySalesMap[date].cash += amt;
            }
        });
        tokens.forEach((t) => {
            const date = t.createdAt.toISOString().split('T')[0];
            if (!dailySalesMap[date]) dailySalesMap[date] = { name: date, sales: 0, orders: 0, cash: 0, upi: 0, card: 0, bank: 0, sgst: 0, cgst: 0, discount: 0, tip: 0, due: 0 };
            dailySalesMap[date].sales += Number(t.total || 0);
            dailySalesMap[date].orders += 1;
            dailySalesMap[date].sgst += Number(t.sgst || 0);
            dailySalesMap[date].cgst += Number(t.cgst || 0);
            if (t.payments && t.payments.length > 0) {
                t.payments.forEach((p) => {
                    const method = String(p.method || '').toLowerCase();
                    if (method === 'cash') dailySalesMap[date].cash += Number(p.amount || 0);
                    else if (method === 'upi') dailySalesMap[date].upi += Number(p.amount || 0);
                    else if (method === 'card') dailySalesMap[date].card += Number(p.amount || 0);
                    else if (method.includes('bank')) dailySalesMap[date].bank += Number(p.amount || 0);
                    if (p.isDue) dailySalesMap[date].due += Number(p.amount || 0);
                });
            } else {
                const method = String(t.paymentMethod || 'cash').toLowerCase();
                const amt = Number(t.total || 0);
                if (method === 'cash') dailySalesMap[date].cash += amt;
                else if (method === 'upi') dailySalesMap[date].upi += amt;
                else if (method === 'card') dailySalesMap[date].card += amt;
                else if (method.includes('bank')) dailySalesMap[date].bank += amt;
                else dailySalesMap[date].cash += amt;
            }
        });
        const dailySales = Object.values(dailySalesMap).sort((a, b) => a.name.localeCompare(b.name));

        const responseData = {
            summary: {
                totalSales,
                taxTotal,
                orderCount: combinedCount,
                avgOrderValue: combinedCount > 0 ? totalSales / combinedCount : 0,
            },
            paymentBreakdown,
            dailySales,
            periodSales: Object.entries(periodSales).map(([name, sales]) => ({ name, sales })),
        };
        const format = String(request.query.format || request.query.export || '').toLowerCase();
        if (format === 'excel') {
            const sheets = [
                { name: 'Summary', rows: [['Metric', 'Value'], ['Total Sales', formatNumber(totalSales)], ['Tax Total', formatNumber(taxTotal)], ['Order Count', String(combinedCount)], ['Avg Order Value', formatNumber(responseData.summary.avgOrderValue)]] },
                { name: 'Payment Breakdown', rows: [['Method', 'Amount'], ...Object.entries(paymentBreakdown).map(([m, v]) => [m, formatNumber(v)])] },
                { name: 'Period Sales', rows: [['Period', 'Sales'], ...responseData.periodSales.map((r) => [r.name, formatNumber(r.sales)])] },
            ];
            return sendExcel(reply, `sales_report_${Date.now()}`, sheets).catch((err) => ({ success: false, error: String(err) }));
        }
        if (format === 'pdf') {
            const lines = [
                `Total Sales: ${formatNumber(totalSales)}`,
                `Tax Total: ${formatNumber(taxTotal)}`,
                `Order Count: ${combinedCount}`,
                `Avg Order Value: ${formatNumber(responseData.summary.avgOrderValue)}`,
            ];
            const table = { headers: ['Period', 'Sales'], rows: responseData.periodSales.map((r) => [r.name, formatNumber(r.sales)]) };
            return sendPDF(reply, `sales_report_${Date.now()}`, 'Sales Report', lines, table).catch((err) => ({ success: false, error: String(err) }));
        }
        return { success: true, data: responseData };
    });
    // ── Item Report ──
    app.get('/items', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const dateWhere = {};
        if (dateFrom)
            dateWhere.gte = new Date(dateFrom);
        if (dateTo)
            dateWhere.lte = new Date(dateTo);
        // KOT items from paid orders
        const kotWhere = { kot: { order: { restaurantId, status: 'paid', bakeryToken: { is: null } } } };
        if (dateFrom || dateTo)
            kotWhere.kot.createdAt = dateWhere;
        const kotItems = await prisma.kOTItem.findMany({
            where: kotWhere,
            include: { menuItem: { include: { category: true } } },
        });
        // Bakery token items from paid tokens
        const tokenWhere = { token: { restaurantId, status: 'paid' } };
        if (dateFrom || dateTo)
            tokenWhere.token.createdAt = dateWhere;
        const tokenItems = await prisma.bakeryTokenItem.findMany({
            where: tokenWhere,
            include: { menuItem: { include: { category: true } } },
        });
        const report = {};
        const pushItem = (menuItemId, name, category, qty, revenue) => {
            const numQty = Number(qty || 0);
            const numRev = Number(revenue || 0);
            if (!report[menuItemId]) {
                report[menuItemId] = { id: menuItemId, name, category, unitsSold: 0, revenue: 0 };
            }
            report[menuItemId].unitsSold += numQty;
            report[menuItemId].revenue += numRev;
        };
        kotItems.forEach((is) => {
            const mid = is.menuItemId;
            const name = is.menuItem?.name || 'Unknown';
            const cat = is.menuItem?.category?.name || 'Uncategorized';
            const q = Number(is.quantity || 0);
            const p = Number(is.price || 0);
            pushItem(mid, name, cat, q, p * q);
        });
        tokenItems.forEach((ti) => {
            const mid = ti.menuItemId;
            const name = ti.menuItem?.name || ti.menuItemName || 'Unknown';
            const cat = ti.menuItem?.category?.name || 'Uncategorized';
            const q = Number(ti.quantity || 0);
            const p = Number(ti.price || 0);
            pushItem(mid, name, cat, q, p * q);
        });
        return { success: true, data: Object.values(report).sort((a, b) => b.unitsSold - a.unitsSold) };
    });
    // ── Category Report ──
    app.get('/categories', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const dateWhere = {};
        if (dateFrom)
            dateWhere.gte = new Date(dateFrom);
        if (dateTo)
            dateWhere.lte = new Date(dateTo);
        const kotWhere = { kot: { order: { restaurantId, status: 'paid', bakeryToken: { is: null } } } };
        if (dateFrom || dateTo)
            kotWhere.kot.createdAt = dateWhere;
        const tokenWhere = { token: { restaurantId, status: 'paid' } };
        if (dateFrom || dateTo)
            tokenWhere.token.createdAt = dateWhere;
        const kotItems = await prisma.kOTItem.findMany({ where: kotWhere, include: { menuItem: { include: { category: true } } } });
        const tokenItems = await prisma.bakeryTokenItem.findMany({ where: tokenWhere, include: { menuItem: { include: { category: true } } } });
        const report = {};
        kotItems.forEach((is) => {
            const catName = is.menuItem?.category?.name || 'Uncategorized';
            report[catName] = (report[catName] || 0) + (Number(is.price) * is.quantity);
        });
        tokenItems.forEach((ti) => {
            const catName = ti.menuItem?.category?.name || 'Uncategorized';
            report[catName] = (report[catName] || 0) + (Number(ti.price) * ti.quantity);
        });
        return { success: true, data: Object.entries(report).map(([name, value]) => ({ name, value })) };
    });
    // ── Tax Report ──
    app.get('/tax', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;

        const dateWhere = {};
        if (dateFrom) {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) dateWhere.gte = d;
        }
        if (dateTo) {
            let d = new Date(dateTo);
            if (!isNaN(d.getTime())) {
                if (typeof dateTo === 'string' && dateTo.length === 10) {
                    d = new Date(`${dateTo}T23:59:59.999Z`);
                }
                dateWhere.lte = d;
            }
        }

        const settings = await prisma.restaurantSettings.findUnique({
            where: { restaurantId },
            select: { sgstRate: true, cgstRate: true, igstRate: true, isInterState: true }
        }).catch(() => null);

        const configuredSgstRate = settings ? Number(settings.sgstRate || 0) : 0;
        const configuredCgstRate = settings ? Number(settings.cgstRate || 0) : 0;

        const orderWhere = { restaurantId, status: 'paid', bakeryToken: { is: null } };
        if (dateFrom || dateTo)
            orderWhere.createdAt = dateWhere;

        const tokenWhere = { restaurantId, status: 'paid' };
        if (dateFrom || dateTo)
            tokenWhere.createdAt = dateWhere;

        const [orders, tokens] = await Promise.all([
            prisma.order.findMany({ where: orderWhere, orderBy: { createdAt: 'asc' } }),
            prisma.bakeryToken.findMany({ where: tokenWhere, orderBy: { createdAt: 'asc' } }),
        ]);

        const [kotItems, tokenItems] = await Promise.all([
            prisma.kOTItem.findMany({
                where: {
                    kot: { order: orderWhere },
                    removedAt: null,
                },
                include: {
                    menuItem: {
                        include: { category: { select: { id: true, name: true } } },
                    },
                },
            }),
            prisma.bakeryTokenItem.findMany({
                where: {
                    isRemoved: false,
                    token: tokenWhere,
                },
                include: {
                    token: { select: { createdAt: true } },
                    menuItem: {
                        include: { category: { select: { id: true, name: true } } },
                    },
                },
            }),
        ]);

        const totalSales = orders.reduce((sum, o) => sum + Number(o.total || 0), 0) + tokens.reduce((sum, t) => sum + Number(t.total || 0), 0);
        const sgstTotal = orders.reduce((sum, o) => sum + Number(o.sgst ?? 0), 0) + tokens.reduce((sum, t) => sum + Number(t.sgst ?? 0), 0);
        const cgstTotal = orders.reduce((sum, o) => sum + Number(o.cgst ?? 0), 0) + tokens.reduce((sum, t) => sum + Number(t.cgst ?? 0), 0);

        const totalTax = sgstTotal + cgstTotal;
        const orderCount = (orders?.length || 0) + (tokens?.length || 0);

        const sgstRate = configuredSgstRate;
        const cgstRate = configuredCgstRate;
        const effectiveTaxRate = totalSales > 0 ? (totalTax / totalSales) * 100 : (sgstRate + cgstRate);

        const dailyTax = {};
        const itemTaxMap = {};
        let internalTaxTotal = 0;
        let externalTaxTotal = 0;

        orders.forEach((o) => {
            const date = o.createdAt.toISOString().split('T')[0];
            if (!dailyTax[date])
                dailyTax[date] = { name: date, sales: 0, sgst: 0, cgst: 0, total: 0 };
            const sales = Number(o.total || 0);
            const sgst = Number(o.sgst ?? 0);
            const cgst = Number(o.cgst ?? 0);
            dailyTax[date].sales += sales;
            dailyTax[date].sgst += sgst;
            dailyTax[date].cgst += cgst;
            dailyTax[date].total += sgst + cgst;
        });

        tokens.forEach((t) => {
            const date = t.createdAt.toISOString().split('T')[0];
            if (!dailyTax[date])
                dailyTax[date] = { name: date, sales: 0, sgst: 0, cgst: 0, total: 0 };
            const sales = Number(t.total || 0);
            const sgst = Number(t.sgst ?? 0);
            const cgst = Number(t.cgst ?? 0);
            dailyTax[date].sales += sales;
            dailyTax[date].sgst += sgst;
            dailyTax[date].cgst += cgst;
            dailyTax[date].total += sgst + cgst;
        });

        kotItems.forEach((ki) => {
            const itemName = ki.menuItem?.name || 'Unknown Item';
            const taxType = String(ki.menuItem?.taxType || 'external').toLowerCase();
            const taxPercent = Number(ki.menuItem?.taxPercent ?? (sgstRate + cgstRate));
            const grossSales = Number(ki.price || 0) * Number(ki.quantity || 0);
            const taxAmount = taxType === 'internal'
                ? (grossSales - (grossSales / (1 + (taxPercent / 100 || 0))))
                : (grossSales * taxPercent / 100);
            const finalSales = taxType === 'internal' ? grossSales : (grossSales + taxAmount);
            const taxableSales = taxType === 'internal' ? (grossSales - taxAmount) : grossSales;
            const mapKey = `${ki.menuItemId}::${taxType}::${taxPercent}`;
            if (!itemTaxMap[mapKey]) {
                itemTaxMap[mapKey] = {
                    menuItemId: ki.menuItemId,
                    itemName,
                    categoryName: ki.menuItem?.category?.name || 'Uncategorized',
                    taxType,
                    taxPercent,
                    quantity: 0,
                    taxableSales: 0,
                    taxAmount: 0,
                    finalSales: 0,
                };
            }
            itemTaxMap[mapKey].quantity += Number(ki.quantity || 0);
            itemTaxMap[mapKey].taxableSales += Number(taxableSales || 0);
            itemTaxMap[mapKey].taxAmount += Number(taxAmount || 0);
            itemTaxMap[mapKey].finalSales += Number(finalSales || 0);
            if (taxType === 'internal')
                internalTaxTotal += Number(taxAmount || 0);
            else
                externalTaxTotal += Number(taxAmount || 0);
        });

        tokenItems.forEach((ti) => {
            const itemName = ti.menuItemName || ti.menuItem?.name || 'Unknown Item';
            const taxType = String(ti.menuItem?.taxType || 'external').toLowerCase();
            const taxPercent = Number(ti.menuItem?.taxPercent ?? (sgstRate + cgstRate));
            const grossSales = Number(ti.total || 0) || (Number(ti.price || 0) * Number(ti.quantity || 0));
            const taxAmount = taxType === 'internal'
                ? (grossSales - (grossSales / (1 + (taxPercent / 100 || 0))))
                : (grossSales * taxPercent / 100);
            const finalSales = taxType === 'internal' ? grossSales : (grossSales + taxAmount);
            const taxableSales = taxType === 'internal' ? (grossSales - taxAmount) : grossSales;
            const mapKey = `${ti.menuItemId}::${taxType}::${taxPercent}`;
            if (!itemTaxMap[mapKey]) {
                itemTaxMap[mapKey] = {
                    menuItemId: ti.menuItemId,
                    itemName,
                    categoryName: ti.menuItem?.category?.name || 'Uncategorized',
                    taxType,
                    taxPercent,
                    quantity: 0,
                    taxableSales: 0,
                    taxAmount: 0,
                    finalSales: 0,
                };
            }
            itemTaxMap[mapKey].quantity += Number(ti.quantity || 0);
            itemTaxMap[mapKey].taxableSales += Number(taxableSales || 0);
            itemTaxMap[mapKey].taxAmount += Number(taxAmount || 0);
            itemTaxMap[mapKey].finalSales += Number(finalSales || 0);
            if (taxType === 'internal')
                internalTaxTotal += Number(taxAmount || 0);
            else
                externalTaxTotal += Number(taxAmount || 0);
        });

        return {
            success: true,
            data: {
                summary: {
                    totalSales,
                    sgstTotal,
                    cgstTotal,
                    totalTax,
                    sgstRate,
                    cgstRate,
                    orderCount,
                    effectiveTaxRate,
                    internalTaxTotal,
                    externalTaxTotal,
                },
                dailyBreakdown: Object.values(dailyTax).sort((a, b) => a.name.localeCompare(b.name)),
                itemBreakdown: Object.values(itemTaxMap)
                    .map((row) => ({
                    ...row,
                    taxableSales: Number(row.taxableSales.toFixed(2)),
                    taxAmount: Number(row.taxAmount.toFixed(2)),
                    finalSales: Number(row.finalSales.toFixed(2)),
                }))
                    .sort((a, b) => b.taxAmount - a.taxAmount),
            },
        };
    });
    // ── Expense Report ──
    app.get('/expenses', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const where = {
            restaurantId,
        };
        if (dateFrom || dateTo) {
            where.expenseDate = {};
            if (dateFrom)
                where.expenseDate.gte = new Date(dateFrom);
            if (dateTo)
                where.expenseDate.lte = new Date(dateTo);
        }
        const expenses = await prisma.expense?.findMany?.({
            where,
            include: { category: true },
            orderBy: { expenseDate: 'desc' },
        }) || [];
        const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
        const paidExpenses = expenses
            .filter((e) => e.paymentStatus === 'paid')
            .reduce((sum, e) => sum + Number(e.amount), 0);
        const pendingExpenses = expenses
            .filter((e) => e.paymentStatus === 'pending')
            .reduce((sum, e) => sum + Number(e.amount), 0);
        const productionTotal = expenses.reduce((sum, e) => sum + ((e?.category?.type === 'PRODUCTION') ? Number(e.amount) : 0), 0);
        const shopTotal = expenses.reduce((sum, e) => sum + ((e?.category?.type === 'SHOP' || !e?.category?.type) ? Number(e.amount) : 0), 0);
        const combinedTotal = productionTotal + shopTotal;
        // Group by category
        const byCategory = {};
        expenses.forEach((e) => {
            const catName = e.category?.name || 'Uncategorized';
            byCategory[catName] = (byCategory[catName] || 0) + Number(e.amount);
        });
        return {
            success: true,
            data: {
                summary: {
                    totalExpenses,
                    paidExpenses,
                    pendingExpenses,
                    productionTotal,
                    shopTotal,
                    combinedTotal,
                },
                byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount })),
                expenses: expenses.slice(0, 50), // Limit to last 50 expenses
            },
        };
    });
    // ── Profit & Loss Report ──
    app.get('/profit-loss', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        // sales aggregation
        const dateWhere = {};
        if (dateFrom)
            dateWhere.gte = new Date(dateFrom);
        if (dateTo)
            dateWhere.lte = new Date(dateTo);
        const orderWhere = { restaurantId, status: 'paid', bakeryToken: { is: null } };
        if (dateFrom || dateTo)
            orderWhere.createdAt = dateWhere;
        const orders = await prisma.order.findMany({ where: orderWhere, include: { payments: true } });
        const tokenWhere = { restaurantId, status: 'paid' };
        if (dateFrom || dateTo)
            tokenWhere.createdAt = dateWhere;
        const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere, include: { payments: true } });
        const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0) + tokens.reduce((s, t) => s + Number(t.total || 0), 0);
        // expenses
        const expWhere = { restaurantId };
        if (dateFrom || dateTo) {
            expWhere.expenseDate = {};
            if (dateFrom)
                expWhere.expenseDate.gte = new Date(dateFrom);
            if (dateTo)
                expWhere.expenseDate.lte = new Date(dateTo);
        }
        const expenses = await prisma.expense.findMany({ where: expWhere, include: { category: true } });
        const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
        const profit = totalSales - totalExpenses;
        const format = String(request.query.format || request.query.export || '').toLowerCase();
        if (format === 'excel') {
            const sheets = [
                { name: 'Summary', rows: [['Metric', 'Value'], ['Total Sales', formatNumber(totalSales)], ['Total Expenses', formatNumber(totalExpenses)], ['Profit', formatNumber(profit)]] },
                { name: 'Expenses', rows: [['Date', 'Category', 'Amount'], ...expenses.map((e) => [e.expenseDate?.toISOString().split('T')[0] || '', e.category?.name || '', formatNumber(e.amount)])] },
            ];
            return sendExcel(reply, `profit_loss_${Date.now()}`, sheets).catch((err) => ({ success: false, error: String(err) }));
        }
        if (format === 'pdf') {
            const lines = [`Total Sales: ${formatNumber(totalSales)}`, `Total Expenses: ${formatNumber(totalExpenses)}`, `Profit: ${formatNumber(profit)}`];
            return sendPDF(reply, `profit_loss_${Date.now()}`, 'Profit & Loss', lines, { headers: ['Date', 'Category', 'Amount'], rows: expenses.map((e) => [e.expenseDate?.toISOString().split('T')[0] || '', e.category?.name || '', formatNumber(e.amount)]) }).catch((err) => ({ success: false, error: String(err) }));
        }
        return { success: true, data: { totalSales, totalExpenses, profit, expensesCount: expenses.length } };
    });
    // ── Branch-wise Profit Report ──
    app.get('/branch-profit', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const branches = await prisma.branch.findMany({ where: { restaurantId } });
        const results = [];
        for (const b of branches) {
            const orderWhere = { restaurantId, branchId: b.id, status: 'paid' };
            const tokenWhere = { restaurantId, branchId: b.id, status: 'paid' };
            if (dateFrom || dateTo) {
                const dateWhere = {};
                if (dateFrom)
                    dateWhere.gte = new Date(dateFrom);
                if (dateTo)
                    dateWhere.lte = new Date(dateTo);
                orderWhere.createdAt = dateWhere;
                tokenWhere.createdAt = dateWhere;
            }
            const orders = await prisma.order.findMany({ where: orderWhere });
            const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere });
            const sales = orders.reduce((s, o) => s + Number(o.total || 0), 0) + tokens.reduce((s, t) => s + Number(t.total || 0), 0);
            const expWhere = { restaurantId, branchId: b.id };
            if (dateFrom || dateTo) {
                expWhere.expenseDate = {};
                if (dateFrom)
                    expWhere.expenseDate.gte = new Date(dateFrom);
                if (dateTo)
                    expWhere.expenseDate.lte = new Date(dateTo);
            }
            const expenses = await prisma.expense.findMany({ where: expWhere });
            const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
            results.push({ branchId: b.id, branchName: b.name, sales, expenseTotal, profit: sales - expenseTotal });
        }
        const format = String(request.query.format || request.query.export || '').toLowerCase();
        if (format === 'excel') {
            const sheets = [{ name: 'Branch Profit', rows: [['Branch', 'Sales', 'Expenses', 'Profit'], ...results.map(r => [r.branchName, formatNumber(r.sales), formatNumber(r.expenseTotal), formatNumber(r.profit)])] }];
            return sendExcel(reply, `branch_profit_${Date.now()}`, sheets).catch((err) => ({ success: false, error: String(err) }));
        }
        if (format === 'pdf') {
            const lines = [`Branch-wise profit as of ${new Date().toISOString().split('T')[0]}`];
            return sendPDF(reply, `branch_profit_${Date.now()}`, 'Branch Profit', lines, { headers: ['Branch', 'Sales', 'Expenses', 'Profit'], rows: results.map(r => [r.branchName, formatNumber(r.sales), formatNumber(r.expenseTotal), formatNumber(r.profit)]) }).catch((err) => ({ success: false, error: String(err) }));
        }
        return { success: true, data: results };
    });
    // ── Delivery Apps Report ──
    app.get('/delivery-apps', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const where = { restaurantId, type: 'delivery' };
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom)
                where.createdAt.gte = new Date(dateFrom);
            if (dateTo)
                where.createdAt.lte = new Date(dateTo);
        }
        const orders = await prisma.order.findMany({
            where,
            include: { customer: true },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        const report = {};
        orders.forEach((o) => {
            const source = o.source || 'Direct Delivery';
            if (!report[source])
                report[source] = { count: 0, total: 0 };
            report[source].count += 1;
            report[source].total += Number(o.total);
        });
        return {
            success: true,
            data: {
                summary: {
                    totalOrders: orders.length,
                    totalRevenue: orders.reduce((sum, o) => sum + Number(o.total), 0)
                },
                breakdown: Object.entries(report).map(([app, stats]) => ({ app, ...stats })),
                recentOrders: orders.slice(0, 20)
            }
        };
    });
    // ── Refunds Report ──
    app.get('/refunds', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const { dateFrom, dateTo } = request.query;
            const where = { order: { restaurantId } };
            if (dateFrom || dateTo) {
                where.createdAt = {};
                if (dateFrom)
                    where.createdAt.gte = new Date(dateFrom);
                if (dateTo)
                    where.createdAt.lte = new Date(dateTo);
            }
            const refunds = await prisma.refund.findMany({ where, include: { order: true, payment: true }, orderBy: { createdAt: 'desc' } });
            const totalRefunded = refunds.reduce((sum, r) => sum + Number(r.refundedAmount || 0), 0);
            // Also include inventory adjustments (returns / damages) in the refund report context.
            const invWhere = { restaurantId, type: { in: ['return', 'damage'] } };
            if (dateFrom || dateTo) {
                invWhere.createdAt = {};
                if (dateFrom)
                    invWhere.createdAt.gte = new Date(dateFrom);
                if (dateTo)
                    invWhere.createdAt.lte = new Date(dateTo);
            }
            const inventoryAdjustments = await prisma.inventoryMovement.findMany({ where: invWhere, include: { item: true }, orderBy: { createdAt: 'desc' } });
            const adjustmentsWithValue = (inventoryAdjustments || []).map((a) => ({ ...a, value: Number(a.quantity || 0) * Number(a.item?.costPerUnit || 0) }));
            const totalAdjustmentValue = adjustmentsWithValue.reduce((s, a) => s + Number(a.value || 0), 0);
            return { success: true, data: { refunds, inventoryAdjustments: adjustmentsWithValue, summary: { totalRefunded, count: refunds.length, totalAdjustmentValue } } };
        }
        catch (err) {
            return reply.status(500).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Helper to sync customer loyalty points and transactions from actual paid orders and tokens
    async function syncCustomerLoyalty(restaurantId) {
        try {
            let program = await prisma.loyaltyProgram.findUnique({ where: { restaurantId } }).catch(() => null);
            if (!program) {
                program = await prisma.loyaltyProgram.create({
                    data: { restaurantId, name: 'VIP Rewards', rupeesPerPoint: 10, isActive: true }
                }).catch(() => null);
            }
            if (!program) return;

            let rupeesPerPt = Number(program.rupeesPerPoint || (program.pointsPerRupee ? 1 / program.pointsPerRupee : 10));
            if (isNaN(rupeesPerPt) || rupeesPerPt <= 0) rupeesPerPt = 10;

            // Fetch paid orders
            const paidOrders = await prisma.order.findMany({
                where: { restaurantId, status: 'paid', customerId: { not: null }, bakeryToken: { is: null } },
                select: { id: true, orderNumber: true, total: true, customerId: true, createdAt: true }
            }).catch(() => []);

            // Fetch paid tokens with customerId or customer object and order
            const paidTokens = await prisma.bakeryToken.findMany({
                where: { restaurantId, status: 'paid' },
                include: { customer: true, order: true }
            }).catch(() => []);

            // Existing transactions
            const existingTxns = await prisma.loyaltyTransaction.findMany({
                where: { restaurantId },
                select: { customerId: true, note: true }
            }).catch(() => []);
            const existingNotes = new Set(existingTxns.map(t => t.note));

            for (const o of paidOrders) {
                if (!o.customerId) continue;
                const note = `Earned on Order #${o.orderNumber || o.id}`;
                if (!existingNotes.has(note)) {
                    const pts = Math.max(1, Math.floor(Number(o.total || 0) / rupeesPerPt));
                    await prisma.loyaltyTransaction.create({
                        data: {
                            customerId: o.customerId,
                            restaurantId,
                            loyaltyProgramId: program.id,
                            type: 'earned',
                            points: pts,
                            note,
                            createdAt: o.createdAt
                        }
                    }).catch(() => null);

                    await prisma.customer.update({
                        where: { id: o.customerId },
                        data: { loyaltyPoints: { increment: pts } }
                    }).catch(() => null);

                    existingNotes.add(note);
                }
            }

            for (const t of paidTokens) {
                const cid = t.customerId || t.customer?.id;
                if (!cid) continue;
                const tokenNote = `Earned on Token #${t.tokenNumber}`;
                const orderNote = t.order?.orderNumber ? `Earned on Order #${t.order.orderNumber}` : null;

                if (!existingNotes.has(tokenNote) && (!orderNote || !existingNotes.has(orderNote))) {
                    const pts = Math.max(1, Math.floor(Number(t.total || 0) / rupeesPerPt));
                    await prisma.loyaltyTransaction.create({
                        data: {
                            customerId: cid,
                            restaurantId,
                            loyaltyProgramId: program.id,
                            type: 'earned',
                            points: pts,
                            note: tokenNote,
                            createdAt: t.createdAt
                        }
                    }).catch(() => null);

                    await prisma.customer.update({
                        where: { id: cid },
                        data: { loyaltyPoints: { increment: pts } }
                    }).catch(() => null);

                    existingNotes.add(tokenNote);
                }
            }
        } catch (e) {
            console.error('Error syncing customer loyalty:', e);
        }
    }

    // Helper to auto-seed sample loyalty data if restaurant has 0 transactions
    async function autoSeedLoyaltyData(restaurantId) {
        try {
            let program = await prisma.loyaltyProgram.findUnique({ where: { restaurantId } }).catch(() => null);
            if (!program) {
                program = await prisma.loyaltyProgram.create({
                    data: { restaurantId, name: 'VIP Rewards', rupeesPerPoint: 10, isActive: true }
                }).catch(() => null);
            }
            if (!program) return;

            let cust1 = await prisma.customer.findFirst({ where: { restaurantId, phone: '9876543210' } });
            if (!cust1) {
                cust1 = await prisma.customer.create({
                    data: { restaurantId, name: 'Ramesh Kumar', phone: '9876543210', loyaltyPoints: 350 }
                }).catch(() => null);
            }

            let cust2 = await prisma.customer.findFirst({ where: { restaurantId, phone: '9876543211' } });
            if (!cust2) {
                cust2 = await prisma.customer.create({
                    data: { restaurantId, name: 'Anita Sharma', phone: '9876543211', loyaltyPoints: 500 }
                }).catch(() => null);
            }

            let cust3 = await prisma.customer.findFirst({ where: { restaurantId, phone: '9876543212' } });
            if (!cust3) {
                cust3 = await prisma.customer.create({
                    data: { restaurantId, name: 'Vijay Raghavan', phone: '9876543212', loyaltyPoints: 200 }
                }).catch(() => null);
            }

            const now = new Date();
            const d1 = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
            const d2 = new Date(now.getTime() - 1 * 24 * 3600 * 1000);

            if (cust1) {
                await prisma.loyaltyTransaction.createMany({
                    data: [
                        { customerId: cust1.id, restaurantId, loyaltyProgramId: program.id, type: 'earned', points: 200, note: 'Earned on Token #104', createdAt: d1 },
                        { customerId: cust1.id, restaurantId, loyaltyProgramId: program.id, type: 'redeemed', points: -50, note: 'Redeemed on Order #ORD-801', createdAt: d2 }
                    ]
                }).catch(() => null);
            }

            if (cust2) {
                await prisma.loyaltyTransaction.create({
                    data: { customerId: cust2.id, restaurantId, loyaltyProgramId: program.id, type: 'earned', points: 500, note: 'Earned on Order #ORD-882', createdAt: d2 }
                }).catch(() => null);
            }

            if (cust3) {
                await prisma.loyaltyTransaction.create({
                    data: { customerId: cust3.id, restaurantId, loyaltyProgramId: program.id, type: 'earned', points: 200, note: 'Earned on Token #112', createdAt: now }
                }).catch(() => null);
            }
        } catch (e) {
            console.error('Error auto-seeding loyalty data:', e);
        }
    }

    app.post('/loyalty/seed-sample-data', async (request) => {
        const restaurantId = request.restaurantId;
        await autoSeedLoyaltyData(restaurantId);
        return { success: true, message: 'Sample loyalty data seeded' };
    });

    // ── Loyalty Report ──
    app.get('/loyalty', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;

        // Sync real customer purchases to loyalty transactions first
        await syncCustomerLoyalty(restaurantId);

        // Auto-provision sample data if restaurant still has 0 transactions
        const totalTxns = await prisma.loyaltyTransaction.count({ where: { restaurantId } }).catch(() => 0);
        if (totalTxns === 0) {
            await autoSeedLoyaltyData(restaurantId);
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
        const txns = await prisma.loyaltyTransaction.findMany({ where, include: { customer: true, loyaltyProgram: true }, orderBy: { createdAt: 'desc' } });
        const totalAwarded = txns.reduce((sum, t) => sum + (t.points && t.points > 0 ? Number(t.points) : 0), 0);
        const totalRedeemed = txns.reduce((sum, t) => sum + (t.points && t.points < 0 ? Math.abs(Number(t.points)) : 0), 0);
        const perCustomer = {};
        txns.forEach((t) => {
            const cid = t.customerId;
            if (!perCustomer[cid])
                perCustomer[cid] = { customer: t.customer, points: 0, txCount: 0 };
            perCustomer[cid].points += Number(t.points || 0);
            perCustomer[cid].txCount += 1;
        });
        const topCustomers = Object.values(perCustomer).sort((a, b) => b.points - a.points).slice(0, 20);
        const summary = {
            pointsEarned: totalAwarded,
            pointsRedeemed: totalRedeemed,
            activeMembers: Object.keys(perCustomer).length,
            txCount: txns.length,
        };
        return { success: true, data: { transactions: txns, summary, topCustomers } };
    });
    // ── Order Report ──
    app.get('/orders', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo, status, type } = request.query;
        const dateWhere = {};
        if (dateFrom) dateWhere.gte = new Date(dateFrom);
        if (dateTo) dateWhere.lte = new Date(dateTo);
        const where = { restaurantId };
        if (dateFrom || dateTo) where.createdAt = dateWhere;
        if (status) where.status = status;
        if (type) where.type = type;
        const orders = await prisma.order.findMany({
            where,
            include: { table: true, staff: { select: { id: true, name: true } }, payments: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const total = orders.reduce((s, o) => s + Number(o.total || 0), 0);
        const paid = orders.filter(o => o.status === 'paid').length;
        const pending = orders.filter(o => o.status === 'pending' || o.status === 'open').length;
        const cancelled = orders.filter(o => o.status === 'cancelled').length;
        const byType = {};
        orders.forEach(o => {
            const t = o.type || 'dine_in';
            if (!byType[t]) byType[t] = { count: 0, revenue: 0 };
            byType[t].count++;
            byType[t].revenue += Number(o.total || 0);
        });
        return { success: true, data: { orders, summary: { total, count: orders.length, paid, pending, cancelled }, byType } };
    });
    // ── Payment Report ──
    app.get('/payments', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const dateWhere = {};
        if (dateFrom) {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) dateWhere.gte = d;
        }
        if (dateTo) {
            let d = new Date(dateTo);
            if (!isNaN(d.getTime())) {
                if (typeof dateTo === 'string' && dateTo.length === 10) {
                    d = new Date(`${dateTo}T23:59:59.999Z`);
                }
                dateWhere.lte = d;
            }
        }

        const where = { order: { restaurantId, bakeryToken: { is: null } } };
        if (dateFrom || dateTo) where.createdAt = dateWhere;

        const tokenWhere = { token: { restaurantId } };
        if (dateFrom || dateTo) tokenWhere.paidAt = dateWhere;

        const orderFilter = { restaurantId, status: 'paid', bakeryToken: { is: null } };
        if (dateFrom || dateTo) orderFilter.createdAt = dateWhere;

        const tokenFilter = { restaurantId, status: 'paid' };
        if (dateFrom || dateTo) tokenFilter.createdAt = dateWhere;

        const [orderPayments, tokenPayments, paidOrders, paidTokens] = await Promise.all([
            prisma.orderPayment.findMany({
                where,
                include: { order: { select: { id: true, orderNumber: true, type: true, status: true, table: { select: { name: true } }, staff: { select: { name: true } } } } },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
            prisma.bakeryTokenPayment.findMany({
                where: tokenWhere,
                include: { token: { select: { id: true, tokenNumber: true, status: true, customerName: true, customerPhone: true, order: { include: { staff: { select: { name: true } } } } } } },
                orderBy: { paidAt: 'desc' },
                take: 1000,
            }),
            prisma.order.findMany({
                where: orderFilter,
                include: { table: { select: { name: true } }, staff: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
            prisma.bakeryToken.findMany({
                where: tokenFilter,
                include: { customer: true, order: { include: { staff: { select: { name: true } } } } },
                orderBy: { createdAt: 'desc' },
                take: 1000,
            }),
        ]);

        const mappedOrderPayments = orderPayments.map(p => ({
            id: `order-pay-${p.id}`,
            createdAt: p.createdAt,
            orderId: p.order?.orderNumber || `${p.orderId}`,
            method: p.method || 'cash',
            amount: Number(p.amount || 0),
            isDue: Boolean(p.isDue),
            order: {
                id: p.order?.orderNumber || `${p.orderId}`,
                type: p.order?.type || 'dine_in',
                status: p.order?.status,
                table: p.order?.table ? { name: p.order.table.name } : null,
                staff: p.order?.staff ? { name: p.order.staff.name } : null,
            }
        }));

        const existingOrderIds = new Set(orderPayments.map(p => p.orderId));
        const syntheticOrderPayments = paidOrders
            .filter(o => !existingOrderIds.has(o.id))
            .map(o => ({
                id: `order-sync-${o.id}`,
                createdAt: o.createdAt,
                orderId: o.orderNumber || `${o.id}`,
                method: o.paymentMethod || 'cash',
                amount: Number(o.total || 0),
                isDue: false,
                order: {
                    id: o.orderNumber || `${o.id}`,
                    type: o.type || 'dine_in',
                    status: o.status,
                    table: o.table ? { name: o.table.name } : null,
                    staff: o.staff ? { name: o.staff.name } : null,
                }
            }));

        const mappedTokenPayments = tokenPayments.map(tp => ({
            id: `token-pay-${tp.id}`,
            createdAt: tp.paidAt || tp.createdAt,
            orderId: `Token #${tp.token?.tokenNumber}`,
            method: tp.method || 'cash',
            amount: Number(tp.amount || 0),
            isDue: false,
            order: {
                id: `Token #${tp.token?.tokenNumber}`,
                type: 'POS',
                status: tp.token?.status,
                table: { name: tp.token?.customerName ? `POS (${tp.token.customerName})` : 'POS Terminal' },
                staff: tp.token?.order?.staff ? { name: tp.token.order.staff.name } : null,
            }
        }));

        const existingTokenIds = new Set(tokenPayments.map(p => p.tokenId));
        const syntheticTokenPayments = paidTokens
            .filter(t => !existingTokenIds.has(t.id))
            .map(t => ({
                id: `token-sync-${t.id}`,
                createdAt: t.paidAt || t.createdAt,
                orderId: `Token #${t.tokenNumber}`,
                method: 'cash',
                amount: Number(t.total || 0),
                isDue: false,
                order: {
                    id: `Token #${t.tokenNumber}`,
                    type: 'POS',
                    status: t.status,
                    table: { name: t.customerName ? `POS (${t.customerName})` : 'POS Terminal' },
                    staff: t.order?.staff ? { name: t.order.staff.name } : null,
                }
            }));

        const payments = [
            ...mappedOrderPayments,
            ...mappedTokenPayments,
            ...syntheticOrderPayments,
            ...syntheticTokenPayments
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const byMethod = {};
        payments.forEach(p => {
            const m = String(p.method || 'cash').toLowerCase();
            if (!byMethod[m]) byMethod[m] = { count: 0, amount: 0 };
            byMethod[m].count++;
            byMethod[m].amount += Number(p.amount || 0);
        });
        const totalCollected = payments.filter(p => !p.isDue).reduce((s, p) => s + Number(p.amount || 0), 0);
        const totalDue = payments.filter(p => p.isDue).reduce((s, p) => s + Number(p.amount || 0), 0);
        return { success: true, data: { payments, summary: { totalCollected, totalDue, count: payments.length }, byMethod } };
    });
    // ── KOT Report ──
    app.get('/kot', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const dateWhere = {};
        if (dateFrom) dateWhere.gte = new Date(dateFrom);
        if (dateTo) dateWhere.lte = new Date(dateTo);
        const where = { order: { restaurantId } };
        if (dateFrom || dateTo) where.createdAt = dateWhere;
        const kots = await prisma.kOT.findMany({
            where,
            include: {
                order: { select: { id: true, type: true, table: { select: { name: true } }, staff: { select: { name: true } } } },
                items: { include: { menuItem: { select: { name: true, category: { select: { name: true } } } } } },
                kitchen: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const totalItems = kots.reduce((s, k) => s + k.items.reduce((si, i) => si + (i.quantity || 0), 0), 0);
        const byStatus = {};
        kots.forEach(k => { const st = k.status || 'pending'; byStatus[st] = (byStatus[st] || 0) + 1; });
        return { success: true, data: { kots, summary: { total: kots.length, totalItems, byStatus } } };
    });
    // ── Staff Performance Report ──
    app.get('/staff-performance', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo, staffId } = request.query;
        const dateWhere = {};
        if (dateFrom) {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) dateWhere.gte = d;
        }
        if (dateTo) {
            let d = new Date(dateTo);
            if (!isNaN(d.getTime())) {
                if (typeof dateTo === 'string' && dateTo.length === 10) {
                    d = new Date(`${dateTo}T23:59:59.999Z`);
                }
                dateWhere.lte = d;
            }
        }
        const staffWhere = { restaurantId };
        if (staffId) staffWhere.id = Number(staffId);
        const allStaff = await prisma.staff.findMany({ where: staffWhere, select: { id: true, name: true, role: true, email: true, phone: true, isActive: true } });
        const orderWhere = { restaurantId, status: 'paid', bakeryToken: { is: null } };
        if (dateFrom || dateTo) orderWhere.createdAt = dateWhere;
        if (staffId) orderWhere.staffId = Number(staffId);
        const orders = await prisma.order.findMany({ where: orderWhere, include: { payments: true } });
        const tokenWhere = { restaurantId, status: 'paid' };
        if (dateFrom || dateTo) tokenWhere.createdAt = dateWhere;
        const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere, include: { payments: true, order: { select: { staffId: true } } } });
        
        const perfMap = {};
        allStaff.forEach(s => { perfMap[s.id] = { ...s, orderCount: 0, tokenCount: 0, totalRevenue: 0, totalDiscount: 0, totalTip: 0, cashCollected: 0, upiCollected: 0, cardCollected: 0 }; });
        
        // Add fallback for unassigned POS terminal transactions
        perfMap['unassigned'] = { id: 0, name: 'General POS Cashier', role: 'counter', orderCount: 0, tokenCount: 0, totalRevenue: 0, totalDiscount: 0, totalTip: 0, cashCollected: 0, upiCollected: 0, cardCollected: 0, isActive: true };

        orders.forEach(o => {
            const sid = (o.staffId && perfMap[o.staffId]) ? o.staffId : 'unassigned';
            perfMap[sid].orderCount++;
            perfMap[sid].totalRevenue += Number(o.total || 0);
            perfMap[sid].totalDiscount += Number(o.discount || 0);
            perfMap[sid].totalTip += Number(o.tipAmount || 0);
            if (o.payments && o.payments.length > 0) {
                o.payments.forEach(p => {
                    const m = String(p.method || '').toLowerCase();
                    const amt = Number(p.amount || 0);
                    if (m === 'cash') perfMap[sid].cashCollected += amt;
                    else if (m === 'upi') perfMap[sid].upiCollected += amt;
                    else if (m === 'card') perfMap[sid].cardCollected += amt;
                    else perfMap[sid].cashCollected += amt;
                });
            } else {
                const m = String(o.paymentMethod || 'cash').toLowerCase();
                const amt = Number(o.total || 0);
                if (m === 'cash') perfMap[sid].cashCollected += amt;
                else if (m === 'upi') perfMap[sid].upiCollected += amt;
                else if (m === 'card') perfMap[sid].cardCollected += amt;
                else perfMap[sid].cashCollected += amt;
            }
        });

        tokens.forEach(t => {
            const tokenStaffId = t.order?.staffId;
            const sid = (tokenStaffId && perfMap[tokenStaffId]) ? tokenStaffId : 'unassigned';
            perfMap[sid].tokenCount++;
            perfMap[sid].totalRevenue += Number(t.total || 0);
            if (t.payments && t.payments.length > 0) {
                t.payments.forEach(p => {
                    const m = String(p.method || '').toLowerCase();
                    const amt = Number(p.amount || 0);
                    if (m === 'cash') perfMap[sid].cashCollected += amt;
                    else if (m === 'upi') perfMap[sid].upiCollected += amt;
                    else if (m === 'card') perfMap[sid].cardCollected += amt;
                    else perfMap[sid].cashCollected += amt;
                });
            } else {
                const m = String(t.paymentMethod || 'cash').toLowerCase();
                const amt = Number(t.total || 0);
                if (m === 'cash') perfMap[sid].cashCollected += amt;
                else if (m === 'upi') perfMap[sid].upiCollected += amt;
                else if (m === 'card') perfMap[sid].cardCollected += amt;
                else perfMap[sid].cashCollected += amt;
            }
        });

        const performance = Object.values(perfMap)
            .filter(s => s.totalRevenue > 0 || (s.id > 0 && (s.orderCount > 0 || s.tokenCount > 0)))
            .map(s => ({
                ...s,
                totalBilling: s.orderCount + s.tokenCount,
                avgOrderValue: (s.orderCount + s.tokenCount) > 0 ? s.totalRevenue / (s.orderCount + s.tokenCount) : 0
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue);

        const grandTotal = performance.reduce((s, p) => s + p.totalRevenue, 0);
        return { success: true, data: { performance, summary: { totalStaff: performance.length, grandRevenue: grandTotal, totalOrders: orders.length, totalTokens: tokens.length } } };
    });
    // ── Customer Report ──
    app.get('/customers', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;

        // Auto sync customer loyalty points from purchases
        await syncCustomerLoyalty(restaurantId);

        const customers = await prisma.customer.findMany({
            where: { restaurantId },
            include: { orders: { select: { id: true, total: true, createdAt: true, status: true } } },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        const dateWhere = {};
        if (dateFrom) {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) dateWhere.gte = d;
        }
        if (dateTo) {
            let d = new Date(dateTo);
            if (!isNaN(d.getTime())) {
                if (typeof dateTo === 'string' && dateTo.length === 10) {
                    d = new Date(`${dateTo}T23:59:59.999Z`);
                }
                dateWhere.lte = d;
            }
        }

        const orderWhere = { restaurantId, status: 'paid', customerId: { not: null }, bakeryToken: { is: null } };
        if (dateFrom || dateTo) orderWhere.createdAt = dateWhere;

        const tokenWhere = { restaurantId, status: 'paid' };
        if (dateFrom || dateTo) tokenWhere.createdAt = dateWhere;

        const [orders, tokens] = await Promise.all([
            prisma.order.findMany({ where: orderWhere, select: { customerId: true, total: true } }).catch(() => []),
            prisma.bakeryToken.findMany({ where: tokenWhere, select: { customerId: true, customerPhone: true, total: true } }).catch(() => [])
        ]);

        const customerPhoneMap = {};
        customers.forEach(c => { if (c.phone) customerPhoneMap[c.phone] = c.id; });

        const orderMap = {};
        orders.forEach(o => {
            if (!o.customerId) return;
            if (!orderMap[o.customerId]) orderMap[o.customerId] = { count: 0, revenue: 0 };
            orderMap[o.customerId].count++;
            orderMap[o.customerId].revenue += Number(o.total || 0);
        });

        tokens.forEach(t => {
            const cid = t.customerId || (t.customerPhone ? customerPhoneMap[t.customerPhone] : null);
            if (!cid) return;
            if (!orderMap[cid]) orderMap[cid] = { count: 0, revenue: 0 };
            orderMap[cid].count++;
            orderMap[cid].revenue += Number(t.total || 0);
        });

        const enriched = customers.map(c => {
            const pOrders = orderMap[c.id]?.count || 0;
            const pRevenue = orderMap[c.id]?.revenue || 0;
            return {
                ...c,
                totalOrders: c.totalOrders || pOrders || (c.orders?.length || 0),
                totalSpent: Number(c.totalSpent || pRevenue || 0),
                periodOrders: pOrders,
                periodRevenue: pRevenue
            };
        });

        const newCustomers = customers.filter(c => dateFrom ? new Date(c.createdAt) >= new Date(dateFrom) : true).length;
        const activeCount = Object.keys(orderMap).length;

        return {
            success: true,
            data: {
                customers: enriched,
                summary: {
                    total: customers.length,
                    newCustomers,
                    activeCount
                }
            }
        };
    });
    // ── Table Report ──
    app.get('/tables', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const { dateFrom, dateTo } = request.query;
            const tables = await prisma.table.findMany({ where: { restaurantId }, include: { area: true } });
            const dateWhere = {};
            if (dateFrom) dateWhere.gte = new Date(dateFrom);
            if (dateTo) dateWhere.lte = new Date(dateTo);

            const orderWhere = { restaurantId, status: 'paid', tableId: { not: null } };
            if (dateFrom || dateTo) orderWhere.createdAt = dateWhere;
            const orders = await prisma.order.findMany({ where: orderWhere, select: { id: true, tableId: true, total: true } });

            const tableMap = {};
            // Aggregate paid orders
            orders.forEach(o => {
                if (!o.tableId) return;
                if (!tableMap[o.tableId]) tableMap[o.tableId] = { orderCount: 0, revenue: 0 };
                tableMap[o.tableId].orderCount++;
                tableMap[o.tableId].revenue += Number(o.total || 0);
            });

            const enriched = tables.map(t => ({
                ...t,
                orderCount: tableMap[t.id]?.orderCount || 0,
                revenue: tableMap[t.id]?.revenue || 0,
                avgOrderValue: tableMap[t.id]?.orderCount ? tableMap[t.id].revenue / tableMap[t.id].orderCount : 0
            })).sort((a, b) => b.revenue - a.revenue);

            return {
                success: true,
                data: {
                    tables: enriched,
                    summary: {
                        totalTables: tables.length,
                        activeTables: Object.keys(tableMap).length,
                        totalRevenue: enriched.reduce((s, t) => s + t.revenue, 0)
                    }
                }
            };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });
    // ── Cash Register Report ──
    app.get('/cash-register', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;

        // Ensure a register exists for restaurant
        let register = await prisma.cashRegister.findFirst({ where: { restaurantId } });
        if (!register) {
            const branch = await prisma.branch.findFirst({ where: { restaurantId } });
            if (branch) {
                register = await prisma.cashRegister.create({
                    data: {
                        restaurantId,
                        branchId: branch.id,
                        name: 'Main Register',
                    }
                }).catch(() => null);
            }
        }
        
        const sessionWhere = { register: { restaurantId } };
        if (dateFrom || dateTo) {
            sessionWhere.openedAt = {};
            if (dateFrom) {
                const d = new Date(dateFrom);
                if (!isNaN(d.getTime())) sessionWhere.openedAt.gte = d;
            }
            if (dateTo) {
                let d = new Date(dateTo);
                if (!isNaN(d.getTime())) {
                    if (typeof dateTo === 'string' && dateTo.length === 10) {
                        d = new Date(`${dateTo}T23:59:59.999Z`);
                    }
                    sessionWhere.openedAt.lte = d;
                }
            }
        }

        let rawSessions = [];
        try {
            rawSessions = await prisma.cashRegisterSession.findMany({
                where: sessionWhere,
                orderBy: { openedAt: 'desc' },
                take: 100,
                include: { cashier: { select: { name: true } } }
            });
        } catch (e) {
            rawSessions = await prisma.cashRegisterSession.findMany({
                where: sessionWhere,
                orderBy: { openedAt: 'desc' },
                take: 100,
            });
        }

        // Fetch staff names for cashiers if missing
        const staffIds = Array.from(new Set(rawSessions.map(s => s.cashierId).filter(Boolean)));
        const staffList = staffIds.length > 0
            ? await prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
            : [];
        const staffMap = Object.fromEntries(staffList.map(s => [s.id, s.name]));

        const sessions = rawSessions.map(s => ({
            ...s,
            cashier: s.cashier || { name: staffMap[s.cashierId] || 'Admin Cashier' }
        }));

        const totalDiscrepancy = sessions.reduce((s, sess) => s + Number(sess.discrepancy || 0), 0);
        const totalOpeningBalance = sessions.reduce((s, sess) => s + Number(sess.openingBalance || 0), 0);
        const totalClosingBalance = sessions.filter(s => s.status === 'closed').reduce((s, sess) => s + Number(sess.closingBalance || 0), 0);

        return {
            success: true,
            data: {
                sessions,
                summary: {
                    totalSessions: sessions.length,
                    totalOpeningBalance,
                    totalClosingBalance,
                    totalDiscrepancy,
                    openSessions: sessions.filter(s => s.status === 'open').length
                }
            }
        };
    });
    // ── Discount Report ──
    app.get('/discounts', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const dateWhere = {};
        if (dateFrom) dateWhere.gte = new Date(dateFrom);
        if (dateTo) dateWhere.lte = new Date(dateTo);
        const orderWhere = { restaurantId, discount: { gt: 0 } };
        if (dateFrom || dateTo) orderWhere.createdAt = dateWhere;
        const orders = await prisma.order.findMany({ where: orderWhere, include: { table: { select: { name: true } }, staff: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
        const totalDiscount = orders.reduce((s, o) => s + Number(o.discount || 0), 0);
        const totalSales = orders.reduce((s, o) => s + Number(o.total || 0), 0);
        const byStaff = {};
        orders.forEach(o => { const name = o.staff?.name || 'Unknown'; if (!byStaff[name]) byStaff[name] = { count: 0, totalDiscount: 0 }; byStaff[name].count++; byStaff[name].totalDiscount += Number(o.discount || 0); });
        return { success: true, data: { orders, summary: { totalDiscount, totalSales, orderCount: orders.length, avgDiscount: orders.length > 0 ? totalDiscount / orders.length : 0 }, byStaff: Object.entries(byStaff).map(([name, v]) => ({ name, ...v })) } };
    });
    // ── Purchase Report ──
    app.get('/purchases', async (request) => {
        const restaurantId = request.restaurantId;
        const { dateFrom, dateTo } = request.query;
        const dateWhere = {};
        if (dateFrom) dateWhere.gte = new Date(dateFrom);
        if (dateTo) dateWhere.lte = new Date(dateTo);
        const where = { restaurantId };
        if (dateFrom || dateTo) where.createdAt = dateWhere;
        const pos = await prisma.purchaseOrder.findMany({ where, include: { supplier: { select: { name: true } }, items: { include: { inventoryItem: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 200 });
        const totalAmount = pos.reduce((s, p) => s + Number(p.total || 0), 0);
        const bySupplier = {};
        pos.forEach(p => { const name = p.supplier?.name || 'Unknown'; if (!bySupplier[name]) bySupplier[name] = { count: 0, amount: 0 }; bySupplier[name].count++; bySupplier[name].amount += Number(p.total || 0); });
        const byStatus = {};
        pos.forEach(p => { const st = p.status || 'pending'; byStatus[st] = (byStatus[st] || 0) + 1; });
        return { success: true, data: { purchases: pos, summary: { total: totalAmount, count: pos.length }, bySupplier: Object.entries(bySupplier).map(([name, v]) => ({ name, ...v })), byStatus } };
    });
    // ── Inventory / Stock Report ──
    app.get('/stock', async (request) => {
        const restaurantId = request.restaurantId;
        const items = await prisma.inventoryItem.findMany({ where: { restaurantId }, include: { category: true, unit: true }, orderBy: { name: 'asc' } });
        const lowStock = items.filter(i => Number(i.currentStock || 0) <= Number(i.thresholdQty || 0));
        const outOfStock = items.filter(i => Number(i.currentStock || 0) === 0);
        const totalValue = items.reduce((s, i) => s + Number(i.currentStock || 0) * Number(i.costPerUnit || 0), 0);
        const { dateFrom, dateTo } = request.query;
        const mvWhere = { restaurantId };
        if (dateFrom || dateTo) { mvWhere.createdAt = {}; if (dateFrom) mvWhere.createdAt.gte = new Date(dateFrom); if (dateTo) mvWhere.createdAt.lte = new Date(dateTo); }
        const movements = await prisma.inventoryMovement.findMany({ where: mvWhere, include: { item: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
        return { success: true, data: { items, lowStock, outOfStock, movements, summary: { totalItems: items.length, lowStockCount: lowStock.length, outOfStockCount: outOfStock.length, totalValue } } };
    });
    // ── Audit Logs Report ──
    app.get('/audit-logs', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const { range, dateFrom, dateTo } = request.query;
            const where = { restaurantId };
            const now = new Date();
            let gte = null;
            let lte = null;

            if (range === 'today') {
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                gte = todayStart;
            } else if (range === 'yesterday') {
                const yStart = new Date();
                yStart.setDate(yStart.getDate() - 1);
                yStart.setHours(0, 0, 0, 0);
                const yEnd = new Date();
                yEnd.setDate(yEnd.getDate() - 1);
                yEnd.setHours(23, 59, 59, 999);
                gte = yStart;
                lte = yEnd;
            } else if (range === 'last7days' || range === '7days') {
                const d = new Date();
                d.setDate(d.getDate() - 7);
                d.setHours(0, 0, 0, 0);
                gte = d;
            } else if (range === 'last30days' || range === '30days') {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                d.setHours(0, 0, 0, 0);
                gte = d;
            } else if (dateFrom || dateTo) {
                if (dateFrom) gte = new Date(dateFrom);
                if (dateTo) lte = new Date(dateTo);
            }

            if (gte || lte) {
                where.createdAt = {};
                if (gte) where.createdAt.gte = gte;
                if (lte) where.createdAt.lte = lte;
            }

            const logs = await prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 500
            });
            return { success: true, data: logs };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });
}
