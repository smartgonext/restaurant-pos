import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

// Helper to safely aggregate total cash received during an active session
async function calculateSessionCashReceived(restaurantId, openedAt) {
    let orderPaymentsSum = 0;
    let tokenPaymentsSum = 0;

    try {
        const cashOrderPayments = await prisma.orderPayment.aggregate({
            where: {
                order: { restaurantId },
                method: { equals: 'cash' },
                createdAt: { gte: openedAt }
            },
            _sum: { amount: true }
        }).catch(() => null);

        const directCashOrders = await prisma.order.aggregate({
            where: {
                restaurantId,
                status: 'paid',
                paymentMethod: { equals: 'cash' },
                createdAt: { gte: openedAt }
            },
            _sum: { total: true }
        }).catch(() => null);

        orderPaymentsSum = Number(cashOrderPayments?._sum?.amount || 0) || Number(directCashOrders?._sum?.total || 0) || 0;
    } catch (e) {
        console.error('Error computing order cash payments:', e);
    }

    try {
        const cashTokenPayments = await prisma.bakeryTokenPayment.aggregate({
            where: {
                token: { restaurantId },
                method: { equals: 'cash' },
                paidAt: { gte: openedAt }
            },
            _sum: { amount: true }
        }).catch(() => null);

        tokenPaymentsSum = Number(cashTokenPayments?._sum?.amount || 0);
    } catch (e) {
        console.error('Error computing token cash payments:', e);
    }

    return orderPaymentsSum + tokenPaymentsSum;
}

async function autoCloseExpiredSessions(restaurantId) {
    try {
        const register = await prisma.cashRegister.findFirst({ where: { restaurantId } });
        if (!register) return;

        const openSession = await prisma.cashRegisterSession.findFirst({
            where: { registerId: register.id, status: 'open' }
        });
        if (!openSession) return;

        const now = new Date();
        const openedAt = new Date(openSession.openedAt);
        const isDifferentDay = openedAt.toDateString() !== now.toDateString();
        const isOld = (now.getTime() - openedAt.getTime()) > (18 * 60 * 60 * 1000);

        // Fetch BillSettings for custom registerAutoCloseTime (default '23:59')
        const billSettings = await prisma.billSettings.findUnique({ where: { restaurantId } }).catch(() => null);
        const targetCloseTime = billSettings?.registerAutoCloseTime || '23:59';

        let hasPassedAutoCloseTime = false;
        if (targetCloseTime && targetCloseTime.includes(':')) {
            const [targetHours, targetMinutes] = targetCloseTime.split(':').map(Number);
            if (!isNaN(targetHours) && !isNaN(targetMinutes)) {
                const cutoffToday = new Date(now);
                cutoffToday.setHours(targetHours, targetMinutes, 0, 0);
                if (now >= cutoffToday && openedAt < cutoffToday) {
                    hasPassedAutoCloseTime = true;
                }
            }
        }

        if (isDifferentDay || isOld || hasPassedAutoCloseTime) {
            const totalCashReceived = await calculateSessionCashReceived(restaurantId, openSession.openedAt);
            const autoClosingBalance = Number(openSession.openingBalance || 0) + totalCashReceived;

            await prisma.cashRegisterSession.update({
                where: { id: openSession.id },
                data: {
                    closingBalance: autoClosingBalance,
                    expectedCash: autoClosingBalance,
                    countedCash: autoClosingBalance,
                    discrepancy: 0,
                    note: (openSession.note || '') + '\n[AUTO-CLOSED] Session automatically closed at end of day.',
                    closedAt: now,
                    status: 'closed'
                }
            });
        }
    } catch (e) {
        console.error('Error auto-closing expired cash register session:', e);
    }
}

export async function cashRegisterRoutes(app) {
    app.addHook('onRequest', authenticate);
    app.addHook('onRequest', tenantScope);

    // ── Get Current Session with Live Totals ──
    app.get('/session', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            await autoCloseExpiredSessions(restaurantId);

            let register = await prisma.cashRegister.findFirst({
                where: { restaurantId }
            });
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
            if (!register) return { success: false, error: 'No cash register found' };

            let session = null;
            try {
                session = await prisma.cashRegisterSession.findFirst({
                    where: {
                        registerId: register.id,
                        status: 'open',
                    },
                    include: { cashier: { select: { id: true, name: true, role: true } } }
                });
            } catch (e) {
                session = await prisma.cashRegisterSession.findFirst({
                    where: {
                        registerId: register.id,
                        status: 'open',
                    }
                });
                if (session && session.cashierId) {
                    const staff = await prisma.staff.findUnique({ where: { id: session.cashierId }, select: { id: true, name: true, role: true } });
                    session.cashier = staff;
                }
            }

            if (!session) return { success: true, data: null };

            // Calculate live cash received during session
            const totalCashReceived = await calculateSessionCashReceived(restaurantId, session.openedAt);
            const expectedCash = Number(session.openingBalance || 0) + totalCashReceived;

            return {
                success: true,
                data: {
                    ...session,
                    totalCashReceived,
                    expectedCash
                }
            };
        } catch (err) {
            console.error('Error in /cash-register/session endpoint:', err);
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ── Open Session ──
    app.post('/open', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const user = request.user;
            const { openingBalance, notes } = request.body || {};

            await autoCloseExpiredSessions(restaurantId);

            let register = await prisma.cashRegister.findFirst({
                where: { restaurantId }
            });
            if (!register) {
                const branch = await prisma.branch.findFirst({ where: { restaurantId } });
                if (!branch) return reply.status(400).send({ success: false, error: 'No branch found' });
                register = await prisma.cashRegister.create({
                    data: {
                        restaurantId,
                        branchId: branch.id,
                        name: 'Main Register',
                    }
                });
            }

            const active = await prisma.cashRegisterSession.findFirst({
                where: { registerId: register.id, status: 'open' }
            });
            if (active) return reply.status(400).send({ success: false, error: 'A register session is already open for today' });

            const session = await prisma.cashRegisterSession.create({
                data: {
                    registerId: register.id,
                    cashierId: user.staffId || user.id || 1,
                    openingBalance: Number(openingBalance || 0),
                    note: notes || 'Shift opened',
                    status: 'open'
                }
            });
            return { success: true, data: session };
        } catch (err) {
            console.error('Error in /cash-register/open endpoint:', err);
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ── Close Session ──
    app.post('/close', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const { closingBalance, notes } = request.body || {};

            const register = await prisma.cashRegister.findFirst({
                where: { restaurantId }
            });
            if (!register) return reply.status(404).send({ success: false, error: 'No cash register found' });

            const session = await prisma.cashRegisterSession.findFirst({
                where: { registerId: register.id, status: 'open' }
            });
            if (!session) return reply.status(400).send({ success: false, error: 'No open session found' });

            const totalCashReceived = await calculateSessionCashReceived(restaurantId, session.openedAt);
            const expectedCash = Number(session.openingBalance || 0) + totalCashReceived;
            const countedCash = closingBalance !== undefined && closingBalance !== null && closingBalance !== '' 
                ? Number(closingBalance) 
                : expectedCash;
            const discrepancy = countedCash - expectedCash;

            const updated = await prisma.cashRegisterSession.update({
                where: { id: session.id },
                data: {
                    closingBalance: countedCash,
                    expectedCash,
                    countedCash,
                    discrepancy,
                    note: notes || session.note,
                    closedAt: new Date(),
                    status: 'closed'
                }
            });
            return { success: true, data: updated };
        } catch (err) {
            console.error('Error in /cash-register/close endpoint:', err);
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ── Get History ──
    app.get('/history', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const register = await prisma.cashRegister.findFirst({
                where: { restaurantId }
            });
            if (!register) return { success: true, data: [] };

            let sessions = [];
            try {
                sessions = await prisma.cashRegisterSession.findMany({
                    where: { registerId: register.id },
                    orderBy: { openedAt: 'desc' },
                    take: 20,
                    include: { cashier: { select: { name: true } } }
                });
            } catch (e) {
                sessions = await prisma.cashRegisterSession.findMany({
                    where: { registerId: register.id },
                    orderBy: { openedAt: 'desc' },
                    take: 20,
                });
            }
            return { success: true, data: sessions };
        } catch (err) {
            console.error('Error in /cash-register/history endpoint:', err);
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });

    // ── Log Cash In / Cash Out (Float & Expense) ──
    app.post('/cash-in-out', async (request, reply) => {
        try {
            const restaurantId = request.restaurantId;
            const { type, amount, reason } = request.body || {};

            if (!type || !['cash_in', 'cash_out'].includes(type) || !amount || Number(amount) <= 0) {
                return reply.status(400).send({ success: false, error: 'Valid type (cash_in/cash_out) and positive amount required' });
            }

            const register = await prisma.cashRegister.findFirst({ where: { restaurantId } });
            if (!register) return reply.status(404).send({ success: false, error: 'Cash register not found' });

            const session = await prisma.cashRegisterSession.findFirst({
                where: { registerId: register.id, status: 'open' }
            });
            if (!session) return reply.status(400).send({ success: false, error: 'No open register session found' });

            const entry = await prisma.cashRegisterSession.update({
                where: { id: session.id },
                data: {
                    note: `${session.note || ''}\n[${type.toUpperCase()}] ₹${amount} - ${reason || 'Manual entry'}`
                }
            });

            return { success: true, data: { sessionId: session.id, type, amount: Number(amount), reason, session: entry } };
        } catch (err) {
            console.error('Error in /cash-register/cash-in-out endpoint:', err);
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });
}
