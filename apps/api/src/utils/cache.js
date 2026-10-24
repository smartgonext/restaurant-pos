import Redis from 'ioredis';
// Singleton Redis instance
let redis = null;
export function getRedisClient() {
    if (redis)
        return redis;
    try {
        const url = process.env.REDIS_URL;
        if (url) {
            redis = new Redis(url);
            redis.on('error', (err) => console.error('[Redis Error]', err.message));
            console.log('Redis initialized');
        }
    }
    catch (err) {
        console.error('Failed to initialize Redis:', err);
    }
    return redis;
}
export async function getCache(key) {
    try {
        const client = getRedisClient();
        if (!client)
            return null;
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
    }
    catch (err) {
        return null;
    }
}
export async function setCache(key, value, ttlSeconds = 3600) {
    try {
        const client = getRedisClient();
        if (!client)
            return;
        await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
    catch (err) {
        // silently fail
    }
}
export async function invalidateCachePattern(pattern) {
    try {
        const client = getRedisClient();
        if (!client)
            return;
        const keys = await client.keys(pattern);
        if (keys.length > 0) {
            await client.del(...keys);
        }
    }
    catch (err) {
        // silently fail
    }
}
