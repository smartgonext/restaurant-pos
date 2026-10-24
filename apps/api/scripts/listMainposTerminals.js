import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const terminals = await prisma.mainPOSTerminal.findMany({ take: 20 });
    console.log(JSON.stringify(terminals, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(async () => await prisma.$disconnect());
