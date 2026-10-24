import { authenticate } from '../../middleware/authenticate.js';
import axios from 'axios';
import { authorize } from '../../middleware/authorize.js';
import { prisma } from '../../app.js';
import bcrypt from 'bcryptjs';

import { normalizeStringArray, toDbArrayField } from '../../utils/prisma.js';

export async function superadminRoutes(app) {
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
        const { page = 1, limit = 20, search, status } = request.query;
        const skip = (Number(page) - 1) * Number(limit);
        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { email: { contains: search } },
            ];
        }
        if (status)
            where.status = status;
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
        const normalizedRestaurants = restaurants.map((restaurant) => ({
            ...restaurant,
            enabledModules: normalizeStringArray(restaurant.enabledModules, ['restaurant']),
        }));
        return {
            success: true,
            data: normalizedRestaurants,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        };
    });
    app.post('/restaurants', async (request, reply) => {
        const body = request.body;
        if (!body?.name?.trim() || !body?.email?.trim()) {
            return reply.status(400).send({ success: false, error: 'Restaurant name and email are required' });
        }
        const adminEmail = (body?.adminEmail || body?.email || '').trim().toLowerCase();
        const adminPassword = (body?.adminPassword || body?.password || '').trim();
        if (!adminEmail) {
            return reply.status(400).send({ success: false, error: 'Admin email is required' });
        }
        if (!adminPassword) {
            return reply.status(400).send({ success: false, error: 'Admin password is required' });
        }
        if ((body.workerEmail && !body.workerPassword) || (!body.workerEmail && body.workerPassword)) {
            return reply.status(400).send({ success: false, error: 'Worker email and worker password must both be provided' });
        }
        const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        // Check for existing
        const existing = await prisma.restaurant.findFirst({
            where: { OR: [{ email: body.email }, { slug }] },
        });
        if (existing) {
            return reply.status(400).send({ success: false, error: 'Restaurant with this email or name already exists' });
        }
        const existingAdminEmail = await prisma.staff.findFirst({
            where: { email: adminEmail },
            select: { id: true },
        });
        if (existingAdminEmail) {
            return reply.status(400).send({ success: false, error: 'Admin email is already used by another staff account' });
        }

        if (body.branchCode?.trim()) {
            const existingBranch = await prisma.branch.findFirst({
                where: { branchCode: body.branchCode.trim() },
                select: { id: true }
            });
            if (existingBranch) {
                return reply.status(400).send({
                    success: false,
                    error: `Branch Code "${body.branchCode.trim()}" is already in use by another branch.`
                });
            }
        }

        // ── Provision Tenant on Cloud SaaS if enabled ──
        if (body.syncToCloud) {
            const cloudUrl = process.env.CLOUD_SYNC_URL || 'https://bakery.smartgonext.com';
            const cloudSecret = process.env.CLOUD_SYNC_SECRET || 'restaurant-saas-sync-secret-key';
            try {
                const response = await axios.post(`${cloudUrl}/api/auth/provision-tenant`, {
                    name: body.name,
                    email: body.email,
                    phone: body.phone,
                    address: body.address,
                    branchName: body.branchName,
                    branchCode: body.branchCode,
                    adminName: body.adminName,
                    adminEmail: adminEmail,
                    adminPassword: adminPassword,
                    workerEmail: body.workerEmail,
                    workerPassword: body.workerPassword,
                    businessType: body.businessType,
                    packageId: body.packageId
                }, {
                    headers: {
                        'X-Sync-Token': cloudSecret
                    },
                    timeout: 12000
                });
                
                if (!response.data || !response.data.success) {
                    throw new Error(response.data?.error || 'Unknown cloud registration error');
                }
            } catch (err) {
                console.error('[CloudSync] Failed to provision tenant in cloud:', err.message);
                const cloudError = err.response?.data?.error || err.response?.data?.message || err.message;
                return reply.status(400).send({
                    success: false,
                    error: `Cloud Provisioning Failed: ${cloudError}`
                });
            }
        }

        // Validate enabled modules
        const enabledModules = normalizeStringArray(body.enabledModules, ['restaurant']);
        const hasCoreModule = enabledModules.includes('restaurant') || enabledModules.includes('hotel');
        if (!hasCoreModule) {
            return reply.status(400).send({
                success: false,
                error: 'At least one core module (Restaurant or Hotel) must be enabled'
            });
        }
        const hasAddon = ['cash_register', 'inventory', 'kitchens'].some((m) => enabledModules.includes(m));
        if (hasAddon && !enabledModules.includes('restaurant')) {
            return reply.status(400).send({
                success: false,
                error: 'Addon modules require Restaurant module to be enabled'
            });
        }
        const restaurant = await prisma.$transaction(async (tx) => {
            // Create restaurant
            const rest = await tx.restaurant.create({
                data: {
                    name: body.name,
                    slug,
                    email: body.email,
                    phone: body.phone,
                    address: body.address,
                    businessType: body.businessType || 'bakery',
                    enabledModules: toDbArrayField(enabledModules, ['restaurant']),
                },
            });
            // Create default branch
            const branchName = body.branchName?.trim() || 'Main Branch';
            const branchCode = body.branchCode?.trim() || `MAIN${String(rest.id).padStart(2, '0')}`;
            const branch = await tx.branch.create({
                data: {
                    restaurantId: rest.id,
                    name: branchName,
                    branchCode,
                    isDefault: true,
                },
            });
            // Create admin staff
            const hashedPassword = await bcrypt.hash(adminPassword, 10);
            await tx.staff.create({
                data: {
                    restaurantId: rest.id,
                    branchId: branch.id,
                    name: body.adminName?.trim() || `${body.name} Admin`,
                    email: adminEmail,
                    password: hashedPassword,
                    role: 'admin',
                    isActive: true,
                },
            });
            // Create optional worker staff if provided
            if (body.workerEmail && body.workerPassword) {
                const workerPasswordHash = await bcrypt.hash(body.workerPassword, 10);
                await tx.staff.create({
                    data: {
                        restaurantId: rest.id,
                        branchId: branch.id,
                        name: `${body.name} Worker`,
                        email: body.workerEmail,
                        password: workerPasswordHash,
                        role: 'waiter',
                        isActive: true,
                    },
                });
            }
            // Create default SubPOS and MainPOS terminals with collision prevention
            let subPosCode = `SUB-${rest.id}`;
            let mainPosCode = `MAIN-${rest.id}`;
            
            const existingSub = await tx.subPOSTerminal.findFirst({ where: { terminalCode: subPosCode } });
            if (existingSub) {
                subPosCode = `SUB-${rest.id}-${Math.floor(1000 + Math.random() * 9000)}`;
            }
            
            const existingMain = await tx.mainPOSTerminal.findFirst({ where: { terminalCode: mainPosCode } });
            if (existingMain) {
                mainPosCode = `MAIN-${rest.id}-${Math.floor(1000 + Math.random() * 9000)}`;
            }

            const subPosPinHash = await bcrypt.hash('1234', 10);
            const mainPosPinHash = await bcrypt.hash('1234', 10);
            await tx.subPOSTerminal.create({
                data: {
                    restaurantId: rest.id,
                    branchId: branch.id,
                    name: `${body.name} Sub POS`,
                    terminalCode: subPosCode,
                    pin: subPosPinHash,
                    groupIds: toDbArrayField([], []),
                },
            });
            await tx.mainPOSTerminal.create({
                data: {
                    restaurantId: rest.id,
                    branchId: branch.id,
                    name: `${body.name} Main POS`,
                    terminalCode: mainPosCode,
                    pin: mainPosPinHash,
                },
            });
            // Create subscription (required): selected package OR default package
            const selectedPackageId = body.packageId ? Number(body.packageId) : null;
            let pkg = null;
            if (selectedPackageId) {
                pkg = await tx.package.findUnique({ where: { id: selectedPackageId } });
            }
            if (!pkg) {
                pkg = await tx.package.findFirst({ where: { isDefault: true }, orderBy: { id: 'asc' } });
            }
            if (!pkg) {
                pkg = await tx.package.findFirst({ orderBy: { id: 'asc' } });
            }
            if (!pkg) {
                throw new Error('No package configured. Create at least one package before creating restaurants.');
            }
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
            // Create default settings
            await tx.restaurantSettings.create({
                data: { restaurantId: rest.id },
            });
            return rest;
        });
        return reply.status(201).send({
            success: true,
            data: restaurant,
            message: body.syncToCloud 
                ? 'Restaurant created locally and provisioned in cloud successfully!' 
                : 'Restaurant created successfully!',
        });
    });
    app.get('/restaurants/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const restId = Number(id);
            if (isNaN(restId)) {
                return reply.status(400).send({ success: false, error: 'Invalid restaurant ID' });
            }

            const restaurant = await prisma.restaurant.findUnique({
                where: { id: restId },
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
            return {
                success: true,
                data: {
                    ...restaurant,
                    enabledModules: normalizeStringArray(restaurant.enabledModules, ['restaurant']),
                },
            };
        } catch (err) {
            console.error(`[SuperAdmin] Error fetching restaurant ${request.params?.id}:`, err);
            return reply.status(500).send({ success: false, error: err.message || 'Internal server error' });
        }
    });
    app.put('/restaurants/:id', async (request, reply) => {
        try {
            const { id } = request.params;
            const body = request.body || {};
            const restaurantId = Number(id);
            if (isNaN(restaurantId)) {
                return reply.status(400).send({ success: false, error: 'Invalid restaurant ID' });
            }

            if ((body.workerEmail && !body.workerPassword) || (!body.workerEmail && body.workerPassword)) {
                return reply.status(400).send({ success: false, error: 'Worker email and worker password must both be provided' });
            }
            const adminEmail = (body?.adminEmail || body?.email || '').trim().toLowerCase();
            const restaurant = await prisma.$transaction(async (tx) => {
                const updatedRestaurant = await tx.restaurant.update({
                    where: { id: restaurantId },
                    data: {
                        name: body.name,
                        email: body.email,
                        phone: body.phone,
                        address: body.address,
                        status: body.status,
                        businessType: body.businessType,
                    },
                });

                let defaultBranch = await tx.branch.findFirst({
                    where: { restaurantId },
                    orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
                });
                
                // Auto-create default branch if missing
                if (!defaultBranch) {
                    defaultBranch = await tx.branch.create({
                        data: {
                            restaurantId,
                            name: 'Main Branch',
                            branchCode: `MAIN${String(restaurantId).padStart(2, '0')}`,
                            isDefault: true,
                        },
                    });
                }

                // Ensure this restaurant always has a login-capable admin account.
                const admin = await tx.staff.findFirst({
                    where: { restaurantId, role: 'admin' },
                    orderBy: { id: 'asc' },
                });
                const adminPassword = body.password?.trim() || body.adminPassword?.trim() || 'admin123';
                const adminHash = await bcrypt.hash(adminPassword, 10);
                const adminData = {
                    branchId: defaultBranch.id,
                    name: body.adminName?.trim() || `${updatedRestaurant.name} Admin`,
                    email: adminEmail || updatedRestaurant.email,
                    isActive: true,
                };
                if (admin) {
                    await tx.staff.update({
                        where: { id: admin.id },
                        data: {
                            ...adminData,
                            password: body.password || body.adminPassword ? adminHash : undefined,
                        },
                    });
                }
                else {
                    await tx.staff.create({
                        data: {
                            restaurantId,
                            ...adminData,
                            password: adminHash,
                            role: 'admin',
                        },
                    });
                }

                if (body.workerEmail && body.workerPassword) {
                    const worker = await tx.staff.findFirst({ where: { restaurantId, email: body.workerEmail } });
                    const workerHash = await bcrypt.hash(body.workerPassword, 10);
                    if (worker) {
                        await tx.staff.update({
                            where: { id: worker.id },
                            data: { password: workerHash, isActive: true, branchId: worker.branchId || defaultBranch.id },
                        });
                    }
                    else {
                        await tx.staff.create({
                            data: {
                                restaurantId,
                                branchId: defaultBranch.id,
                                name: `${updatedRestaurant.name} Worker`,
                                email: body.workerEmail,
                                password: workerHash,
                                role: 'waiter',
                                isActive: true,
                            },
                        });
                    }
                }
                return updatedRestaurant;
            });
            return { success: true, data: restaurant };
        } catch (err) {
            console.error(`[SuperAdmin] Error updating restaurant ${request.params?.id}:`, err);
            return reply.status(500).send({ success: false, error: err.message || 'Internal server error' });
        }
    });
    app.put('/restaurants/:id/modules', async (request, reply) => {
        const { id } = request.params;
        const enabledModules = normalizeStringArray(request.body?.enabledModules, ['restaurant']);
        // Validate: At least one core module required
        const hasCoreModule = enabledModules?.includes('restaurant') || enabledModules?.includes('hotel');
        if (!hasCoreModule) {
            return reply.status(400).send({
                success: false,
                error: 'At least one core module (Restaurant or Hotel) must be enabled'
            });
        }
        // Validate: Addons require Restaurant module
        const hasAddon = ['cash_register', 'inventory', 'kitchens'].some((m) => enabledModules?.includes(m));
        if (hasAddon && !enabledModules?.includes('restaurant')) {
            return reply.status(400).send({
                success: false,
                error: 'Addon modules require Restaurant module to be enabled'
            });
        }
        const restaurant = await prisma.restaurant.update({
            where: { id: Number(id) },
            data: { enabledModules: toDbArrayField(enabledModules, ['restaurant']) },
        });
        return {
            success: true,
            data: {
                ...restaurant,
                enabledModules: normalizeStringArray(restaurant.enabledModules, ['restaurant']),
            },
        };
    });
    app.delete('/restaurants/:id', async (request) => {
        const { id } = request.params;
        await prisma.restaurant.delete({ where: { id: Number(id) } });
        return { success: true, message: 'Restaurant deleted' };
    });
    app.post('/restaurants/:id/impersonate', async (request, reply) => {
        const { id } = request.params;
        const staff = await prisma.staff.findFirst({
            where: { restaurantId: Number(id), role: 'admin' },
            include: {
                restaurant: { select: { id: true, name: true, slug: true, status: true } },
                branch: { select: { id: true, name: true } }
            }
        });
        if (!staff)
            return reply.status(404).send({ success: false, error: 'No admin found for this restaurant' });
        const token = app.jwt.sign({
            id: staff.id,
            role: staff.role,
            restaurantId: staff.restaurantId,
            branchId: staff.branchId,
            staffId: staff.id,
        }, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
        const refreshToken = app.jwt.sign({ id: staff.id, type: 'refresh' }, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
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
        const normalizedPackages = packages.map((pkg) => ({
            ...pkg,
            modules: normalizeStringArray(pkg.modules, []),
        }));
        return { success: true, data: normalizedPackages };
    });
    app.post('/packages', async (request) => {
        const body = request.body;
        const pkg = await prisma.package.create({
            data: {
                ...body,
                modules: toDbArrayField(body.modules, []),
            },
        });
        return {
            success: true,
            data: {
                ...pkg,
                modules: normalizeStringArray(pkg.modules, []),
            },
        };
    });
    app.put('/packages/:id', async (request) => {
        const { id } = request.params;
        const body = request.body;
        const pkg = await prisma.package.update({
            where: { id: Number(id) },
            data: {
                ...body,
                modules: toDbArrayField(body.modules, []),
            },
        });
        return {
            success: true,
            data: {
                ...pkg,
                modules: normalizeStringArray(pkg.modules, []),
            },
        };
    });
    app.delete('/packages/:id', async (request) => {
        const { id } = request.params;
        await prisma.package.delete({ where: { id: Number(id) } });
        return { success: true, message: 'Package deleted' };
    });
    // ── Billing & Payments ──
    app.get('/billing', async (request) => {
        const { page = 1, limit = 20 } = request.query;
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
        const { page = 1, limit = 20 } = request.query;
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
        const { id } = request.params;
        const { status } = request.body;
        const req = await prisma.$transaction(async (tx) => {
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
                if (isAnnual)
                    endDate.setFullYear(endDate.getFullYear() + 1);
                else
                    endDate.setMonth(endDate.getMonth() + 1);
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
                }
                else {
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
        const body = request.body;
        const hashedPassword = await bcrypt.hash(body.password, 10);
        const member = await prisma.superAdminUser.create({
            data: { ...body, password: hashedPassword },
        });
        return { success: true, data: { ...member, password: undefined } };
    });
}
