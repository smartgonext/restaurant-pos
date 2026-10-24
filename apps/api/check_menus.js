import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./maligai.db'
    }
  }
});

async function main() {
  const menus = await prisma.menu.findMany();
  console.log('MENUS:', menus);
  const items = await prisma.menuItem.findMany({
    take: 10,
    orderBy: { id: 'desc' }
  });
  console.log('RECENT MENU ITEMS:', items);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
