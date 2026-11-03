const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: 'file:D:/restorent/apps/api/prisma/sqlite-template/dev.db' } }
  });
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true, email: true, status: true, businessType: true, enabledModules: true }
  });
  console.log('--- RESTAURANTS ---');
  console.log(restaurants);

  const staff = await prisma.staff.findMany({
    select: { id: true, name: true, email: true, role: true, restaurantId: true, isActive: true }
  });
  console.log('--- STAFF ---');
  console.log(staff);

  const superAdmins = await prisma.superAdminUser.findMany();
  console.log('--- SUPER ADMINS ---');
  console.log(superAdmins);

  await prisma.$disconnect();
}

main().catch(console.error);

