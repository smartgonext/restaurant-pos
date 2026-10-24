const base = 'http://localhost:3001/api';

async function run() {
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@spicekitchen.com', password: 'admin123' }),
  });
  const loginJson = await loginRes.json();
  if (!loginRes.ok || !loginJson?.data?.token) {
    console.error('Login failed', loginRes.status, loginJson);
    process.exit(1);
  }

  const token = loginJson.data.token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const endpoints = [
    '/restaurant/hotel/dashboard/stats',
    '/restaurant/hotel/dashboard/arrivals',
    '/restaurant/hotel/dashboard/departures',
    '/restaurant/hotel/dashboard/in-house',
    '/restaurant/hotel/room-types',
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${base}${ep}`, { headers });
    const body = await res.json().catch(() => ({}));
    console.log(ep, res.status, body?.success ?? null);
  }

  const createPayload = {
    name: `Deluxe Test ${Date.now()}`,
    description: 'API test room type',
    basePrice: 1499,
    maxOccupancy: 2,
    category: 'standard',
  };

  const createRes = await fetch(`${base}/restaurant/hotel/room-types`, {
    method: 'POST',
    headers,
    body: JSON.stringify(createPayload),
  });
  const createBody = await createRes.json().catch(() => ({}));
  console.log('POST /room-types', createRes.status, createBody?.success ?? null, createBody?.error ?? '');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
