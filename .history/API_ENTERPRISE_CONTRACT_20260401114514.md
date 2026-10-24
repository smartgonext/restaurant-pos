# Enterprise POS API Contract (Bakery + Restaurant)

## Scope
This contract defines production API behavior for token lifecycle, role isolation, loyalty, tax, and payment safety.

## 1. Sub POS APIs

### POST /api/subpos/login
- Purpose: terminal authentication
- Request:
```json
{ "terminalCode": "COUNTER-A", "pin": "1234" }
```
- Response:
```json
{ "success": true, "data": { "token": "jwt", "terminal": { "id": 1, "name": "Counter A", "branchId": 2, "groupIds": [1,2] } } }
```

### GET /api/subpos/items
- Purpose: fetch only allowed menu items by assigned category groups
- Auth: `type=subpos`
- Cache: Redis key `subpos:items:{restaurantId}:{branchId}:{groupHash}`

### GET /api/subpos/categories
- Purpose: fetch allowed categories
- Cache: Redis key `subpos:categories:{restaurantId}:{branchId}:{groupHash}`

### POST /api/subpos/token/create
- Purpose: create token with first items
- Rules:
  - Token number uses branch + businessDate sequence
  - Items restricted by terminal group permissions
- Request:
```json
{
  "items": [{ "menuItemId": 101, "quantity": 2 }],
  "customerName": "Ravi",
  "customerPhone": "9876543210"
}
```

### POST /api/subpos/token/:qr/items
- Purpose: append items to open/partial-paid token
- Forbidden: edit/delete historical items

### GET /api/subpos/token/:qr
- Purpose: full token view for this terminal channel

### GET /api/subpos/tokens-today
- Purpose: branch business-day token count

---

## 2. Main POS APIs

### POST /api/mainpos/login
- Purpose: terminal authentication

### GET /api/mainpos/items
- Purpose: all active items for billing
- Cache: Redis key `mainpos:items:{restaurantId}:{branchId}`

### GET /api/mainpos/categories
- Purpose: all categories for billing UI
- Cache: Redis key `mainpos:categories:{restaurantId}:{branchId}`

### POST /api/mainpos/token/lookup
- Request:
```json
{ "qrCode": "uuid" }
```
or
```json
{ "tokenNumber": 124 }
```
- Rule for tokenNumber lookup: `restaurantId + branchId + businessDate + tokenNumber`

### GET /api/mainpos/token/:qr
- Purpose: fetch complete bill state

### POST /api/mainpos/token/create
- Purpose: create token from main counter

### POST /api/mainpos/token/:qr/items
- Purpose: add single item to token
- Status guard: reject if `paid` or `cancelled`

### POST /api/mainpos/token/:qr/items/bulk
- Purpose: add multiple items

### POST /api/mainpos/token/:qr/merge-order
- Purpose: merge waiter order/KOT items to token

### DELETE /api/mainpos/token/:qr/items/:itemId
- Purpose: soft delete item
- Required body:
```json
{ "adminPassword": "****", "reason": "Customer correction" }
```
- Side effects:
  - soft-delete item
  - recalculate totals
  - write audit log

### PUT /api/mainpos/token/:qr/items/:itemId
- Purpose: edit quantity with strict controls
- Required body:
```json
{ "quantity": 2, "adminPassword": "****", "reason": "Correction" }
```

### POST /api/mainpos/token/:qr/loyalty/claim
- Request:
```json
{ "customerId": 44, "pointsToClaim": 50 }
```
- Rule: validate available points and create redemption transaction

### POST /api/mainpos/token/:qr/payment
- Required header: optional `idempotency-key`
- Request:
```json
{ "method": "upi", "amount": 540, "transactionId": "UPI123" }
```
- Behavior:
  - duplicate `idempotency-key` on same token returns prior outcome
  - on full payment: set token paid, award loyalty points, log audit, emit socket events
  - on partial payment: mark partial and audit

### GET /api/mainpos/recent-tokens
- Purpose: recent branch business-day tokens

---

## 3. Waiter / Restaurant APIs (Existing and Required Integration)

### Restaurant order confirm -> KOT
- On token-linked table flow, waiter can append new items only
- KOT event emitted to kitchen channel

### KOT status updates
- Existing KOT status routes remain authoritative

---

## 4. Security and Validation Rules
- All protected routes require JWT verification
- Channel-specific auth guards:
  - `subposAuth`
  - `mainposAuth`
  - staff auth via restaurant route hooks
- Zod validation required for request body/query/params
- Reject mutation for closed tokens
- Sensitive actions must include reason and audit entry

---

## 5. Error Contract
Standard response:
```json
{ "success": false, "error": "message" }
```
Recommended status map:
- `400` validation/business rule failure
- `401` unauthenticated
- `403` forbidden/role violation
- `404` entity not found
- `409` idempotency/duplicate operation conflict (optional future enhancement)
- `500` internal error
