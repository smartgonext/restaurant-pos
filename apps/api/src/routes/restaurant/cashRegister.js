import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
import { emitToRestaurant } from '../../plugins/socket.js';

// Helper to safely aggregate total cash received during an active session
async function calculateSessionCashReceived(restaurantId, sessionOrOpenedAt, registerId) {
    const session = (sessionOrOpenedAt && typeof sessionOrOpenedAt === 'object' && !(sessionOrOpenedAt instanceof Date))
        ? sessionOrOpenedAt
        : null;
    const openedAt = session
        ? new Date(session.openedAt)
        : (sessionOrOpenedAt instanceof Date ? sessionOrOpenedAt : new Date(sessionOrOpenedAt));
    const sessionId = session?.id || null;
    const regId = registerId || session?.registerId || null;

    // Determine the effective start time:
    // If the shift was opened today, we include cash payments from today that were received
    // before or during this shift (unless they belonged to an earlier closed shift today).
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let effectiveStart = openedAt;

    if (regId) {
        const lastClosedToday = await prisma.cashRegisterSession.findFirst({
            where: {
                registerId: regId,
                status: 'closed',
                closedAt: { gte: todayStart, lte: openedAt }
            },
            orderBy: { closedAt: 'desc' }
        }).catch(() => null);

        if (lastClosedToday && lastClosedToday.closedAt) {
            effectiveStart = new Date(Math.max(new Date(lastClosedToday.closedAt).getTime(), todayStart.getTime()));
        } else {
            effectiveStart = new Date(Math.min(todayStart.getTime(), openedAt.getTime()));
        }
    } else {
        effectiveStart = new Date(Math.min(todayStart.getTime(), openedAt.getTime()));
    }

    let orderPaymentsSum = 0;
    let tokenPaymentsSum = 0;

    // 1. Direct and Table Orders
    try {
        const cashOrders = await prisma.order.findMany({
            where: {
                restaurantId,
                status: 'paid',
                bakeryToken: { is: null },
                createdAt: { gte: effectiveStart }
            },
            include: { payments: true }
        }).catch(() => []);

        for (const o of cashOrders) {
            if (o.payments && o.payments.length > 0) {
                for (const p of o.payments) {
                    if (String(p.method || '').toLowerCase() === 'cash') {
                        orderPaymentsSum += Number(p.amount || 0);
                    }
                }
            } else {
                orderPaymentsSum += Number(o.total || 0);
            }
        }
    } catch (e) {
        console.error('Error computing order cash payments:', e);
    }

    // 2. Bakery & POS Tokens
    try {
        const cashTokens = await prisma.bakeryToken.findMany({
            where: {
                restaurantId,
                status: 'paid',
                createdAt: { gte: effectiveStart }
            },
            include: { payments: true }
        }).catch(() => []);

        for (const t of cashTokens) {
            if (t.payments && t.payments.length > 0) {
                for (const p of t.payments) {
                    if (String(p.method || '').toLowerCase() === 'cash') {
                        tokenPaymentsSum += Number(p.amount || 0);
                    }
                }
            } else {
                tokenPaymentsSum += Number(t.total || 0);
            }
        }
    } catch (e) {
        console.error('Error computing token cash payments:', e);
    }

    // 3. Cash In / Cash Out adjustments (petty cash, additional float)
    let netCashInOut = 0;
    if (sessionId) {
        try {
            const cashTransactions = await prisma.cashTransaction.findMany({
                where: { sessionId }
            }).catch(() => []);

            for (const tx of cashTransactions) {
                const amt = Number(tx.amount || 0);
                if (tx.type === 'cash_in') netCashInOut += amt;
                else if (tx.type === 'cash_out') netCashInOut -= amt;
            }
        } catch (e) {
            console.error('Error computing cash transactions:', e);
        }
    }

    const totalCashSales = orderPaymentsSum + tokenPaymentsSum;

    return {
        totalCashSales,
        totalCashReceived: totalCashSales, // Keep field for backwards compatibility
        netCashInOut,
        effectiveStart
    };
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
            const { totalCashSales, netCashInOut } = await calculateSessionCashReceived(restaurantId, openSession, register.id);
            const autoClosingBalance = Number(openSession.openingBalance || 0) + totalCashSales + netCashInOut;

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
            const { totalCashSales, netCashInOut } = await calculateSessionCashReceived(restaurantId, session, register.id);
            const expectedCash = Number(session.openingBalance || 0) + totalCashSales + netCashInOut;

            return {
                success: true,
                data: {
                    ...session,
                    totalCashReceived: totalCashSales,
                    totalCashSales,
                    netCashInOut,
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

            emitToRestaurant(restaurantId, 'cash_register_updated', { status: 'open', sessionId: session.id });

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

            const { totalCashSales, netCashInOut } = await calculateSessionCashReceived(restaurantId, session, register.id);
            const expectedCash = Number(session.openingBalance || 0) + totalCashSales + netCashInOut;
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

            emitToRestaurant(restaurantId, 'cash_register_updated', { status: 'closed', sessionId: session.id });

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

            const tx = await prisma.cashTransaction.create({
                data: {
                    sessionId: session.id,
                    type,
                    amount: Number(amount),
                    reason: reason || null
                }
            }).catch(err => {
                console.error('Error creating cash transaction:', err);
                return null;
            });

            const updatedSession = await prisma.cashRegisterSession.update({
                where: { id: session.id },
                data: {
                    note: `${session.note || ''}\n[${type.toUpperCase()}] ₹${amount} - ${reason || 'Manual entry'}`
                }
            });

            emitToRestaurant(restaurantId, 'cash_register_updated', { status: 'cash_in_out', sessionId: session.id });

            return { success: true, data: { sessionId: session.id, type, amount: Number(amount), reason, session: updatedSession, transaction: tx } };
        } catch (err) {
            console.error('Error in /cash-register/cash-in-out endpoint:', err);
            return reply.status(500).send({ success: false, error: err.message || String(err) });
        }
    });
}
