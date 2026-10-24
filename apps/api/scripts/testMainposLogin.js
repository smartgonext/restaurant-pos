async function main() {
    const res = await fetch('http://localhost:3001/api/mainpos/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalCode: 'MPOS1', pin: '1234' }),
    });
    const data = await res.json();
    console.log(JSON.stringify({ status: res.status, data }, null, 2));
}
main().catch((err) => { console.error(err); process.exit(1); });
