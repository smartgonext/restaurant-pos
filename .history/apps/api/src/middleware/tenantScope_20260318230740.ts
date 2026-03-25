import { FastifyReply } from 'fastify';

export async function tenantScope(request: any, reply: FastifyReply) {
  const user = request.user as { restaurantId?: number };
  if (!user?.restaurantId) {
    return reply.status(403).send({ success: false, error: 'No restaurant context' });
  }
  request.restaurantId = user.restaurantId;
}
