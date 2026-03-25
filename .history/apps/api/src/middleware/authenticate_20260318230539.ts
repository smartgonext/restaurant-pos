import { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(request: FastifyRequest & { jwtVerify: any }, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
  }
}
