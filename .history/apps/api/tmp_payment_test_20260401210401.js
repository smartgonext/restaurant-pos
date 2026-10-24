(async () => {
  const login = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@spicekitchen.com', password: 'admin123' }),
  });
  const loginData = await login.json();
  console.log('auth', login.status, loginData);
  if (!loginData.data?.token) return;

  const mainLogin = await fetch('http://localhost:3001/api/mainpos/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminalCode: 'main1', pin: '1234' }),
  });
  const mainData = await mainLogin.json();
  console.log('mainlogin', mainLogin.status, mainData);
  if (!mainData.data?.token) return;
  const token = mainData.data.token;

  const pay = await fetch('http://localhost:3001/api/mainpos/token/68290991-f2dc-4e54-af13-ce201495589f/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: 'cash', amount: 33.58 }),
  });
  const payData = await pay.json();
  console.log('pay', pay.status, payData);
})();