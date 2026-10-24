export function authorize(roles) {
    return async (request, reply) => {
        const user = request.user;
        if (!user || !roles.includes(user.role)) {
            return reply.status(403).send({ success: false, error: 'Forbidden' });
        }
    };
}
