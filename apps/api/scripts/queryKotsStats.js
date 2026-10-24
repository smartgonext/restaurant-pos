import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const total = await prisma.kOT.count();
    const nullCount = await prisma.kOT.count({ where: { createdByTerminalId: null } });
    const sample = await prisma.kOT.findMany({ take: 5 });
    console.log(JSON.stringify({ total, nullCount, sample }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => await prisma.$disconnect());
