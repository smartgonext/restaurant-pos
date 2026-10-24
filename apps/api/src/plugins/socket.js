let ioInstance = null;
export function setupSocketIO(io) {
    ioInstance = io;
    io.on('connection', (socket) => {
        console.log(`⚡ Socket connected: ${socket.id}`);
        // Join restaurant room
        socket.on('join_restaurant', (restaurantId) => {
            socket.join(`restaurant:${restaurantId}`);
            console.log(`Socket ${socket.id} joined restaurant:${restaurantId}`);
        });
        // Join kitchen room
        socket.on('join_kitchen', (restaurantId) => {
            socket.join(`restaurant:${restaurantId}:kitchen`);
            console.log(`Socket ${socket.id} joined kitchen room`);
        });
        // Join POS room
        socket.on('join_pos', (restaurantId) => {
            socket.join(`restaurant:${restaurantId}:pos`);
        });
        // Join table room (customer)
        socket.on('join_table', (tableToken) => {
            socket.join(`table:${tableToken}`);
        });
        // Client -> server: cashier updates to present live cart without creating a token
        socket.on('customer_display_update', (payload) => {
            try {
                const restaurantId = payload?.restaurantId;
                if (restaurantId) {
                    emitToRestaurant(restaurantId, 'customer_display_update', payload);
                }
                socket.broadcast.emit('customer_display_update', payload);
            }
            catch (e) {
                console.error('Failed to process customer_display_update', e);
            }
        });
        // Client -> server: request customer display to reset
        socket.on('customer_display_reset', (payload) => {
            try {
                const restaurantId = payload?.restaurantId;
                if (restaurantId) {
                    emitToRestaurant(restaurantId, 'customer_display_reset', payload);
                }
                socket.broadcast.emit('customer_display_reset', payload);
            }
            catch (e) {
                console.error('Failed to process customer_display_reset', e);
            }
        });
        // Client -> server: request customer display to show UPI/GPay QR
        socket.on('customer_display_show_qr', (payload) => {
            try {
                const restaurantId = payload?.restaurantId;
                const forward = {
                    upiUri: payload?.upiUri ?? null,
                    amount: payload?.amount ?? null,
                    token: payload?.token ?? null,
                    merchantName: payload?.merchantName ?? null,
                };
                if (restaurantId) {
                    emitToRestaurant(restaurantId, 'customer_display_show_qr', forward);
                }
                socket.broadcast.emit('customer_display_show_qr', forward);
            }
            catch (e) {
                console.error('Failed to process customer_display_show_qr', e);
            }
        });
        socket.on('customer_display_split_update', (payload) => {
            try {
                const restaurantId = payload?.restaurantId;
                if (restaurantId) {
                    emitToRestaurant(restaurantId, 'customer_display_split_update', payload);
                }
                socket.broadcast.emit('customer_display_split_update', payload);
            } catch (e) {
                console.error('Failed to process customer_display_split_update', e);
            }
        });
        socket.on('customer_display_payment_ok', (payload) => {
            try {
                const restaurantId = payload?.restaurantId;
                if (restaurantId) {
                    emitToRestaurant(restaurantId, 'customer_display_payment_ok', payload);
                }
                socket.broadcast.emit('customer_display_payment_ok', payload);
            } catch (e) {
                console.error('Failed to process customer_display_payment_ok', e);
            }
        });
        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${socket.id}`);
        });
    });
}
export function getIO() {
    if (!ioInstance)
        throw new Error('Socket.IO not initialized');
    return ioInstance;
}
// ── Emit Helpers ─────────────────────────
export function emitToRestaurant(restaurantId, event, data) {
    if (!ioInstance) return;
    try {
        const payload = sanitizeForSocket(data);
        getIO().to(`restaurant:${restaurantId}`).emit(event, payload);
    }
    catch (e) {
        getIO().to(`restaurant:${restaurantId}`).emit(event, data);
    }
}
export function emitToKitchen(restaurantId, event, data) {
    if (!ioInstance) return;
    try {
        const payload = sanitizeForSocket(data);
        getIO().to(`restaurant:${restaurantId}:kitchen`).emit(event, payload);
    }
    catch (e) {
        getIO().to(`restaurant:${restaurantId}:kitchen`).emit(event, data);
    }
}
export function emitToTable(tableToken, event, data) {
    if (!ioInstance) return;
    try {
        const payload = sanitizeForSocket(data);
        getIO().to(`table:${tableToken}`).emit(event, payload);
    }
    catch (e) {
        getIO().to(`table:${tableToken}`).emit(event, data);
    }
}
function sanitizeForSocket(obj) {
    // Convert Prisma Decimal-like objects and Dates into plain JSON-safe values.
    // If an object has a `toNumber` method (Prisma Decimal), call it.
    return JSON.parse(JSON.stringify(obj, (_k, v) => {
        if (v && typeof v === 'object') {
            try {
                if (typeof v.toNumber === 'function')
                    return v.toNumber();
                if (typeof v.toString === 'function' && v._isBigNumber)
                    return v.toString();
            }
            catch (e) {
                return v;
            }
        }
        return v;
    }));
}
