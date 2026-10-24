import { prisma } from '../../app.js';
export async function loyaltyRoutes(app) {
    // Get Loyalty Program Settings
    app.get('/config', async (request) => {
        const restaurantId = request.restaurantId;
        const program = await prisma.loyaltyProgram.findUnique({
            where: { restaurantId },
        });
        return { success: true, data: program };
    });
    // Update Loyalty Program Settings
    app.put('/config', async (request) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({
            rupeesPerPoint: z.number().optional(),
            pointsPerRupee: z.number().optional(),
            minClaimPoints: z.number().optional(),
            maxClaimPercent: z.number().optional(),
            isActive: z.boolean().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const dbData = { ...body };
            if (dbData.rupeesPerPoint !== undefined) {
                dbData.pointsPerRupee = dbData.rupeesPerPoint > 0 ? 1 / dbData.rupeesPerPoint : 0;
                delete dbData.rupeesPerPoint;
            }
            const program = await prisma.loyaltyProgram.upsert({
                where: { restaurantId },
                update: dbData,
                create: { ...dbData, restaurantId },
            });
            return { success: true, data: program };
        }
        catch (err) {
            return { success: false, error: err?.message };
        }
    });
    // Get Customer Loyalty Profile
    app.get('/customers/:customerId', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { customerId } = request.params;
        const customer = await prisma.customer.findUnique({
            where: { id: Number(customerId), restaurantId },
            include: {
                loyaltyTransactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 50
                }
            }
        });
        if (!customer)
            return reply.status(404).send({ success: false, error: 'Customer not found' });
        // Aggregates
        const stats = await prisma.loyaltyTransaction.aggregate({
            where: { customerId: Number(customerId), restaurantId },
            _sum: { points: true },
        });
        return {
            success: true,
            data: {
                ...customer,
                totalPointsEarned: Number(stats._sum.points || 0),
            }
        };
    });
    // Claim Loyalty Points
    app.post('/customers/:customerId/claim', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { customerId } = request.params;
        const { z } = await import('zod');
        const schema = z.object({
            points: z.number().positive(),
            tokenId: z.number().optional(),
            reason: z.string().optional().default('Redemption'),
        });
        try {
            const { points, tokenId, reason } = schema.parse(request.body);
            const customer = await prisma.customer.findUnique({ where: { id: Number(customerId) } });
            if (!customer || customer.loyaltyPoints < points) {
                return reply.status(400).send({ success: false, error: 'Insufficient points' });
            }
            const program = await prisma.loyaltyProgram.findUnique({ where: { restaurantId } });
            if (!program)
                return reply.status(400).send({ success: false, error: 'Loyalty program not active' });
            if (points < program.minClaimPoints) {
                return reply.status(400).send({ success: false, error: `Minimum ${program.minClaimPoints} points required to claim` });
            }
            await prisma.$transaction([
                prisma.customer.update({
                    where: { id: Number(customerId) },
                    data: { loyaltyPoints: { decrement: points } }
                }),
                prisma.loyaltyTransaction.create({
                    data: {
                        restaurantId,
                        customerId: Number(customerId),
                        loyaltyProgramId: program.id,
                        type: 'redeemed',
                        points: -points,
                        note: reason,
                    }
                })
            ]);
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
    // Loyalty Report
    app.get('/report', async (request) => {
        const restaurantId = request.restaurantId;
        const customers = await prisma.customer.findMany({
            where: { restaurantId },
            select: {
                id: true, name: true, phone: true, loyaltyPoints: true, createdAt: true,
                _count: { select: { orders: true, loyaltyTransactions: true } }
            },
            orderBy: { loyaltyPoints: 'desc' }
        });
        return { success: true, data: customers };
    });
    // Add points/stamps manually (existing with adjustment)
    app.post('/transactions', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({
            customerId: z.number(),
            points: z.number().optional().default(0),
            stamps: z.number().optional().default(0),
            type: z.enum(['earned', 'redeemed', 'adjustment']),
            note: z.string().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const program = await prisma.loyaltyProgram.findUnique({ where: { restaurantId } });
            if (!program)
                return reply.status(400).send({ success: false, error: 'Loyalty program not active' });
            const transaction = await prisma.$transaction(async (tx) => {
                const txn = await tx.loyaltyTransaction.create({
                    data: {
                        ...body,
                        restaurantId,
                        loyaltyProgramId: program.id,
                    },
                });
                await tx.customer.update({
                    where: { id: body.customerId },
                    data: {
                        loyaltyPoints: { increment: body.points },
                        loyaltyStamps: { increment: body.stamps },
                    },
                });
                return txn;
            });
            return { success: true, data: transaction };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message });
        }
    });
}
