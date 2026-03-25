import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function reportRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  // ── Sales Report ──
  app.get('/sales', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const where: any = {
      restaurantId,
      status: 'paid',
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const orders = await prisma.order.findMany({
      where,
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });

    // Summary calculations
    const totalSales = orders.reduce((sum: number, o: any) => sum + Number(o.total), 0);
    const taxTotal = orders.reduce((sum: number, o: any) => sum + Number(o.sgst) + Number(o.cgst), 0);
    
    const paymentBreakdown: Record<string, number> = {};
    orders.forEach((o: any) => {
      o.payments.forEach((p: any) => {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + Number(p.amount);
      });
    });

    // Group by date for chart
    const dailySales: Record<string, number> = {};
    orders.forEach((o: any) => {
      const date = o.createdAt.toISOString().split('T')[0];
      dailySales[date] = (dailySales[date] || 0) + Number(o.total);
    });

    return {
      success: true,
      data: {
        summary: {
          totalSales,
          taxTotal,
          orderCount: orders.length,
          avgOrderValue: orders.length > 0 ? totalSales / orders.length : 0,
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

    const where: any = {
      kot: { order: { restaurantId, status: 'paid' } },
    };

    if (dateFrom || dateTo) {
      where.kot.createdAt = {};
      if (dateFrom) where.kot.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.kot.createdAt.lte = new Date(dateTo);
    }

    const itemSales = await prisma.kOTItem.findMany({
      where,
      include: { menuItem: { include: { category: true } } },
    });

    const report: Record<number, any> = {};
    itemSales.forEach((is: any) => {
      if (!report[is.menuItemId]) {
        report[is.menuItemId] = {
          id: is.menuItemId,
          name: is.menuItem.name,
          category: is.menuItem.category?.name || 'Uncategorized',
          unitsSold: 0,
          revenue: 0,
        };
      }
      report[is.menuItemId].unitsSold += is.quantity;
      report[is.menuItemId].revenue += Number(is.price) * is.quantity;
    });

    return {
      success: true,
      data: Object.values(report).sort((a: any, b: any) => b.unitsSold - a.unitsSold),
    };
  });

  // ── Category Report ──
  app.get('/categories', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const where: any = {
      kot: { order: { restaurantId, status: 'paid' } },
    };

    if (dateFrom || dateTo) {
      where.kot.createdAt = {};
      if (dateFrom) where.kot.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.kot.createdAt.lte = new Date(dateTo);
    }

    const itemSales = await prisma.kOTItem.findMany({
      where,
      include: { menuItem: { include: { category: true } } },
    });

    const report: Record<string, number> = {};
    itemSales.forEach((is: any) => {
      const catName = is.menuItem.category?.name || 'Uncategorized';
      report[catName] = (report[catName] || 0) + (Number(is.price) * is.quantity);
    });

    return {
      success: true,
      data: Object.entries(report).map(([name, value]) => ({ name, value })),
    };
  });

  // ── Tax Report ──
  app.get('/tax', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { dateFrom, dateTo } = request.query as any;

    const where: any = {
      restaurantId,
      status: 'paid',
    };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    // Calculate tax breakdown
    const totalSales = orders.reduce((sum: number, o: any) => sum + Number(o.total), 0);
    const sgstTotal = orders.reduce((sum: number, o: any) => sum + Number(o.sgst || 0), 0);
    const cgstTotal = orders.reduce((sum: number, o: any) => sum + Number(o.cgst || 0), 0);
    const totalTax = sgstTotal + cgstTotal;

    // Group by date for daily breakdown
    const dailyTax: Record<string, any> = {};
    orders.forEach((o: any) => {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!dailyTax[date]) {
        dailyTax[date] = {
          name: date,
          sales: 0,
          sgst: 0,
          cgst: 0,
          total: 0,
        };
      }
      dailyTax[date].sales += Number(o.total);
      dailyTax[date].sgst += Number(o.sgst || 0);
      dailyTax[date].cgst += Number(o.cgst || 0);
      dailyTax[date].total += Number(o.sgst || 0) + Number(o.cgst || 0);
    });

    return {
      success: true,
      data: {
        summary: {
          totalSales,
          sgstTotal,
          cgstTotal,
          totalTax,
          sgstRate: 2.5,
          cgstRate: 2.5,
        },
        dailyBreakdown: Object.values(dailyTax),
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
}
