You are a senior SaaS architect and enterprise POS engineer.

Use my existing codebase as base and modify it incrementally. Do not rebuild from scratch.

Project stack:
- Frontend: React + Vite + Zustand + Tailwind
- Backend: Fastify + Prisma + MySQL + Socket.IO
- Auth: JWT + refresh token
- Multi-tenant model already exists

Business target:
Build an enterprise Bakery + Restaurant POS system for one company with multiple branches.

Core hierarchy:
- One store/company
- Multiple branches
- Each branch has:
  - Multiple Sub POS terminals
  - Multiple Main POS terminals
  - Waiter/table flow with KOT printer integration
  - Shared branch-level reporting and stock

Role model:
1) Office Admin
- Full access to all branches
- Create/edit branches
- Create/edit Main POS and Sub POS terminals
- Assign category groups to Sub POS terminals
- Access full reports, stock, suppliers, accounts, tax, loyalty

2) Sub POS (token counter)
- Only scan/add items and generate token
- No edit/delete of existing token items
- Token print must contain:
  - Big token number
  - QR code
  - Optional customer name and phone
- Token numbering rules:
  - Unique per branch per business day
  - Reset daily at configurable reset time

3) Main POS (billing counter)
- Fetch bill by QR or token number
- Can add items to existing bill
- Edit/delete only with:
  - password verification
  - mandatory reason
  - audit log entry
- Payment modes: cash, card, UPI/GPay, others
- UPI flow:
  - show customer display QR
  - on success show completion message
  - close payment flow cleanly

4) Waiter/restaurant flow
- Waiter scans QR or enters token
- Assign table and add food items
- Confirm action should:
  - append new items only
  - send KOT print command automatically
- No modification of previously committed token items
- Table can be reopened to add more items until final billing

Customer flow scenarios to support:
- Snacks/toys billed in Sub POS first
- Customer then eats at restaurant and waiter adds items
- Main POS later loads full unified bill using same token/QR
- Customer pays and bill closes

Loyalty requirements:
- Points only if customer profile (name/phone) exists
- Admin configures earning and redemption rules
- Support full claim and partial claim
- Track and report:
  - points earned history
  - points redeemed history
  - remaining points
- If customer redeems all points, balance becomes 0
- If partial redemption, remaining points stay for later use

Tax/GST requirements (India):
- Support both exclusive and inclusive tax modes
- Exclusive:
  - GST Amount = (Base Amount * Rate) / 100
  - Net Amount = Base + GST
- Inclusive:
  - Base = Total * 100 / (100 + Rate)
  - GST = Total - Base
- Support:
  - CGST + SGST for intra-state
  - IGST for inter-state
- Admin can configure rates by item/category and mode

Inventory + supplier:
- Auto stock reduction on sale
- Low stock alerts
- Supplier purchase and payment tracking
- Supplier balances and payable reporting

Performance and UX:
- Realtime updates with Socket.IO
- Keyboard-friendly fast POS screens
- No page reloads for critical flows
- Token lookup under 1 second target
- Mobile/tablet compatible UI

Security and compliance:
- Strict role/channel isolation
- POS auth separated by terminal credentials
- JWT access + refresh token DB persistence
- Audit logs for all critical operations:
  - item edit/delete
  - payment events
  - override actions

Implementation constraints:
- Keep existing modules and architecture
- Add changes in phases with backward compatibility
- Add Zod validation for all modified/new endpoints
- Add Prisma migrations for schema updates
- Add tests for token, payment idempotency, and role restrictions

Expected output from you on each run:
1) Exact files to update
2) Prisma schema changes and migration steps
3) Backend API route contracts
4) Frontend page/component updates
5) Flow diagrams for token + payment + waiter/KOT
6) Step-by-step rollout plan (staging -> pilot branch -> full rollout)
7) Risks and mitigation checklist

Important:
- Never return generic explanation only
- Always provide production-level, implementation-ready details tied to current code
- Always preserve existing behavior unless explicitly improving/fixing it
