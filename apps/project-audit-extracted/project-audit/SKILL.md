---
name: project-audit
description: >
  Full-project QA and audit skill. Triggers whenever a user wants to test, audit, review, or evaluate
  an entire software project — including UI/UX, logic, function flow, real-time behavior, and
  scenario-based testing — and produce a single unified problem report. Use this skill whenever the
  user says things like: "find all bugs in my project", "audit my app", "what's wrong with my project",
  "test my UI and logic", "give me a full report of issues", "review my codebase for problems",
  "compare expected vs real behavior", "UI/UX + logic full review", or any variant asking for a
  comprehensive multi-dimensional project analysis. Always use this skill for requests that combine
  UI review + functional review + logic/flow review into one deliverable report.
---

# Project Audit & QA Reporter

A skill for conducting a **full-spectrum audit** of a software project — covering UI/UX, component
logic, data flow, real-time behavior, edge cases, and scenario-based testing — and producing one
consolidated, prioritized problem report.

---

## What This Skill Does

Given a project (uploaded files, pasted code, or described architecture), Claude will:

1. **Ingest and map** the project structure
2. **Audit across 6 dimensions** (see below)
3. **Simulate real-world scenarios** step by step
4. **Compare expected vs actual behavior**
5. **Produce a single structured report** — from small cosmetic issues to critical logic failures

---

## Audit Dimensions

Run all 6 dimensions for every audit. Never skip a dimension even if it seems "not relevant."

### 1. UI/UX Audit
- Layout breakage at common zoom levels (100%, 110%, 125%)
- Overflow / clipping of buttons, labels, modals
- Mobile responsiveness (if applicable)
- Inconsistent spacing, font sizes, color usage
- Accessibility: missing labels, poor contrast, keyboard traps
- Loading states, empty states, error states — are they handled visually?
- Action feedback: do buttons give visual response on click?
- Form UX: validation messages, field focus, disabled states

### 2. Component Logic Audit
- Props passed correctly between parent/child components
- State initialized with correct types and defaults
- Derived state recalculated when source changes
- Side effects (useEffect) have correct deps arrays — no stale closures
- Conditional renders cover all branches (null, empty, error, loading, data)
- Event handlers don't silently fail

### 3. Data Flow & State Management Audit
- Data fetched at the right level (not too high, not too low)
- Cache invalidation after mutations
- Optimistic updates rolled back on failure
- Zustand / Redux / Context: selectors don't over-subscribe causing re-renders
- Server state vs client state clearly separated
- Data transformation bugs (wrong field name, missing `.toFixed()`, unit mismatch)

### 4. Business Logic & Calculation Audit
- Formulas verified against spec (price × qty, GST splits, profit %, MRP logic, etc.)
- Edge cases: zero qty, negative values, empty cart, no items selected
- Rounding errors in currency / percentage calculations
- Sequence dependencies: does step B assume step A already ran?
- Duplicate entries caused by missing deduplication
- Off-by-one errors in pagination, indexing, date ranges

### 5. Real-Time & Async Flow Audit
- Race conditions: multiple simultaneous requests, last-write-wins conflicts
- Loading spinners block duplicate submissions?
- Error boundaries: does a failed API call crash the whole page?
- Websocket / polling: reconnect logic, stale data shown?
- Debounce / throttle: search inputs, auto-save, stock quantity updates
- Optimistic UI vs server truth mismatch

### 6. Scenario-Based Flow Testing
Walk through these flows end-to-end (adapt to project type):

| Scenario | What to Check |
|---|---|
| New user first use | Onboarding, empty states, defaults |
| Happy path main task | All steps, all fields, correct outcome |
| Edit existing record | Pre-fill, dirty state, save/cancel |
| Delete / remove item | Confirmation, list refresh, cascade effects |
| Validation failure | Error messages, blocked submission, recovery |
| Network / API failure | Error shown, retry available, no data loss |
| Large data set | Performance, pagination, scroll behavior |
| Concurrent edits | Last-write conflicts, stale reads |
| Browser zoom 110%–125% | Layout integrity |
| Mobile / narrow viewport | Responsive breakpoints |

---

## Audit Process — Step by Step

### Step 1: Ingest the Project

Ask the user to provide ONE or MORE of:
- Source files (paste or upload)
- File/folder structure listing
- Description of stack + features
- Screenshots or screen recordings (if available)

If files are uploaded, read them with appropriate file-reading tools. If a ZIP or folder structure is
described, map it mentally before starting.

**Do not start auditing until you understand the project structure.**

### Step 2: Build the Project Map

Before writing the report, produce an internal map (you can show this to the user):

```
Project: [Name]
Stack: [React/TS, Node/Fastify, Prisma, etc.]
Key Modules: [List main pages/components/routes]
Data Flows: [List main data paths: UI → store → API → DB]
Business Rules: [List critical calculations or workflows]
```

### Step 3: Run All 6 Audit Dimensions

Go through each dimension systematically. For each finding, record:
- **Location**: file name + line number (if known) or component/section name
- **Severity**: Critical / High / Medium / Low / Cosmetic
- **Category**: UI/UX | Logic | Data Flow | Business Rule | Async | Scenario
- **Description**: What is wrong
- **Expected**: What should happen
- **Actual**: What actually happens (or likely happens)
- **Fix Direction**: Brief suggestion on how to fix

### Step 4: Run Scenario Flows

Mentally execute each scenario from the table above through the actual code. Note where the flow
breaks, produces wrong output, or produces no output.

### Step 5: Compile the Report

Use the **Report Format** below. Sort findings by severity (Critical first). Group by category.

---

## Report Format

Produce ONE report with this exact structure:

```
═══════════════════════════════════════════════════════════
  PROJECT AUDIT REPORT — [Project Name]
  Date: [Date] | Audited by: Claude Project Audit Skill
═══════════════════════════════════════════════════════════

## EXECUTIVE SUMMARY
[2–4 sentences: overall health, biggest risk areas, total issue count by severity]

Critical: X | High: X | Medium: X | Low: X | Cosmetic: X
Total Issues Found: X

---

## SECTION 1 — UI/UX ISSUES
[List each issue with: ID, Severity, Location, Description, Expected, Actual, Fix]

## SECTION 2 — COMPONENT LOGIC ISSUES
[Same format]

## SECTION 3 — DATA FLOW & STATE ISSUES
[Same format]

## SECTION 4 — BUSINESS LOGIC & CALCULATION ISSUES
[Same format]

## SECTION 5 — ASYNC & REAL-TIME ISSUES
[Same format]

## SECTION 6 — SCENARIO FLOW FAILURES
[Walk through each scenario and note where it breaks]

---

## PRIORITY FIX LIST (Top 10 must-fix)
[Numbered list: most impactful fixes in order]

## QUICK WINS (Low effort, immediate improvement)
[Bulleted list of cosmetic/low items that are fast to fix]
```

---

## Issue ID Format

Use this format for issue IDs:
- `UI-001`, `UI-002` — UI/UX
- `LOG-001`, `LOG-002` — Component Logic
- `DAT-001` — Data Flow / State
- `BIZ-001` — Business Logic / Calculations
- `ASY-001` — Async / Real-time
- `SCN-001` — Scenario Flow

---

## Severity Definitions

| Level | Meaning |
|---|---|
| **Critical** | App crashes, data corrupted, payments/calculations wrong, security hole |
| **High** | Feature broken for most users, major workflow blocked |
| **Medium** | Feature works but produces wrong results, confusing UX, workaround exists |
| **Low** | Minor incorrect behavior, edge case only, non-blocking |
| **Cosmetic** | Visual misalignment, wrong color, label typo, spacing off |

---

## Output Options

After the report, offer the user:
1. **DOCX export** — full report as a Word document (use docx skill)
2. **Deep dive** — expand any single issue with a full root-cause analysis and code fix
3. **Fix mode** — generate corrected code for a specific issue
4. **Retest** — after user applies fixes, re-audit changed sections

---

## Special Handling for Arish's Stack

When auditing **TableTrack POS** or related projects (React/TypeScript, Tailwind, Zustand,
TanStack Query, Node/Fastify, Prisma, MySQL/SQLite, cPanel/LiteSpeed):

### POS-Specific Checks
- MRP dropdown: verify `sellingPrice` uses `purchaseRate × (1 + profitPercent/100)` not raw `mrp`
- Cart merging: check for duplicate rows when same SKU added twice with different MRP selections
- SubPOS / MainPOS parity: features added to one terminal but missing in the other
- Flexbox overflow at 100% zoom: action buttons clipped inside fixed-height containers
- `useEffect` stale closures on cart state (known recurring issue)
- `groupMRPsByItem()` dedup logic — verify it runs before render, not after

### Purchase Stock Module Checks
- Variant drawer: staged cart items vs direct stock movements — which path is active?
- GST split: CGST + SGST = total GST, verify no double-counting
- Supplier balance: verify debit/credit direction consistent across create/edit/delete flows

### Tamil-Language / Bilingual Checks
- Tamil text overflow in fixed-width cells
- Font rendering: verify Tamil script font loaded (Noto Sans Tamil or similar)
- Mixed Tamil/English labels in same component — alignment consistency

---

## Tips for High-Quality Audits

- **Don't just read code — trace data.** Follow a value from its source (API/DB) through state,
  through props, to the rendered output. This catches transformation bugs that code-reading misses.
- **Test boundary values mentally.** What happens with 0 items? 1000 items? ₹0 price? null supplier?
- **Look for asymmetry.** If create flow handles X, does edit flow also handle X?
- **Check what happens on second run.** Many bugs only appear when data already exists (duplicate
  keys, stale cache, leftover state from previous session).
- **Read the UI as a user, not a developer.** Would a restaurant cashier understand this screen?
  Would they make mistakes with this layout under pressure?
