# Enterprise POS Implementation Backlog

## P0 - Must Complete Before Full Rollout
1. Prisma migration execution
- Add `businessDate` and payment idempotency columns
- Backfill `businessDate` for existing tokens
- Validate unique constraints in staging

2. Payment idempotency UI integration
- Send `idempotency-key` header from Main POS frontend
- Retry-safe UX on payment button under network lag

3. Validation normalization
- Move all route schemas into shared schema modules
- Enforce schema parsing for all token, payment, loyalty, and terminal routes

4. Route security audit
- Verify unauthenticated surface area is limited to login/health/public only
- Confirm branch isolation on all branch-owned operations

## P1 - High Impact, Next Sprint
1. Terminal provisioning hardening
- Terminal status toggles with forced session invalidation
- Track terminal lastSeen, lastIP, user-agent hash

2. Loyalty ledger hardening
- Add opening/closing balance fields in loyalty transaction records
- Add nightly reconciliation job

3. Inventory coupling
- Complete stock-out movement provenance (`referenceType`, `referenceId`)
- Add low-stock alert queue and admin notifications

4. Reporting acceleration
- Add daily aggregates table for token sales by branch/terminal
- Cache report widgets with short TTL and explicit invalidation hooks

## P2 - Scale and Operations
1. Observability
- Add structured business logs for token lifecycle events
- Add metric dashboard for token lookup latency and payment success rate

2. Concurrency robustness
- Add retry wrapper for token sequence conflict on unique key race
- Add dead-letter strategy for failed realtime notifications

3. Multi-branch analytics
- Branch-vs-branch performance dashboard with trends
- POS-wise throughput and error rate dashboard

## Testing Matrix
1. Functional
- Sub POS token create, add item, customer attach
- Waiter append and KOT dispatch
- Main POS lookup, edit/delete override, loyalty claim, payment

2. Security
- Wrong-role and wrong-branch access rejection
- Password override enforcement on sensitive actions

3. Reliability
- Duplicate payment request with same `idempotency-key`
- Intermittent Redis availability fallback behavior

4. Tax and finance
- Inclusive/exclusive tax parity
- Intra-state vs inter-state consistency
- Loyalty earn/redeem reconciliation

## Release Strategy
1. Pilot one branch
2. Observe for 3 days (latency, payment retries, audit coverage)
3. Roll out branch-wise with rollback guardrails
