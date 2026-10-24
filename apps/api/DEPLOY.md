Deployment - quick steps

1) Copy the `apps/api` folder to the server (keep `dist`, `package.json`, `prisma`, `scripts`, `sqlite-template`).

2) On the server place your `.env` file next to `package.json` (set `DATABASE_URL`, `PORT`, secrets).

3) Install Node >= 20 on the server.

4) From the `apps/api` folder run:

```bash
npm install
# postinstall runs `prisma generate` automatically
npm run start
```

5) Recommended: run with a process manager (PM2/systemd) for reliability.

Notes:
- If you want `npm install --production` only, run `npx prisma generate` on the server afterwards, because `prisma` is a dev tool.
- If you use SQLite with `prisma` features unsupported by SQLite, use the provided `sqlite-template/dev.db` and set `DATABASE_URL=file:./sqlite-template/dev.db` in `.env`.
