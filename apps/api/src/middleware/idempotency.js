const idempotencyCache = new Map();

// Clean up keys older than 10 minutes every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyCache.entries()) {
        if (now - entry.timestamp > 10 * 60 * 1000) {
            idempotencyCache.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

export async function idempotencyHook(request, reply) {
    const idempotencyKey = request.headers['idempotency-key'] || request.headers['x-idempotency-key'];
    if (!idempotencyKey) return; // Skip if header not provided

    const cachedResponse = idempotencyCache.get(idempotencyKey);
    if (cachedResponse) {
        return reply.status(cachedResponse.statusCode).send(cachedResponse.payload);
    }

    // Intercept reply payload to store in cache upon successful execution
    const originalSend = reply.send.bind(reply);
    reply.send = function (payload) {
        if (reply.statusCode >= 200 && reply.statusCode < 300) {
            try {
                const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
                idempotencyCache.set(idempotencyKey, {
                    statusCode: reply.statusCode,
                    payload: parsed,
                    timestamp: Date.now(),
                });
            } catch {
                // Ignore parse errors
            }
        }
        return originalSend(payload);
    };
}
