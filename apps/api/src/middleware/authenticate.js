export async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch (err) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
}
