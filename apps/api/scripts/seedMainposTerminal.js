import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
    const terminalCode = 'MPOS1';
    const pin = '1234';
    const hash = await bcrypt.hash(pin, 10);
    const terminal = await prisma.mainPOSTerminal.upsert({
        where: { terminalCode },
        update: { pin: hash, restaurantId: 1, branchId: 1, name: 'MainPOS1', isActive: true },
        create: {
            terminalCode,
            pin: hash,
            name: 'MainPOS1',
            restaurantId: 1,
            branchId: 1,
            isActive: true,
        },
    });
    console.log(JSON.stringify({ terminal, pin }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => await prisma.$disconnect());
