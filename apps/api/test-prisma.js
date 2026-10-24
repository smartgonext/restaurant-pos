const { PrismaClient } = require('@prisma/client');
const url = 'file:C:/Users/kumar/AppData/Roaming/restaurant-saas/data/dev.db';
const prisma = new PrismaClient({ datasources: { db: { url } } });
prisma.superAdminUser.findMany().then(console.log).catch(console.error).finally(() => prisma.$disconnect());
