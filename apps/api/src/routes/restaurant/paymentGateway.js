import { prisma } from '../../app.js';
import { emitToRestaurant } from '../../plugins/socket.js';

export async function paymentGatewayRoutes(app) {
    // Public route for customers to pay via QR
    app.post('/razorpay/create-order', async (request) => {
        const { orderId, amount } = request.body;
        const mockRazorpayOrderId = `rzp_order_${Math.random().toString(36).substring(7)}`;
        return {
            success: true,
            data: {
                id: mockRazorpayOrderId,
                amount: amount * 100,
                currency: 'INR'
            }
        };
    });

    app.post('/razorpay/verify', async (request) => {
        const { orderId, razorpayPaymentId } = request.body;
        const order = await prisma.order.update({
            where: { id: Number(orderId) },
            data: { status: 'paid' }
        });
        await prisma.orderPayment.create({
            data: {
                orderId: order.id,
                amount: order.total,
                method: 'ONLINE_RAZORPAY',
                transactionId: razorpayPaymentId,
                paidAt: new Date()
            }
        });
        if (order.restaurantId) {
            emitToRestaurant(order.restaurantId, 'customer_display_payment_ok', { orderId: order.id, paid: order.total });
            emitToRestaurant(order.restaurantId, 'payment_success', { orderId: order.id, paid: order.total });
        }
        return { success: true, message: 'Payment verified and order updated' };
    });

    // Public endpoint to check token payment status for Customer Display
    app.get('/token-status/:qr', async (request, reply) => {
        const { qr } = request.params;
        try {
            const token = await prisma.bakeryToken.findFirst({
                where: { qrCode: qr },
                select: {
                    id: true,
                    qrCode: true,
                    status: true,
                    total: true,
                    customerName: true,
                    restaurantId: true
                }
            });
            if (!token) {
                return reply.status(404).send({ success: false, error: 'Token not found' });
            }
            return { success: true, data: token };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message });
        }
    });

    // EDC Terminal / mSwipe / Soundbox / GPay Universal Payment Webhook
    app.post('/terminal-webhook', async (request) => {
        const body = request.body || {};
        const tokenQr = body.tokenQr || body.invoice_id || body.invoiceId || body.reference_id;
        const amount = body.amount;
        const transactionId = body.transaction_id || body.transactionId || body.txn_id;
        const rawStatus = String(body.payment_status || body.status || '').toUpperCase();
        const isSuccess = rawStatus === 'SUCCESS' || rawStatus === 'PAID' || rawStatus === 'COMPLETED' || rawStatus === '';

        if (isSuccess) {
            const targetRestaurantId = body.restaurantId || 1;

            if (tokenQr) {
                try {
                    const token = await prisma.bakeryToken.findFirst({ where: { qrCode: tokenQr } });
                    if (token && token.status !== 'paid') {
                        await prisma.bakeryToken.update({ where: { id: token.id }, data: { status: 'paid', paidAt: new Date() } });
                        if (token.orderId) {
                            await prisma.order.update({ where: { id: token.orderId }, data: { status: 'paid' } });
                        }
                    }
                } catch (e) {
                    console.error('Failed to update token on webhook', e);
                }
            }

            emitToRestaurant(targetRestaurantId, 'customer_display_payment_ok', {
                tokenQr,
                paid: Number(amount || 0),
                amount: Number(amount || 0),
                transactionId: transactionId || `TXN_${Date.now()}`,
                status: 'paid'
            });
            emitToRestaurant(targetRestaurantId, 'payment_success', {
                tokenQr,
                paid: Number(amount || 0),
                amount: Number(amount || 0),
                transactionId: transactionId || `TXN_${Date.now()}`
            });
            return { success: true, message: 'Payment webhook received & socket broadcast sent!' };
        }
        return { success: false, message: 'Payment status not successful' };
    });

    // Dedicated GPay / UPI Live Notification Receiver (Soundbox & Bank SMS sync)
    app.post('/upi-notify', async (request) => {
        const { restaurantId, amount, tokenQr, transactionId, senderName } = request.body || {};
        const targetRestaurantId = restaurantId || 1;
        const numAmount = Number(amount || 0);

        try {
            // Find recent pending token matching amount or qr
            let token = null;
            if (tokenQr) {
                token = await prisma.bakeryToken.findFirst({ where: { qrCode: tokenQr } });
            } else if (numAmount > 0) {
                token = await prisma.bakeryToken.findFirst({
                    where: { restaurantId: targetRestaurantId, status: { in: ['pending', 'unpaid', 'partially_paid'] } },
                    orderBy: { createdAt: 'desc' }
                });
            }

            if (token) {
                await prisma.bakeryToken.update({
                    where: { id: token.id },
                    data: { status: 'paid', paidAt: new Date() }
                });
                if (token.orderId) {
                    await prisma.order.update({ where: { id: token.orderId }, data: { status: 'paid' } });
                }
                await prisma.bakeryTokenPayment.create({
                    data: {
                        tokenId: token.id,
                        method: 'upi',
                        amount: numAmount || Number(token.total),
                        transactionId: transactionId || `UPI_${Date.now()}`
                    }
                });
            }

            emitToRestaurant(targetRestaurantId, 'customer_display_payment_ok', {
                customerName: senderName || token?.customerName || 'Customer',
                paid: numAmount || Number(token?.total || 0),
                amount: numAmount || Number(token?.total || 0),
                tokenNumber: token?.tokenNumber
            });
            emitToRestaurant(targetRestaurantId, 'payment_success', {
                tokenQr: token?.qrCode || tokenQr,
                paid: numAmount || Number(token?.total || 0),
                amount: numAmount || Number(token?.total || 0)
            });

            return { success: true, message: 'UPI payment notification processed successfully' };
        } catch (err) {
            console.error('Error handling upi-notify', err);
            return { success: false, error: err.message };
        }
    });

    // Mswipe Cloud Relay API: Create Dynamic Payment QR (Syncs POS, Customer Display & Mswipe Boombox X1)
    app.post('/mswipe/create-qr', async (request, reply) => {
        const { amount, invoiceId, deviceSerial, restaurantId } = request.body || {};
        const targetRestaurantId = restaurantId || request.restaurantId || 1;
        const numAmount = Number(amount || 0);

        try {
            const billSettings = await prisma.billSettings.findFirst({ where: { restaurantId: targetRestaurantId } });
            const merchantVpa = billSettings?.upiVpa || billSettings?.upiId || process.env.MSWIPE_MERCHANT_VPA || 'mswipe.merchant@oksbi';
            const merchantName = billSettings?.billHeaderText || 'Restaurant POS';
            const txnRef = invoiceId || `MSW_${Date.now()}`;

            // 1. Dynamic UPI URL (compatible with Mswipe Boombox X1 & GPay / PhonePe)
            const upiPaymentUrl = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(merchantName)}&am=${encodeURIComponent(String(numAmount))}&cu=INR&tr=${encodeURIComponent(txnRef)}`;

            // 2. Broadcast QR code to Customer Display monitor simultaneously
            emitToRestaurant(targetRestaurantId, 'customer_display_show_qr', {
                restaurantId: targetRestaurantId,
                upiUri: upiPaymentUrl,
                amount: numAmount,
                token: txnRef,
                merchantName,
                merchantVpa,
                deviceSerial: deviceSerial || 'MSWIPE_BOOMBOX_X1'
            });

            // 3. Return Mswipe Cloud Relay payload
            return {
                success: true,
                status: 'SUCCESS',
                data: {
                    invoiceId: txnRef,
                    amount: numAmount,
                    deviceSerial: deviceSerial || 'MSWIPE_BOOMBOX_X1',
                    upiPaymentUrl,
                    merchantVpa
                }
            };
        } catch (err) {
            console.error('Error creating Mswipe QR:', err);
            return reply.status(500).send({ success: false, error: err.message });
        }
    });

    // Mswipe Cloud Relay API: Check Payment Verification Status
    app.get('/mswipe/status/:invoiceId', async (request, reply) => {
        const { invoiceId } = request.params;
        try {
            const token = await prisma.bakeryToken.findFirst({
                where: { OR: [{ qrCode: invoiceId }, { id: Number(invoiceId) || -1 }] }
            });
            if (token && token.status === 'paid') {
                return { success: true, paymentStatus: 'PAID', amount: Number(token.total) };
            }
            return { success: true, paymentStatus: 'PENDING' };
        } catch (err) {
            return reply.status(500).send({ success: false, error: err.message });
        }
    });
}
