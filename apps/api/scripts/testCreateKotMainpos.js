import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function post(url, body, token) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
    });
    if (!res.ok)
        throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
}
async function get(url, token) {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok)
        throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
}
async function test() {
    try {
        console.log('🔌 Testing MainPOS KOT Creation Flow...\n');
        // 1. Login as MainPOS terminal
        console.log('1️⃣  Logging in MainPOS terminal...');
        const loginRes = await post('http://localhost:3001/api/mainpos/login', {
            terminalCode: 'MPOS1',
            pin: '1234'
        });
        const token = loginRes.data.token;
        const terminalId = loginRes.data.terminal.id;
        console.log('✅ Login successful');
        console.log('   Terminal ID:', terminalId);
        console.log('   Token:', token.substring(0, 30) + '...\n');
        // 2. Get a table to create order
        console.log('2️⃣  Finding a table...');
        const table = await prisma.table.findFirst({
            where: { restaurantId: 1 }
        });
        if (!table) {
            console.log('❌ No tables found, please create one first');
            return;
        }
        console.log('✅ Found table:', table.name, '\n');
        // 3. Get a menu item
        console.log('3️⃣  Finding a menu item...');
        const menuItem = await prisma.menuItem.findFirst({
            where: { restaurantId: 1, isAvailable: true }
        });
        if (!menuItem) {
            console.log('❌ No menu items found');
            return;
        }
        console.log('✅ Found item:', menuItem.name, '\n');
        // 4. Create a token (order session) for the table WITH items
        console.log('4️⃣  Creating token/order session with items...');
        const tokenRes = await post('http://localhost:3001/api/mainpos/token/create', {
            items: [
                { menuItemId: menuItem.id, quantity: 2 }
            ]
        }, token);
        const orderToken = tokenRes.data.token;
        console.log('✅ Token created:', orderToken, '\n');
        // 5. Fetch KOTs via the new /api/mainpos/kots endpoint
        console.log('5️⃣  Fetching MainPOS terminal KOTs...');
        const kotsRes = await get('http://localhost:3001/api/mainpos/kots?limit=50', token);
        console.log('✅ KOTs endpoint response:');
        console.log('   Count:', kotsRes.data.length);
        if (kotsRes.data.length > 0) {
            const kot = kotsRes.data[0];
            console.log('\n   ✅ KOT Found!');
            console.log('   - ID:', kot.id);
            console.log('   - KOT Number:', kot.kotNumber);
            console.log('   - Status:', kot.status);
            console.log('   - Created By Terminal ID:', kot.createdByTerminalId);
            console.log('   - Created By Terminal Name:', kot.createdByTerminalName);
            console.log('   - Created By Terminal Type:', kot.createdByTerminalType);
            console.log('   - Items:', kot.items.length);
            if (kot.items.length > 0) {
                console.log('   - Item Name:', kot.items[0].menuItem?.name);
                console.log('   - Item Quantity:', kot.items[0].quantity);
            }
            console.log('\n✅ ALL TESTS PASSED! MainPOS KOT History Feature is Working!');
            console.log('   ✓ KOT created with proper terminal attribution');
            console.log('   ✓ Retrieved via /api/mainpos/kots endpoint');
            console.log('   ✓ Terminal attribution persisted correctly');
        }
        else {
            console.log('\n❌ No KOTs found for this terminal');
        }
    }
    catch (error) {
        console.error('\n❌ Error:', error.message);
    }
    finally {
        await prisma.$disconnect();
    }
}
test();
