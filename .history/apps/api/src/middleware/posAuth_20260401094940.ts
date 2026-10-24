import { FastifyReply } from 'fastify';

/** Middleware: verifies JWT is from a Sub POS terminal (type = 'subpos'). */
export async function subposAuth(request: any, reply: FastifyReply): Promise<void> {
  const url = (request.raw?.url || '').split('?')[0];
  if (url.endsWith('/api/subpos/login')) {
    return;
  }

  try {
    await request.jwtVerify();
    if (request.user?.type !== 'subpos') {
      return reply.status(403).send({ success: false, error: 'Not a Sub POS terminal' });
    }
    // Inject convenience fields matching tenantScope naming
    request.restaurantId = request.user.restaurantId;
    request.branchId = request.user.branchId;
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
}

/** Middleware: verifies JWT is from a Main POS terminal (type = 'mainpos'). */
export async function mainposAuth(request: any, reply: FastifyReply): Promise<void> {
  const url = (request.raw?.url || '').split('?')[0];
  if (url.endsWith('/api/mainpos/login')) {
    return;
  }

  try {
    await request.jwtVerify();
    if (request.user?.type !== 'mainpos') {
      return reply.status(403).send({ success: false, error: 'Not a Main POS terminal' });
    }
    request.restaurantId = request.user.restaurantId;
    request.branchId = request.user.branchId;
  } catch {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
}
