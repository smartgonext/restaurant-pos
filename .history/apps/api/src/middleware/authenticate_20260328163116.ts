import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: any, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
}
