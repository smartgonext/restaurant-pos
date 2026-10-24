import { FastifyReply } from 'fastify';

/** Middleware: verifies JWT is from a Sub POS terminal (type = 'subpos'). */
export async function subposAuth(request: any, reply: FastifyReply): Promise<void> {
  const url = (request.raw?.url || '').split('?')[0];
  if (url.endsWith('/api/subpos/login')) {
    return;
  }

  try {
    await request.jwtVerify();
    const user = request.user as any;
    if (user?.type !== 'subpos' && user?.role !== 'waiter' && user?.role !== 'staff' && user?.role !== 'admin' && user?.role !== 'branch_head') {
      return reply.status(403).send({ success: false, error: 'Not authorized for Sub POS' });
    }
    // Inject convenience fields matching tenantScope naming
    request.restaurantId = user.restaurantId;
    request.branchId = user.branchId;
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
