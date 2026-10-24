# Playwright Regression Specs

This folder contains lightweight Playwright regression scripts for critical frontend flows:

- `login.spec.mjs`: admin login smoke
- `navigation.spec.mjs`: superadmin route navigation smoke
- `create-dashboard-sync.spec.mjs`: create restaurant + dashboard metric sync
- `responsive-smoke.spec.mjs`: viewport overflow smoke (desktop/tablet/mobile)
- `run-all.mjs`: sequential runner

## Environment

Optional env overrides:

- `QA_BASE_URL` (default: `http://localhost:5173`)
- `QA_SUPERADMIN_EMAIL` (default: `admin@restaurant-saas.com`)
- `QA_SUPERADMIN_PASSWORD` (default: `admin123`)
- `QA_ADMIN_EMAIL` (default: `demo@spicekitchen.com`)
- `QA_ADMIN_PASSWORD` (default: `admin123`)

## Run

From workspace root:

```bash
pnpm --filter @restaurant-saas/web test:qa:all
```

Or individual specs:

```bash
pnpm --filter @restaurant-saas/web test:qa:login
pnpm --filter @restaurant-saas/web test:qa:navigation
pnpm --filter @restaurant-saas/web test:qa:create-sync
pnpm --filter @restaurant-saas/web test:qa:responsive
```
