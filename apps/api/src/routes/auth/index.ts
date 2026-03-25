import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../../app.js';

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const [key, ...v] = pair.split('=');
    acc[key.trim()] = decodeURIComponent(v.join('='));
    return acc;
  }, {} as Record<string, string>);
}

function setRefreshTokenCookie(reply: any, refreshToken: string) {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  const cookieParts = [
    `refreshToken=${encodeURIComponent(refreshToken)}`,
    `HttpOnly`,
    `Path=/`,
    `Max-Age=${maxAge}`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }
  reply.header('Set-Cookie', cookieParts.join('; '));
}

export async function authRoutes(app: FastifyInstance) {
  // ── Restaurant Staff Login ──
  app.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

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

    const token = (app as any).jwt.sign(
      {
        id: staff.id,
        role: staff.role,
        restaurantId: staff.restaurantId,
        branchId: staff.branchId,
        staffId: staff.id,
      },
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    const refreshToken = (app as any).jwt.sign(
      { id: staff.id, type: 'refresh' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    // Set refresh token as httpOnly cookie. Frontend should not persist this value.
    setRefreshTokenCookie(reply, refreshToken);

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
    const { email, password } = request.body as { email: string; password: string };

    const admin = await prisma.superAdminUser.findUnique({ where: { email } });
    if (!admin) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }

    const token = (app as any).jwt.sign(
      { id: admin.id, role: admin.role },
      { expiresIn: '1d' }
    );

    const refreshToken = (app as any).jwt.sign(
      { id: admin.id, type: 'refresh' },
      { expiresIn: '7d' }
    );

    setRefreshTokenCookie(reply, refreshToken);

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

  // ── Refresh Token ──
  app.post('/refresh', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie as string | undefined);
    const refreshToken = cookies.refreshToken;

    if (!refreshToken) {
      return reply.status(401).send({ success: false, error: 'Missing refresh token' });
    }

    try {
      const decoded = (app as any).jwt.verify(refreshToken) as { id: number; type: string };
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({ success: false, error: 'Invalid token type' });
      }

      // Check if it's a staff or superadmin
      const staff = await prisma.staff.findUnique({ where: { id: decoded.id } });
      if (staff) {
        const token = (app as any).jwt.sign(
          {
            id: staff.id,
            role: staff.role,
            restaurantId: staff.restaurantId,
            branchId: staff.branchId,
            staffId: staff.id,
          },
          { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
        );
        // Refresh cookie expiration
        setRefreshTokenCookie(reply, refreshToken);
        return { success: true, data: { token } };
      }

      const admin = await prisma.superAdminUser.findUnique({ where: { id: decoded.id } });
      if (admin) {
        const token = (app as any).jwt.sign(
          { id: admin.id, role: admin.role },
          { expiresIn: '1d' }
        );
        // Refresh cookie expiration
        setRefreshTokenCookie(reply, refreshToken);
        return { success: true, data: { token } };
      }
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
    }
  });

  // ── Logout ──
  app.post('/logout', async () => {
    return { success: true, message: 'Logged out successfully' };
  });
}
