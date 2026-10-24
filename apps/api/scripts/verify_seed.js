import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function verifySeed() {
    try {
        console.log('🔍 Verifying Database Seed...\n');
        const stats = {};
        // Try basic tables first
        try {
            stats['✅ Restaurants'] = await prisma.restaurant.count();
        }
        catch (e) {
            stats['❌ Restaurants'] = 'N/A';
        }
        try {
            stats['✅ Packages'] = await prisma.package.count();
        }
        catch (e) {
            stats['❌ Packages'] = 'N/A';
        }
        try {
            stats['✅ Super Admins'] = await prisma.superAdminUser.count();
        }
        catch (e) {
            stats['❌ Super Admins'] = 'N/A';
        }
        try {
            stats['✅ Menus'] = await prisma.menu.count();
        }
        catch (e) {
            stats['❌ Menus'] = 'N/A';
        }
        try {
            stats['✅ Menu Items'] = await prisma.menuItem.count();
        }
        catch (e) {
            stats['❌ Menu Items'] = 'N/A';
        }
        try {
            stats['✅ Tables'] = await prisma.table.count();
        }
        catch (e) {
            stats['❌ Tables'] = 'N/A';
        }
        try {
            stats['✅ Staff'] = await prisma.staff.count();
        }
        catch (e) {
            stats['❌ Staff'] = 'N/A';
        }
        try {
            stats['✅ Customers'] = await prisma.customer.count();
        }
        catch (e) {
            stats['❌ Customers'] = 'N/A';
        }
        try {
            stats['✅ KOTs'] = await prisma.kOT.count();
        }
        catch (e) {
            stats['❌ KOTs'] = 'N/A';
        }
        console.log('📊 Database Seeding Status:');
        console.log('=============================');
        Object.entries(stats).forEach(([key, count]) => {
            console.log(`${key}: ${count}`);
        });
        console.log('=============================');
        console.log('✅ Seed verification complete!\n');
        await prisma.$disconnect();
    }
    catch (err) {
        console.error('❌ Verification error:', err.message);
        await prisma.$disconnect();
        process.exit(1);
    }
}
verifySeed();
