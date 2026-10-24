import { prisma } from '../../app.js';

async function autoSeedSampleDeliveryData(restaurantId) {
    try {
        const existingExecs = await prisma.deliveryExecutive.findMany({ where: { restaurantId } });
        let execs = existingExecs;

        if (existingExecs.length === 0) {
            const created = await Promise.all([
                prisma.deliveryExecutive.create({
                    data: { restaurantId, name: 'Ramesh Kumar (In-House)', phone: '9876543210', status: 'available' }
                }).catch(() => null),
                prisma.deliveryExecutive.create({
                    data: { restaurantId, name: 'Suresh V (In-House)', phone: '9876543211', status: 'busy' }
                }).catch(() => null),
                prisma.deliveryExecutive.create({
                    data: { restaurantId, name: 'Vikas Sharma (External / Dunzo)', phone: '9876543212', status: 'available' }
                }).catch(() => null)
            ]);
            execs = created.filter(Boolean);
        }

        // Auto-seed sample delivery orders if 0 delivery orders exist
        const deliveryOrdersCount = await prisma.order.count({
            where: { restaurantId, type: 'delivery' }
        }).catch(() => 0);

        if (deliveryOrdersCount === 0) {
            const branch = await prisma.branch.findFirst({ where: { restaurantId } });
            if (!branch) return;

            // Find or create customers
            let cust1 = await prisma.customer.findFirst({ where: { restaurantId, name: 'Anand Swaminathan' } });
            if (!cust1) {
                cust1 = await prisma.customer.create({
                    data: { restaurantId, name: 'Anand Swaminathan', phone: '9755155623', address: 'No. 42, MG Road, Sedarapet' }
                }).catch(() => null);
            }

            let cust2 = await prisma.customer.findFirst({ where: { restaurantId, name: 'Priya Rajan' } });
            if (!cust2) {
                cust2 = await prisma.customer.create({
                    data: { restaurantId, name: 'Priya Rajan', phone: '9840123456', address: 'Plot 15, Kovai Complex, Sedarapet' }
                }).catch(() => null);
            }

            const now = new Date();

            await prisma.order.createMany({
                data: [
                    {
                        restaurantId,
                        branchId: branch.id,
                        orderNumber: 'DEL-101',
                        type: 'delivery',
                        status: 'out_for_delivery',
                        paymentStatus: 'paid',
                        paymentMethod: 'cash',
                        total: 450,
                        customerId: cust1?.id,
                        deliveryExecutiveId: execs[0]?.id,
                        createdAt: now
                    },
                    {
                        restaurantId,
                        branchId: branch.id,
                        orderNumber: 'DEL-102',
                        type: 'delivery',
                        status: 'preparing',
                        paymentStatus: 'pending',
                        paymentMethod: 'upi',
                        total: 680,
                        customerId: cust2?.id,
                        createdAt: new Date(now.getTime() - 15 * 60 * 1000)
                    },
                    {
                        restaurantId,
                        branchId: branch.id,
                        orderNumber: 'DEL-103',
                        type: 'delivery',
                        status: 'out_for_delivery',
                        paymentStatus: 'paid',
                        paymentMethod: 'online',
                        total: 320,
                        customerId: cust1?.id,
                        deliveryExecutiveId: execs[1]?.id,
                        createdAt: new Date(now.getTime() - 35 * 60 * 1000)
                    }
                ]
            }).catch(() => null);
        }
    } catch (e) {
        console.error('Error auto-seeding delivery data:', e);
    }
}

export async function deliveryExecutiveRoutes(app) {
    // GET all delivery executives with auto-seeding fallback
    app.get('/', async (request) => {
        const restaurantId = request.restaurantId;
        let executives = await prisma.deliveryExecutive.findMany({
            where: { restaurantId },
            orderBy: { createdAt: 'desc' },
        });

        if (executives.length === 0) {
            await autoSeedSampleDeliveryData(restaurantId);
            executives = await prisma.deliveryExecutive.findMany({
                where: { restaurantId },
                orderBy: { createdAt: 'desc' },
            });
        }

        return { success: true, data: executives };
    });

    // Seed endpoint
    app.post('/seed-sample-data', async (request) => {
        const restaurantId = request.restaurantId;
        await autoSeedSampleDeliveryData(restaurantId);
        return { success: true, message: 'Delivery data seeded successfully' };
    });

    // Add Executive
    app.post('/', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body || {};
        const executive = await prisma.deliveryExecutive.create({
            data: {
                name: body.name,
                phone: body.phone || null,
                vehicleNumber: body.vehicleNumber || null,
                status: body.status || 'available',
                restaurantId
            },
        });
        return { success: true, data: executive };
    });

    // Update Executive
    app.put('/:id', async (request) => {
        const { id } = request.params;
        const body = request.body;
        const executive = await prisma.deliveryExecutive.update({
            where: { id: Number(id) },
            data: body,
        });
        return { success: true, data: executive };
    });

    // Delete Executive
    app.delete('/:id', async (request) => {
        const { id } = request.params;
        await prisma.deliveryExecutive.delete({ where: { id: Number(id) } });
        return { success: true, message: 'Executive deleted' };
    });
}
