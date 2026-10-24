(async function main() {
    try {
        const loginRes = await fetch('http://localhost:3001/api/mainpos/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ terminalCode: 'MPOS1', pin: '1234' }),
        });
        const loginData = await loginRes.json();
        const token = loginData?.data?.token;
        console.log('Login status:', loginRes.status, 'token present:', !!token);
        const res = await fetch('http://localhost:3001/api/mainpos/kots?limit=5', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        console.log('GET /api/mainpos/kots ->', res.status, JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
