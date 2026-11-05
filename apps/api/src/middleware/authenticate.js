export async function authenticate(request, reply) {
    try {
        if (!request.headers.authorization && request.query?.token) {
            request.headers.authorization = `Bearer ${request.query.token}`;
        }
        await request.jwtVerify();
    }
    catch (err) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
}
