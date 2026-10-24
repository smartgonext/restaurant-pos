import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('Staff:', await prisma.staff.findMany({ where: { email: 'admin@restaurant-saas.com' } }));
  console.log('SuperAdmin:', await prisma.superAdminUser.findMany({ where: { email: 'admin@restaurant-saas.com' } }));
}
main().catch(console.error).finally(() => prisma.$disconnect());
