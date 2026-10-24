import { FastifyReply } from 'fastify';

export function authorize(roles: string[]) {
  return async (request: any, reply: FastifyReply) => {
    const user = request.user as { role: string } | undefined;
    if (!user || !roles.includes(user.role)) {
      reply.status(403).send({ success: false, error: 'Forbidden' });
      return;
    }
  };
}
