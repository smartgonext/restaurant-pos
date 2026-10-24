import bcrypt from 'bcryptjs';
import { prisma } from '../../app.js';
function parseCookies(cookieHeader) {
    if (!cookieHeader)
        return {};
    return cookieHeader.split(';').reduce((acc, pair) => {
        const [key, ...v] = pair.split('=');
        acc[key.trim()] = decodeURIComponent(v.join('='));
        return acc;
    }, {});
}
function setRefreshTokenCookie(request, reply, refreshToken) {
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    const isProduction = process.env.NODE_ENV === 'production';
    const origin = (request.headers && (request.headers.origin || request.headers.referer)) || '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || !isProduction;
    
    const cookieParts = [
        `refreshToken=${encodeURIComponent(refreshToken)}`,
        'HttpOnly',           // Prevent JavaScript access
        'Secure',             // HTTPS only in production
        'Path=/',
        `Max-Age=${maxAge}`,
        isProduction && !isLocalhost ? 'SameSite=Strict' : 'SameSite=Lax'
    ].filter(Boolean);
    
    // Add domain restriction in production
    if (isProduction && process.env.COOKIE_DOMAIN) {
        cookieParts.push(`Domain=${process.env.COOKIE_DOMAIN}`);
    }
    
    reply.header('Set-Cookie', cookieParts.join('; '));
}
function clearRefreshTokenCookie(request, reply) {
    const isProduction = process.env.NODE_ENV === 'production';
    const origin = (request.headers && (request.headers.origin || request.headers.referer)) || '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1') || !isProduction;
    
    const cookieParts = [
        'refreshToken=',
        'HttpOnly',
        'Secure',
        'Path=/',
        'Max-Age=0',
        isProduction && !isLocalhost ? 'SameSite=Strict' : 'SameSite=Lax'
    ].filter(Boolean);
    
    if (isProduction && process.env.COOKIE_DOMAIN) {
        cookieParts.push(`Domain=${process.env.COOKIE_DOMAIN}`);
    }
    
    reply.header('Set-Cookie', cookieParts.join('; '));
}
export async function authRoutes(app) {
    // ── Restaurant Staff Login ──
    app.post('/login', async (request, reply) => {
        const { email, password } = request.body;
        const staff = await prisma.staff.findFirst({
            where: { email, isActive: true },
            include: {
                restaurant: { select: { id: true, name: true, slug: true, status: true } },
                branch: { select: { id: true, name: true } },
            },
        });
        if (!staff) {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }
        const validPassword = await bcrypt.compare(password, staff.password);
        if (!validPassword) {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }
        if (staff.restaurant.status !== 'active') {
            return reply.status(403).send({ success: false, error: 'Restaurant is not active' });
        }
        // Update last login
        await prisma.staff.update({
            where: { id: staff.id },
            data: { lastLoginAt: new Date() },
        });
        const token = app.jwt.sign({
            id: staff.id,
            role: staff.role,
            restaurantId: staff.restaurantId,
            branchId: staff.branchId,
            staffId: staff.id,
        }, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
        const refreshToken = app.jwt.sign({ id: staff.id, type: 'refresh', accountType: 'staff' }, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
        // Save RefreshToken to DB
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: staff.id,
                restaurantId: staff.restaurantId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            }
        });
        // Set refresh token as httpOnly cookie. Frontend should not persist this value.
        setRefreshTokenCookie(request, reply, refreshToken);
        // Fetch Role permissions if defined
        const roleData = await prisma.role.findFirst({
            where: { restaurantId: staff.restaurantId, name: staff.role }
        });
        const permissions = roleData ? JSON.parse(roleData.permissions) : null;

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
                    permissions, // Include permissions in the user payload
                    avatar: staff.avatar,
                    theme: staff.theme,
                    language: staff.language,
                    restaurant: staff.restaurant,
                    branch: staff.branch,
                },
            },
        };
    });
    // ── SuperAdmin Login ──
    app.post('/superadmin/login', async (request, reply) => {
        const { email, password } = request.body;
        const admin = await prisma.superAdminUser.findUnique({ where: { email } });
        if (!admin) {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }
        const token = app.jwt.sign({ id: admin.id, role: admin.role }, { expiresIn: '1d' });
        const refreshToken = app.jwt.sign({ id: admin.id, type: 'refresh', accountType: 'superadmin' }, { expiresIn: '7d' });
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: admin.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            }
        });
        setRefreshTokenCookie(request, reply, refreshToken);
        return {
            success: true,
            data: {
                token,
                refreshToken,
                user: {
                    id: admin.id,
                    name: admin.name,
                    email: admin.email,
                    role: admin.role,
                    avatar: admin.avatar,
                },
            },
        };
    });
    // ── Refresh Token (with rotation for security) ──
    app.post('/refresh', async (request, reply) => {
        const cookies = parseCookies(request.headers.cookie);
        const oldRefreshToken = cookies.refreshToken;
        if (!oldRefreshToken) {
            return reply.status(401).send({ success: false, error: 'Missing refresh token' });
        }
        // Check DB for refresh token
        const dbToken = await prisma.refreshToken.findUnique({
            where: { token: oldRefreshToken }
        });
        if (!dbToken || dbToken.revokedAt || dbToken.expiresAt < new Date()) {
            return reply.status(401).send({ success: false, error: 'Refresh token invalid or revoked' });
        }
        try {
            const decoded = app.jwt.verify(oldRefreshToken);
            if (decoded.type !== 'refresh') {
                return reply.status(401).send({ success: false, error: 'Invalid token type' });
            }
            if (decoded.accountType === 'staff') {
                const staff = await prisma.staff.findUnique({ where: { id: decoded.id } });
                if (!staff) {
                    return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
                }
                // SECURITY: Generate NEW refresh token (rotation)
                const newRefreshToken = app.jwt.sign(
                    { id: staff.id, type: 'refresh', accountType: 'staff' },
                    { expiresIn: '7d' }
                );
                // Save new token AND revoke old one atomically
                await Promise.all([
                    prisma.refreshToken.create({
                        data: {
                            token: newRefreshToken,
                            userId: staff.id,
                            restaurantId: staff.restaurantId,
                            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                        }
                    }),
                    prisma.refreshToken.update({
                        where: { token: oldRefreshToken },
                        data: { revokedAt: new Date() }
                    })
                ]);
                // Generate new access token
                const accessToken = app.jwt.sign({
                    id: staff.id,
                    role: staff.role,
                    restaurantId: staff.restaurantId,
                    branchId: staff.branchId,
                    staffId: staff.id,
                }, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
                setRefreshTokenCookie(request, reply, newRefreshToken);
                return { success: true, data: { token: accessToken } };
            }
            if (decoded.accountType === 'superadmin') {
                const admin = await prisma.superAdminUser.findUnique({ where: { id: decoded.id } });
                if (!admin) {
                    return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
                }
                // SECURITY: Generate NEW refresh token (rotation)
                const newRefreshToken = app.jwt.sign(
                    { id: admin.id, type: 'refresh', accountType: 'superadmin' },
                    { expiresIn: '7d' }
                );
                // Save new token AND revoke old one atomically
                await Promise.all([
                    prisma.refreshToken.create({
                        data: {
                            token: newRefreshToken,
                            userId: admin.id,
                            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                        }
                    }),
                    prisma.refreshToken.update({
                        where: { token: oldRefreshToken },
                        data: { revokedAt: new Date() }
                    })
                ]);
                // Generate new access token
                const accessToken = app.jwt.sign({ id: admin.id, role: admin.role }, { expiresIn: '1d' });
                setRefreshTokenCookie(request, reply, newRefreshToken);
                return { success: true, data: { token: accessToken } };
            }
            return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
        }
        catch (err) {
            return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
        }
    });
    // ── Logout ──
    app.post('/logout', async (request, reply) => {
        const cookies = parseCookies(request.headers.cookie);
        const refreshToken = cookies.refreshToken;
        if (refreshToken) {
            await prisma.refreshToken.updateMany({
                where: { token: refreshToken },
                data: { revokedAt: new Date() }
            });
        }
        clearRefreshTokenCookie(request, reply);
        return { success: true, message: 'Logged out successfully' };
    });
}
