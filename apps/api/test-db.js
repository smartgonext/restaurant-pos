import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function main() {
  const customers = await prisma.customer.findMany();
  console.log('customers:', customers);
  const tokens = await prisma.bakeryToken.findMany({
    include: { customer: true }
  });
  console.log('tokens:', tokens.map(t => ({ id: t.id, customer: t.customer, name: t.customerName, phone: t.customerPhone })));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
