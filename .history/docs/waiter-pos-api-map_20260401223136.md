# Waiter & POS API Map

Generated: 2026-04-01

This document summarizes the primary endpoints used by the Waiter UI and POS terminals (Main/Sub POS). It is an initial map created while performing the "Map waiter and POS APIs" task.

---

## Main POS (/api/mainpos)
- **POST /login**: Main POS authentication. See [apps/api/src/routes/mainpos/index.ts](apps/api/src/routes/mainpos/index.ts)
- **GET /loyalty-config**: Loyalty settings for Main POS
- **GET /items**: All menu items (Main POS view)
- **GET /customers**: Customer search
- **GET /categories**: Item categories
- **POST /token/lookup**: Find token by QR or tokenNumber
- **GET /token/:qr**: Full bakery token details
- **POST /token/create**: Create bakery token (may create linked order/KOT)
- **POST /token/:qr/items/bulk**: Add multiple items to token
- **POST /token/:qr/items**: (not implemented in code; returns 501)
- **POST /token/:qr/merge-order**: Merge an order into a token
- **DELETE /token/:qr/items/:itemId**: Soft-delete token item (POS protected by admin password)
- **PUT /token/:qr/items/:itemId**: Edit item quantity (POS protected)
- **POST /token/:qr/customer**: Attach customer to token
- **POST /token/:qr/loyalty/claim**: Redeem loyalty points for token
- **POST /token/:qr/payment**: Record payment for token (supports partial payments)
- **GET /recent-tokens**: Recent tokens for branch

## Sub POS (/api/subpos)
- **POST /login**: Sub POS auth
- **GET /items**: Items visible to this terminal (groupIds filtered)
- **GET /categories**
- **GET /customers**
- **POST /token/create**: Create bakery token (may create order/KOT)
- **POST /token/:qr/items**: Add single item to token
- **GET /token/:qr**: Token details
- **POST /token/:qr/customer**: Attach customer
- **GET /tokens-today**: Count tokens for today
See [apps/api/src/routes/subpos/index.ts](apps/api/src/routes/subpos/index.ts)

## Restaurant (/api/restaurant)
- **POST /orders**: Create order + KOTs; used by Waiter to send KOTs to kitchen. Emits `new_order` and `new_kot`. See [apps/api/src/routes/restaurant/index.ts](apps/api/src/routes/restaurant/index.ts#L1130)
- **GET /orders**, **GET /orders/:id**, **PUT /orders/:id**, **POST /orders/:id/cancel**, **POST /orders/:id/bill**
- **PUT /kot-items/:id/status**: Update single KOT item status; emits `kot_item_updated`
- **GET /kots**, **PUT /kots/:id/status**
- **GET /tokens**, **GET /tokens/by-table/:tableId**: Waiter uses `tokens/by-table` to load an open token for a table
- **POST /tokens/:id/edit**, **POST /tokens/:id/delete** (admin operations)
- **POST /tables/:id/close**: Close table and optionally mark linked token as paid

## Waiter UI — API usage (apps/web/src/pages/waiter/WaiterTerminal.tsx)
- Uses `GET /restaurant/tables` to list tables
- Uses `GET /subpos/items` and `GET /subpos/categories` for menu & categories
- Fetches `GET /restaurant/settings` for tax/flags
- `POST /restaurant/tokens/lookup` to attach an existing token to a table
- `POST /subpos/token/create` to create & link a new token for a table
- `POST /restaurant/orders` to send pending items as an order/KOT (KOT -> kitchen)
- `POST /restaurant/tables/:id/close` to finalize bill and free table
- Fallbacks: `GET /restaurant/orders` and `GET /restaurant/tokens/:id` when needed
See [apps/web/src/pages/waiter/WaiterTerminal.tsx](apps/web/src/pages/waiter/WaiterTerminal.tsx)

## Real-time events (socket)
- Emitted events used by UI: `token_created`, `token_updated`, `token_paid`, `new_kot`, `new_order`, `kot_item_updated`, `kot_updated`, `order_updated`, `customer_display_show_bill`, `customer_display_payment_ok`
- Emitters live in the route handlers and [apps/api/src/plugins/socket.ts](apps/api/src/plugins/socket.ts) (payload sanitizer is applied there).

## Notes & Observations
- Numbering: many routes use create-then-update pattern to set deterministic `orderNumber` / `kotNumber` (DB id based). Confirmed in mainpos/subpos/restaurant routes.
- Tax: frontend expects `restaurant/settings` (`sgstRate`/`cgstRate`) — several UI pages use this.
- Payments: token payments support partial payments and aggregate sums on the backend.

## Next steps (this task sequence)
1. Identify missing workflows and UX gaps (in progress next)
2. Propose API/schema changes where necessary
3. Implement frontend waiter UI improvements

---

References:
- Main POS routes: [apps/api/src/routes/mainpos/index.ts](apps/api/src/routes/mainpos/index.ts)
- Sub POS routes: [apps/api/src/routes/subpos/index.ts](apps/api/src/routes/subpos/index.ts)
- Restaurant routes: [apps/api/src/routes/restaurant/index.ts](apps/api/src/routes/restaurant/index.ts)
- Waiter UI: [apps/web/src/pages/waiter/WaiterTerminal.tsx](apps/web/src/pages/waiter/WaiterTerminal.tsx)
