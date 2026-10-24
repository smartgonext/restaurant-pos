const base = 'http://localhost:3001/api';

async function getJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function run() {
  const login = await getJson(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@spicekitchen.com', password: 'admin123' }),
  });

  if (!login.body?.data?.token) {
    console.error('Login failed', login.status, login.body);
    process.exit(1);
  }

  const token = login.body.data.token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const checks = [
    '/restaurant/hotel/dashboard/stats',
    '/restaurant/hotel/dashboard/arrivals',
    '/restaurant/hotel/dashboard/departures',
    '/restaurant/hotel/dashboard/in-house',
    '/restaurant/hotel/room-types',
    '/restaurant/hotel/rooms',
    '/restaurant/hotel/room-status-board',
    '/restaurant/hotel/guests',
    '/restaurant/hotel/reservations',
    '/restaurant/hotel/check-in/pending',
    '/restaurant/hotel/check-out/pending',
    '/restaurant/hotel/rate-plans',
    '/restaurant/hotel/housekeeping',
    '/restaurant/hotel/stays',
    '/restaurant/hotel/venues',
    '/restaurant/hotel/events',
    '/restaurant/orders?type=room_service',
  ];

  console.log('GET endpoint checks:');
  for (const ep of checks) {
    const { status, body } = await getJson(`${base}${ep}`, { headers });
    const ok = status >= 200 && status < 300 && body?.success !== false;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${ep} -> ${status}`);
  }

  const hkCreate = await getJson(`${base}/restaurant/hotel/housekeeping`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      roomId: 1,
      taskType: 'cleaning',
      taskDate: new Date().toISOString(),
      priority: 'medium',
      status: 'pending',
      notes: 'Smoke test task',
    }),
  });
  console.log(`POST /restaurant/hotel/housekeeping -> ${hkCreate.status} success=${hkCreate.body?.success ?? false}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
