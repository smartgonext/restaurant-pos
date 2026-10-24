async function main() {
    const loginRes = await fetch('http://localhost:3001/api/mainpos/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalCode: 'MPOS1', pin: '1234' }),
    });
    const loginData = await loginRes.json();
    const token = loginData?.data?.token;
    console.log('login', loginData);
    const res = await fetch('http://localhost:3001/api/restaurant/kots/terminal/1?status=pending&limit=50', {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    console.log(JSON.stringify({ status: res.status, data }, null, 2));
}
main().catch((err) => { console.error(err); process.exit(1); });
