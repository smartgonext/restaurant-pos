import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { emitToRestaurant } from '../../plugins/socket.js';
export async function expenseRoutes(app) {
    app.addHook('onRequest', authenticate);
    app.addHook('onRequest', tenantScope);
    // Categories
    app.get('/categories', async (request) => {
        const restaurantId = request.restaurantId;
        const categories = await prisma.expenseCategory.findMany({ where: { restaurantId }, orderBy: { name: 'asc' } });
        return { success: true, data: categories };
    });
    app.post('/categories', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({ name: z.string().min(1), description: z.string().optional(), type: z.enum(['PRODUCTION', 'SHOP']).optional() });
        try {
            const body = schema.parse(request.body);
            const category = await prisma.expenseCategory.create({ data: { restaurantId, name: body.name, description: body.description, type: body.type || 'SHOP' } });
            return { success: true, data: category };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.put('/categories/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const catId = Number(id);
        if (isNaN(catId))
            return reply.status(400).send({ success: false, error: 'Invalid category id' });
        const { z } = await import('zod');
        const schema = z.object({ name: z.string().min(1), description: z.string().optional(), type: z.enum(['PRODUCTION', 'SHOP']).optional() });
        try {
            const body = schema.parse(request.body);
            const existing = await prisma.expenseCategory.findFirst({ where: { id: catId, restaurantId } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'Category not found' });
            const updated = await prisma.expenseCategory.update({ where: { id: catId }, data: { name: body.name, description: body.description, type: body.type } });
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/categories/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const catId = Number(id);
        if (isNaN(catId))
            return reply.status(400).send({ success: false, error: 'Invalid category id' });
        try {
            const hasExpenses = await prisma.expense.findFirst({ where: { categoryId: catId } });
            if (hasExpenses)
                return reply.status(400).send({ success: false, error: 'Category has expenses and cannot be deleted' });
            await prisma.expenseCategory.delete({ where: { id: catId } });
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Expenses
    app.get('/', async (request) => {
        const restaurantId = request.restaurantId;
        const { from, to, categoryId } = request.query;
        const where = { restaurantId };
        if (categoryId)
            where.categoryId = Number(categoryId);
        if (from || to) {
            where.expenseDate = {};
            if (from)
                where.expenseDate.gte = new Date(from);
            if (to)
                where.expenseDate.lte = new Date(to);
        }
        const expenses = await prisma.expense.findMany({ where, orderBy: { expenseDate: 'desc' }, include: { category: true } });
        return { success: true, data: expenses };
    });
    app.post('/', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { z } = await import('zod');
        const schema = z.object({
            categoryId: z.number(),
            title: z.string().min(1),
            amount: z.number().positive(),
            expenseDate: z.string().optional(),
            paymentDate: z.string().optional(),
            dueDate: z.string().optional(),
            paymentStatus: z.string().optional(),
            paymentMethod: z.string().optional(),
            description: z.string().optional(),
            receiptUrl: z.string().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const cat = await prisma.expenseCategory.findFirst({ where: { id: body.categoryId, restaurantId } });
            if (!cat)
                return reply.status(400).send({ success: false, error: 'Invalid category id' });
            const expense = await prisma.expense.create({ data: {
                    restaurantId,
                    categoryId: body.categoryId,
                    title: body.title,
                    amount: Number(body.amount),
                    expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
                    paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
                    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
                    paymentStatus: body.paymentStatus || 'pending',
                    paymentMethod: body.paymentMethod,
                    description: body.description,
                    receiptUrl: body.receiptUrl
                } });
            try {
                emitToRestaurant(restaurantId, 'expense.created', expense);
            }
            catch (e) { }
            return { success: true, data: expense };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.get('/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const expId = Number(id);
        if (isNaN(expId))
            return reply.status(400).send({ success: false, error: 'Invalid expense id' });
        const expense = await prisma.expense.findFirst({ where: { id: expId, restaurantId }, include: { category: true } });
        if (!expense)
            return reply.status(404).send({ success: false, error: 'Expense not found' });
        return { success: true, data: expense };
    });
    app.put('/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const expId = Number(id);
        if (isNaN(expId))
            return reply.status(400).send({ success: false, error: 'Invalid expense id' });
        const { z } = await import('zod');
        const schema = z.object({
            categoryId: z.number().optional(),
            title: z.string().optional(),
            amount: z.number().optional(),
            expenseDate: z.string().optional(),
            paymentDate: z.string().optional(),
            dueDate: z.string().optional(),
            paymentStatus: z.string().optional(),
            paymentMethod: z.string().optional(),
            description: z.string().optional(),
            receiptUrl: z.string().optional(),
        });
        try {
            const body = schema.parse(request.body);
            const updateData = {};
            if (body.categoryId !== undefined)
                updateData.categoryId = Number(body.categoryId);
            if (body.title !== undefined)
                updateData.title = body.title;
            if (body.amount !== undefined)
                updateData.amount = Number(body.amount);
            if (body.expenseDate !== undefined)
                updateData.expenseDate = new Date(body.expenseDate);
            if (body.paymentDate !== undefined)
                updateData.paymentDate = new Date(body.paymentDate);
            if (body.dueDate !== undefined)
                updateData.dueDate = new Date(body.dueDate);
            if (body.paymentStatus !== undefined)
                updateData.paymentStatus = body.paymentStatus;
            if (body.paymentMethod !== undefined)
                updateData.paymentMethod = body.paymentMethod;
            if (body.description !== undefined)
                updateData.description = body.description;
            if (body.receiptUrl !== undefined)
                updateData.receiptUrl = body.receiptUrl;
            const existing = await prisma.expense.findFirst({ where: { id: expId, restaurantId } });
            if (!existing)
                return reply.status(404).send({ success: false, error: 'Expense not found' });
            const updated = await prisma.expense.update({ where: { id: expId }, data: updateData });
            try {
                emitToRestaurant(restaurantId, 'expense.updated', updated);
            }
            catch (e) { }
            return { success: true, data: updated };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    app.delete('/:id', async (request, reply) => {
        const restaurantId = request.restaurantId;
        const { id } = request.params;
        const expId = Number(id);
        if (isNaN(expId))
            return reply.status(400).send({ success: false, error: 'Invalid expense id' });
        try {
            await prisma.expense.delete({ where: { id: expId } });
            try {
                emitToRestaurant(restaurantId, 'expense.deleted', { id: expId });
            }
            catch (e) { }
            return { success: true };
        }
        catch (err) {
            return reply.status(400).send({ success: false, error: err?.message || String(err) });
        }
    });
    // Totals: grouped by category type
    app.get('/totals', async (request) => {
        const restaurantId = request.restaurantId;
        const { from, to } = request.query;
        const where = { restaurantId };
        if (from || to) {
            where.expenseDate = {};
            if (from)
                where.expenseDate.gte = new Date(from);
            if (to)
                where.expenseDate.lte = new Date(to);
        }
        const expenses = await prisma.expense.findMany({ where, include: { category: true } });
        let productionTotal = 0;
        let shopTotal = 0;
        for (const e of expenses) {
            const amount = Number(e.amount || 0);
            const type = e.category?.type || 'SHOP';
            if (type === 'PRODUCTION')
                productionTotal += amount;
            else
                shopTotal += amount;
        }
        const combined = productionTotal + shopTotal;
        return { success: true, data: { productionTotal, shopTotal, combined } };
    });
}
export default expenseRoutes;
