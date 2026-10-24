import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const tables = await prisma.table.findMany({ where: { restaurantId: 1 }, select: { id: true, name: true, qrToken: true } });
    console.log(JSON.stringify(tables, null, 2));
    await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
