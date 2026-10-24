import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function reportRoutes(app: FastifyInstance) {
    // ── Cancelled Orders Report ──
    app.get('/cancelled-orders', async (request: any) => {
      const restaurantId = (request as any).restaurantId;
      const { dateFrom, dateTo } = request.query as any;
      const where: any = { restaurantId, status: 'cancelled' };
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo);
      }
      const orders = await prisma.order.findMany({
        where,
        include: { table: true, staff: true },
        orderBy: { createdAt: 'desc' },
      });
      const summary = {
        totalCancelled: orders.length,
        totalLostRevenue: orders.reduce((sum: number, o: any) => sum + Number(o.total), 0),
      };
      return { success: true, data: { orders, summary } };
    });

    // ── Due Payments Report ──
    app.get('/due-payments', async (request: any) => {
      const restaurantId = (request as any).restaurantId;
      const { dateFrom, dateTo } = request.query as any;
      const where: any = { isDue: true, order: { restaurantId } };
      if (dateFrom || dateTo) {
        where.paidAt = {};
        if (dateFrom) where.paidAt.gte = new Date(dateFrom);
        if (dateTo) where.paidAt.lte = new Date(dateTo);
      }
      const payments = await prisma.orderPayment.findMany({
        where,
        include: { order: true },
        orderBy: { paidAt: 'desc' },
      });
      const summary = {
        totalDue: payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        totalCollected: 0,
        pending: payments.length,
      };
      return { success: true, data: { payments, summary } };
    });

    // ── Removed KOT Items Report ──
    app.get('/removed-kot-items', async (request: any) => {
      const restaurantId = (request as any).restaurantId;
      const { dateFrom, dateTo } = request.query as any;
      // Include both KOTItem.removedAt and BakeryTokenItem.isRemoved (token-based removals)
      const kotWhere: any = { kot: { order: { restaurantId } }, removedAt: { not: null } };
      const tokenWhere: any = { token: { restaurantId }, isRemoved: true };

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
        ...kotItems.map((i: any) => ({
          id: i.id,
          source: 'kot',
          menuItemId: i.menuItemId,
          name: i.menuItem?.name,
          quantity: i.quantity,
          price: Number(i.price),
          removedAt: i.removedAt,
          details: { kotId: i.kotId, orderId: i.kot?.orderId },
        })),
        ...tokenItems.map((i: any) => ({
          id: i.id,
          source: 'token',
          menuItemId: i.menuItemId,
          name: i.menuItemName || i.menuItem?.name,
          quantity: i.quantity,
          price: Number(i.price),
          removedAt: i.removedAt,
          details: { tokenId: i.tokenId },
        })),
      ].sort((a: any, b: any) => (b.removedAt || 0) - (a.removedAt || 0));

      const summary = {
        totalRemoved: items.length,
        lostRevenue: items.reduce((sum: number, i: any) => sum + Number(i.price || 0) * Number(i.quantity || 0), 0),
      };

      return { success: true, data: { items, summary } };
    });

    // (Removed duplicate /delivery-apps endpoint here)
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  // ── Sales Report ──
  app.get('/sales', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;
    // Build date filters on createdAt (orders and tokens are created when placed)
    const dateWhere: any = {};
    if (dateFrom) dateWhere.gte = new Date(dateFrom);
    if (dateTo) dateWhere.lte = new Date(dateTo);

    // Orders: consider only non-token orders (bakeryToken relation is null)
    const orderWhere: any = { restaurantId, status: 'paid', bakeryToken: { is: null } };
    if (dateFrom || dateTo) orderWhere.createdAt = dateWhere;

    const orders = await prisma.order.findMany({ where: orderWhere, include: { payments: true }, orderBy: { createdAt: 'asc' } });

    // BakeryTokens: paid tokens (token-based sales)
    const tokenWhere: any = { restaurantId, status: 'paid' };
    if (dateFrom || dateTo) tokenWhere.createdAt = dateWhere;
    const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere, include: { payments: true } , orderBy: { createdAt: 'asc' } });

    // Aggregate totals from both Orders and Tokens
    const totalSales = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0) + tokens.reduce((sum: number, t: any) => sum + Number(t.total || 0), 0);
    const taxTotal = orders.reduce((sum: number, o: any) => sum + Number(o.sgst || 0) + Number(o.cgst || 0), 0) + tokens.reduce((sum: number, t: any) => sum + Number(t.sgst || 0) + Number(t.cgst || 0), 0);

    const paymentBreakdown: Record<string, number> = {};
    orders.forEach((o: any) => {
      (o.payments || []).forEach((p: any) => {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount || 0);
      });
    });
    tokens.forEach((t: any) => {
      (t.payments || []).forEach((p: any) => {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount || 0);
      });
    });

    // Group by date for chart (use createdAt)
    const dailySales: Record<string, number> = {};
    orders.forEach((o: any) => {
      const date = o.createdAt.toISOString().split('T')[0];
      dailySales[date] = (dailySales[date] || 0) + Number(o.total || 0);
    });
    tokens.forEach((t: any) => {
      const date = t.createdAt.toISOString().split('T')[0];
      dailySales[date] = (dailySales[date] || 0) + Number(t.total || 0);
    });

    const combinedCount = orders.length + tokens.length;

    return {
      success: true,
      data: {
        summary: {
          totalSales,
          taxTotal,
          orderCount: combinedCount,
          avgOrderValue: combinedCount > 0 ? totalSales / combinedCount : 0,
        },
        paymentBreakdown,
        dailySales: Object.entries(dailySales).map(([name, sales]) => ({ name, sales })),
      },
    };
  });

  // ── Item Report ──
  app.get('/items', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const dateWhere: any = {};
    if (dateFrom) dateWhere.gte = new Date(dateFrom);
    if (dateTo) dateWhere.lte = new Date(dateTo);

    // KOT items from paid orders
    const kotWhere: any = { kot: { order: { restaurantId, status: 'paid' } } };
    if (dateFrom || dateTo) kotWhere.kot.createdAt = dateWhere;

    const kotItems = await prisma.kOTItem.findMany({
      where: kotWhere,
      include: { menuItem: { include: { category: true } } },
    });

    // Bakery token items from paid tokens
    const tokenWhere: any = { token: { restaurantId, status: 'paid' } };
    if (dateFrom || dateTo) tokenWhere.token.createdAt = dateWhere;

    const tokenItems = await prisma.bakeryTokenItem.findMany({
      where: tokenWhere,
      include: { menuItem: { include: { category: true } } },
    });

    const report: Record<number, any> = {};

    const pushItem = (menuItemId: number, name: string, category: string, qty: number, revenue: number) => {
      if (!report[menuItemId]) {
        report[menuItemId] = { id: menuItemId, name, category, unitsSold: 0, revenue: 0 };
      }
      report[menuItemId].unitsSold += qty;
      report[menuItemId].revenue += revenue;
    };

    kotItems.forEach((is: any) => {
      const mid = is.menuItemId;
      const name = is.menuItem?.name || 'Unknown';
      const cat = is.menuItem?.category?.name || 'Uncategorized';
      pushItem(mid, name, cat, is.quantity, Number(is.price) * is.quantity);
    });

    tokenItems.forEach((ti: any) => {
      const mid = ti.menuItemId;
      const name = ti.menuItem?.name || ti.menuItemName || 'Unknown';
      const cat = ti.menuItem?.category?.name || 'Uncategorized';
      pushItem(mid, name, cat, ti.quantity, Number(ti.price) * ti.quantity);
    });

    return { success: true, data: Object.values(report).sort((a: any, b: any) => b.unitsSold - a.unitsSold) };
  });

  // ── Category Report ──
  app.get('/categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const dateWhere: any = {};
    if (dateFrom) dateWhere.gte = new Date(dateFrom);
    if (dateTo) dateWhere.lte = new Date(dateTo);

    const kotWhere: any = { kot: { order: { restaurantId, status: 'paid' } } };
    if (dateFrom || dateTo) kotWhere.kot.createdAt = dateWhere;

    const tokenWhere: any = { token: { restaurantId, status: 'paid' } };
    if (dateFrom || dateTo) tokenWhere.token.createdAt = dateWhere;

    const kotItems = await prisma.kOTItem.findMany({ where: kotWhere, include: { menuItem: { include: { category: true } } } });
    const tokenItems = await prisma.bakeryTokenItem.findMany({ where: tokenWhere, include: { menuItem: { include: { category: true } } } });

    const report: Record<string, number> = {};
    kotItems.forEach((is: any) => {
      const catName = is.menuItem?.category?.name || 'Uncategorized';
      report[catName] = (report[catName] || 0) + (Number(is.price) * is.quantity);
    });
    tokenItems.forEach((ti: any) => {
      const catName = ti.menuItem?.category?.name || 'Uncategorized';
      report[catName] = (report[catName] || 0) + (Number(ti.price) * ti.quantity);
    });

    return { success: true, data: Object.entries(report).map(([name, value]) => ({ name, value })) };
  });

  // ── Tax Report ──
  app.get('/tax', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const dateWhere: any = {};
    if (dateFrom) dateWhere.gte = new Date(dateFrom);
    if (dateTo) dateWhere.lte = new Date(dateTo);

    const orderWhere: any = { restaurantId, status: 'paid' };
    if (dateFrom || dateTo) orderWhere.createdAt = dateWhere;

    const tokenWhere: any = { restaurantId, status: 'paid' };
    if (dateFrom || dateTo) tokenWhere.createdAt = dateWhere;

    const orders = await prisma.order.findMany({ where: orderWhere, orderBy: { createdAt: 'asc' } });
    const tokens = await prisma.bakeryToken.findMany({ where: tokenWhere, orderBy: { createdAt: 'asc' } });

    const totalSales = orders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0) + tokens.reduce((sum: number, t: any) => sum + Number(t.total || 0), 0);
    const sgstTotal = orders.reduce((sum: number, o: any) => sum + Number(o.sgst || 0), 0) + tokens.reduce((sum: number, t: any) => sum + Number(t.sgst || 0), 0);
    const cgstTotal = orders.reduce((sum: number, o: any) => sum + Number(o.cgst || 0), 0) + tokens.reduce((sum: number, t: any) => sum + Number(t.cgst || 0), 0);
    const totalTax = sgstTotal + cgstTotal;
    const orderCount = (orders?.length || 0) + (tokens?.length || 0);
    const sgstRate = 2.5;
    const cgstRate = 2.5;
    const effectiveTaxRate = totalSales > 0 ? (totalTax / totalSales) * 100 : sgstRate + cgstRate;

    const dailyTax: Record<string, any> = {};
    orders.forEach((o: any) => {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!dailyTax[date]) dailyTax[date] = { name: date, sales: 0, sgst: 0, cgst: 0, total: 0 };
      dailyTax[date].sales += Number(o.total || 0);
      dailyTax[date].sgst += Number(o.sgst || 0);
      dailyTax[date].cgst += Number(o.cgst || 0);
      dailyTax[date].total += Number(o.sgst || 0) + Number(o.cgst || 0);
    });
    tokens.forEach((t: any) => {
      const date = t.createdAt.toISOString().split('T')[0];
      if (!dailyTax[date]) dailyTax[date] = { name: date, sales: 0, sgst: 0, cgst: 0, total: 0 };
      dailyTax[date].sales += Number(t.total || 0);
      dailyTax[date].sgst += Number(t.sgst || 0);
      dailyTax[date].cgst += Number(t.cgst || 0);
      dailyTax[date].total += Number(t.sgst || 0) + Number(t.cgst || 0);
    });

    return {
      success: true,
      data: {
        summary: { totalSales, sgstTotal, cgstTotal, totalTax, sgstRate, cgstRate, orderCount, effectiveTaxRate },
        dailyBreakdown: Object.values(dailyTax).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      },
    };
  });

  // ── Expense Report ──
  app.get('/expenses', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const where: any = {
      restaurantId,
    };

    if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (dateFrom) where.expenseDate.gte = new Date(dateFrom);
      if (dateTo) where.expenseDate.lte = new Date(dateTo);
    }

    const expenses = await prisma.expense?.findMany?.({
      where,
      include: { category: true },
      orderBy: { expenseDate: 'desc' },
    }) || [];

    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const paidExpenses = expenses
      .filter((e: any) => e.paymentStatus === 'paid')
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);
    const pendingExpenses = expenses
      .filter((e: any) => e.paymentStatus === 'pending')
      .reduce((sum: number, e: any) => sum + Number(e.amount), 0);

    // Group by category
    const byCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
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
        },
        byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount })),
        expenses: expenses.slice(0, 50), // Limit to last 50 expenses
      },
    };
  });

  // ── Delivery Apps Report ──
  app.get('/delivery-apps', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;
    const where: any = { restaurantId, type: 'delivery' };
    
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    
    const orders = await prisma.order.findMany({
      where,
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    
    const report: Record<string, { count: number; total: number }> = {};
    orders.forEach((o: any) => {
      const source = o.source || 'Direct Delivery';
      if (!report[source]) report[source] = { count: 0, total: 0 };
      report[source].count += 1;
      report[source].total += Number(o.total);
    });

    return {
      success: true,
      data: {
        summary: {
          totalOrders: orders.length,
          totalRevenue: orders.reduce((sum: number, o: any) => sum + Number(o.total), 0)
        },
        breakdown: Object.entries(report).map(([app, stats]) => ({ app, ...stats })),
        recentOrders: orders.slice(0, 20)
      }
    };
  });

  // ── Refunds Report ──
  app.get('/refunds', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;
    const where: any = { order: { restaurantId } };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    const refunds = await prisma.refund.findMany({ where, include: { order: true, payment: true }, orderBy: { createdAt: 'desc' } });
    const totalRefunded = refunds.reduce((sum: number, r: any) => sum + Number(r.refundedAmount || 0), 0);
    return { success: true, data: { refunds, summary: { totalRefunded, count: refunds.length } } };
  });

  // ── Loyalty Report ──
  app.get('/loyalty', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;
    const where: any = { restaurantId };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }
    const txns = await prisma.loyaltyTransaction.findMany({ where, include: { customer: true, loyaltyProgram: true }, orderBy: { createdAt: 'desc' } });
    const totalAwarded = txns.reduce((sum: number, t: any) => sum + (t.points && t.points > 0 ? Number(t.points) : 0), 0);
    const totalRedeemed = txns.reduce((sum: number, t: any) => sum + (t.points && t.points < 0 ? Math.abs(Number(t.points)) : 0), 0);
    const perCustomer: Record<number, any> = {};
    txns.forEach((t: any) => {
      const cid = t.customerId;
      if (!perCustomer[cid]) perCustomer[cid] = { customer: t.customer, points: 0, txCount: 0 };
      perCustomer[cid].points += Number(t.points || 0);
      perCustomer[cid].txCount += 1;
    });
    const topCustomers = Object.values(perCustomer).sort((a: any, b: any) => b.points - a.points).slice(0, 20);

    // Return fields matching frontend expectations
    const transactions = txns;
    const summary = {
      pointsEarned: totalAwarded,
      pointsRedeemed: totalRedeemed,
      activeMembers: Object.keys(perCustomer).length,
      txCount: txns.length,
    };

    return { success: true, data: { transactions, summary, topCustomers } };
  });
}
