import { FastifyReply } from 'fastify';

export function authorize(roles: string[]) {
  return async (request: any, reply: FastifyReply) => {
    const user = request.user as { role: string };
    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }
  };
}
