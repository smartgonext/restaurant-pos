import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { prisma } from '../../app.js';
import bcrypt from 'bcryptjs';

export async function superadminRoutes(app: FastifyInstance) {
  // All routes require superadmin auth
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', authorize(['superadmin', 'support']));

  // ── Dashboard ──
  app.get('/dashboard', async () => {
    const [totalRestaurants, activeSubscriptions, totalPayments, newThisMonth] = await Promise.all([
      prisma.restaurant.count(),
      prisma.subscription.count({ where: { status: { in: ['active', 'trial'] } } }),
      prisma.subscriptionPayment.aggregate({ _sum: { amount: true }, where: { status: 'success' } }),
      prisma.restaurant.count({
        where: {
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalRestaurants,
        activeSubscriptions,
        totalRevenue: totalPayments._sum.amount || 0,
        newRestaurants: newThisMonth,
        restaurantsChange: 12.5,
        subscriptionsChange: 8.3,
        revenueChange: 15.2,
      },
    };
  });

  // ── Restaurants CRUD ──
  app.get('/restaurants', async (request) => {
    const { page = 1, limit = 20, search, status } = request.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (status) where.status = status;

    const [restaurants, total] = await Promise.all([
      prisma.restaurant.findMany({
        where,
        include: {
          subscription: { include: { package: true } },
          _count: { select: { orders: true, staff: true, branches: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.restaurant.count({ where }),
    ]);

    return {
      success: true,
      data: restaurants,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };
  });

  app.post('/restaurants', async (request, reply) => {
    const body = request.body as any;
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check for existing
    const existing = await prisma.restaurant.findFirst({
      where: { OR: [{ email: body.email }, { slug }] },
    });
    if (existing) {
      return reply.status(400).send({ success: false, error: 'Restaurant with this email or name already exists' });
    }

    const restaurant = await prisma.$transaction(async (tx: any) => {
      // Create restaurant
      const rest = await tx.restaurant.create({
        data: {
          name: body.name,
          slug,
          email: body.email,
          phone: body.phone,
          address: body.address,
        },
      });

      // Create default branch
      const branch = await tx.branch.create({
        data: {
          restaurantId: rest.id,
          name: 'Main Branch',
          isDefault: true,
        },
      });

      // Create admin staff
      const hashedPassword = await bcrypt.hash(body.password || 'admin123', 10);
      await tx.staff.create({
        data: {
          restaurantId: rest.id,
          branchId: branch.id,
          name: body.name + ' Admin',
          email: body.email,
          password: hashedPassword,
          role: 'admin',
        },
      });

      // Create subscription
      if (body.packageId) {
        const pkg = await tx.package.findUnique({ where: { id: body.packageId } });
        if (pkg) {
          await tx.subscription.create({
            data: {
              restaurantId: rest.id,
              packageId: pkg.id,
              billingCycle: 'trial',
              status: 'trial',
              startDate: new Date(),
              endDate: new Date(Date.now() + pkg.trialDays * 24 * 60 * 60 * 1000),
            },
          });
        }
      }

      // Create default settings
      await tx.restaurantSettings.create({
        data: { restaurantId: rest.id },
      });

      return rest;
    });

    return reply.status(201).send({
      success: true,
      data: restaurant,
      message: 'Restaurant created successfully',
    });
  });

  app.get('/restaurants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: Number(id) },
      include: {
        subscription: { include: { package: true, payments: true } },
        branches: true,
        settings: true,
        _count: { select: { orders: true, staff: true, customers: true, menus: true } },
      },
    });
    if (!restaurant) {
      return reply.status(404).send({ success: false, error: 'Restaurant not found' });
    }
    return { success: true, data: restaurant };
  });

  app.put('/restaurants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const restaurant = await prisma.restaurant.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        address: body.address,
        status: body.status,
      },
    });
    return { success: true, data: restaurant };
  });

  app.delete('/restaurants/:id', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.restaurant.delete({ where: { id: Number(id) } });
    return { success: true, message: 'Restaurant deleted' };
  });

  app.post('/restaurants/:id/impersonate', async (request, reply) => {
    const { id } = request.params as { id: string };

    const staff = await prisma.staff.findFirst({
        where: { restaurantId: Number(id), role: 'admin' },
        include: {
            restaurant: { select: { id: true, name: true, slug: true, status: true } },
            branch: { select: { id: true, name: true } }
        }
    });

    if (!staff) return reply.status(404).send({ success: false, error: 'No admin found for this restaurant' });

    const token = (app as any).jwt.sign(
      {
        id: staff.id,
        role: staff.role,
        restaurantId: staff.restaurantId,
        branchId: staff.branchId,
        staffId: staff.id,
      },
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    const refreshToken = (app as any).jwt.sign(
      { id: staff.id, type: 'refresh' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    return {
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          avatar: staff.avatar,
          theme: staff.theme,
          language: staff.language,
          restaurant: staff.restaurant,
          branch: staff.branch,
        },
      },
    };
  });

  // ── Packages CRUD ──
  app.get('/packages', async () => {
    const packages = await prisma.package.findMany({
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, data: packages };
  });

  app.post('/packages', async (request) => {
    const body = request.body as any;
    const pkg = await prisma.package.create({ data: body });
    return { success: true, data: pkg };
  });

  app.put('/packages/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const pkg = await prisma.package.update({
      where: { id: Number(id) },
      data: body,
    });
    return { success: true, data: pkg };
  });

  app.delete('/packages/:id', async (request) => {
    const { id } = request.params as { id: string };
    await prisma.package.delete({ where: { id: Number(id) } });
    return { success: true, message: 'Package deleted' };
  });

  // ── Billing & Payments ──
  app.get('/billing', async (request) => {
    const { page = 1, limit = 20 } = request.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        include: {
          restaurant: { select: { name: true, email: true } },
          package: { select: { name: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.subscription.count(),
    ]);

    return {
      success: true,
      data: subscriptions,
      pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
    };
  });

  app.get('/payments', async (request) => {
    const { page = 1, limit = 20 } = request.query as any;
    const payments = await prisma.subscriptionPayment.findMany({
      include: {
        subscription: {
          include: {
            restaurant: { select: { name: true } },
            package: { select: { name: true } },
          },
        },
      },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: payments };
  });

  // ── Offline Requests ──
  app.get('/offline-requests', async () => {
    const requests = await prisma.offlinePaymentRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: requests };
  });

  app.put('/offline-requests/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    const req = await prisma.$transaction(async (tx: any) => {
      const updatedReq = await tx.offlinePaymentRequest.update({
        where: { id: Number(id) },
        data: { status },
        include: { package: true }
      });

      if (status === 'approved') {
        // Find existing subscription or create one
        let sub = await tx.subscription.findFirst({
          where: { restaurantId: updatedReq.restaurantId }
        });

        // Calculate end date based on billing cycle (monthly vs annual)
        const isAnnual = updatedReq.billingCycle === 'annual';
        const startDate = new Date();
        const endDate = new Date();
        if (isAnnual) endDate.setFullYear(endDate.getFullYear() + 1);
        else endDate.setMonth(endDate.getMonth() + 1);

        if (sub) {
          sub = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              packageId: updatedReq.packageId,
              status: 'active',
              billingCycle: updatedReq.billingCycle,
              startDate,
              endDate
            }
          });
        } else {
          sub = await tx.subscription.create({
            data: {
              restaurantId: updatedReq.restaurantId,
              packageId: updatedReq.packageId,
              status: 'active',
              billingCycle: updatedReq.billingCycle,
              startDate,
              endDate
            }
          });
        }

        // Record a payment
        await tx.subscriptionPayment.create({
          data: {
            subscriptionId: sub.id,
            amount: updatedReq.package ? Number(isAnnual ? updatedReq.package.annualPrice : updatedReq.package.monthlyPrice) || 0 : 0,
            currency: 'USD',
            status: 'success',
            paymentMethod: 'OFFLINE'
          }
        });
      }

      return updatedReq;
    });

    return { success: true, data: req };
  });

  // ── Members ──
  app.get('/members', async () => {
    const members = await prisma.superAdminUser.findMany({
      select: { id: true, name: true, email: true, role: true, avatar: true, createdAt: true },
    });
    return { success: true, data: members };
  });

  app.post('/members', async (request) => {
    const body = request.body as any;
    const hashedPassword = await bcrypt.hash(body.password, 10);
    const member = await prisma.superAdminUser.create({
      data: { ...body, password: hashedPassword },
    });
    return { success: true, data: { ...member, password: undefined } };
  });
}
