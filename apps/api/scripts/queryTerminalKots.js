import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const kots = await prisma.kOT.findMany({
        where: { createdByTerminalId: { not: null } },
        include: {
            items: { include: { menuItem: true } },
            order: { include: { table: true, staff: { select: { name: true } } } },
        },
        take: 10,
    });
    console.log(JSON.stringify(kots, null, 2));
}
main()
    .catch((err) => {
    console.error(err);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
