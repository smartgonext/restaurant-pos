export async function tenantScope(request, reply) {
    const user = request.user;
    if (!user?.restaurantId) {
        return reply.status(403).send({ success: false, error: 'No restaurant context' });
    }
    request.restaurantId = user.restaurantId;
}
