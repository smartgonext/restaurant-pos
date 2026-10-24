# 🍽️ WAITER + TABLE WORKFLOW DESIGN
## Bakery Restaurant POS System

---

## 📋 TABLE LIFECYCLE

### TABLE STATES
```
AVAILABLE → OCCUPIED → LOCKED → AVAILABLE
```

| State | Meaning | Waiter Can Add Items | Bill Editable |
|-------|---------|----|----|
| **AVAILABLE** | Empty, no customer | ❌ No (no token) | ❌ N/A |
| **OCCUPIED** | Customer seated, billing active | ✅ Yes (live) | ✅ Yes (new items only) |
| **LOCKED** | Order sent to payment | ❌ No (frozen) | ❌ No |

---

## 🔄 COMPLETE WAITER WORKFLOW

### **PHASE 1: TABLE ASSIGNMENT**

**Trigger:** Customer arrives at restaurant

**Flow:**
1. Waiter walks to table area
2. Sees list of AVAILABLE tables
3. Clicks on available table
4. System prompts: "Enter or scan token"

**Token Source – Two Paths:**

**Path A: Customer HAS Token**
- Customer provides token (QR or number)
- Waiter scans/enters it
- System loads existing bill (if any)
- Table becomes OCCUPIED ✅

**Path B: Customer NEEDS Token**
- Waiter directs customer to Sub POS kiosk
- Customer creates token at kiosk
- Returns to waiter with token
- Waiter scans/enters token
- Table becomes OCCUPIED ✅

**Key Rule:**
- System must check: Is this token already assigned to another active table?
- If YES → Show error: "This token is already at Table 5"
- Prevent duplicate token use across tables

---

### **PHASE 2: TABLE ACTIVATED – BILL LOADS**

**Trigger:** Token successfully attached to table

**System Actions:**
1. Fetch existing bill (if any) from Sub POS
2. Display full order history:
   - Previously added items (PAID or UNPAID)
   - Current totals (subtotal, tax, discount)
3. Mark table as OCCUPIED
4. Broadcast update to all screens (real-time)

**Waiter Sees:**
- Table name/number
- Customer name (if available)
- Existing items (read-only display)
- Empty cart for NEW items

---

### **PHASE 3: WAITER ADDS ITEMS**

**Trigger:** Waiter clicks "Add Items" or taps item category

**Rules:**

1. **NEW ITEMS ONLY**
   - Waiter adds fresh items to this session
   - Items go to temporary "Pending" cart
   - Previous items CANNOT be edited or deleted

2. **Item Options Available:**
   - Quantity (per item)
   - Special notes (spicy, extra sauce, etc.)
   - Remove only from pending cart (not from bill)

3. **Pending Cart Display:**
   - Shows only NEW items (bold/highlighted)
   - Shows price, quantity, subtotal
   - Shows "Item added 2 minutes ago" timestamp

4. **No Modification of Old Items:**
   - If waiter wants to change old item → tell customer to go to Main POS
   - Only Main POS (with password) can edit/refund

---

### **PHASE 4: CONFIRM ORDER – SEND TO KITCHEN**

**Trigger:** Waiter clicks "CONFIRM ORDER" button

**System Behavior:**

1. **Validation Check:**
   - Is at least 1 item in pending cart? → YES → Proceed
   - If NO → Show toast: "No items to send"

2. **Send to Kitchen:**
   - Create KOT (Kitchen Order Ticket) with only NEW items
   - Trigger kitchen printer automatically
   - KOT shows:
     - Table name/number
     - Customer name (if available)
     - New items + quantities + special notes
     - Timestamp
     - "Additional items for existing order" label (if table already had items)

3. **Bill Update:**
   - Add pending items to main bill
   - Recalculate totals (subtotal + tax)
   - Store KOT timestamp
   - Keep table in OCCUPIED state

4. **Clear Pending Cart:**
   - Empty waiter's current session
   - Ready for next batch of items

5. **Feedback to Waiter:**
   - Toast: "✅ Order sent to kitchen #KOT-00234"
   - Sound notification (optional)
   - Kitchen printer spins

---

### **PHASE 5: SERVING FLOW**

**No system interaction required.**

- Kitchen prepares food based on KOT
- When ready, kitchen notifies waiter (kitchen call system or app notification)
- Waiter carries plates to table
- Customer eats

---

### **PHASE 6: ADD MORE ITEMS (REPEAT)**

**Trigger:** Customer wants more items while still at table

**Flow:**

1. Waiter clicks same table again
2. System shows current bill (all previous items)
3. Waiter adds MORE items
4. Clicks "CONFIRM ORDER"
5. NEW items-only KOT sent to kitchen
6. Bill updates again

**Can Repeat:** Unlimited times during one seating

---

### **PHASE 7: CLOSE TABLE – LOCK FOR PAYMENT**

**Trigger:** Waiter says "We're done, customer is ready to pay"

**Flow:**

1. Waiter clicks "FINISH TABLE" or "REQUEST PAYMENT"
2. System confirms: "Close this order? Customer will proceed to Main POS for payment."
3. Waiter confirms
4. Table state changes: OCCUPIED → LOCKED

**System Actions:**
- Bill is now READ-ONLY (cannot add items)
- Waiter cannot make changes
- Customer cannot add more items via Waiter Terminal
- Bill total is FINALIZED
- Token is marked "READY FOR PAYMENT"

---

### **PHASE 8: PAYMENT AT MAIN POS**

**Trigger:** Customer walks to cashier

**Flow:**

1. Cashier or customer scans token at Main POS
2. System loads full bill:
   - All items from Waiter Terminal
   - All items from Sub POS
   - Final total
3. Payment processed (cash, card, digital)
4. If payment successful → CONFIRMED
5. Receipt printed

---

### **PHASE 9: TABLE RESET**

**Trigger:** Payment confirmed at Main POS

**System Actions:**
1. Bill marked as PAID
2. Token detached from table
3. Table state: LOCKED → AVAILABLE
4. Waiter sees table in AVAILABLE list again
5. Broadcast update (real-time)

**Waiter Can:** Assign next customer to this table

---

## ⚙️ CORE SYSTEM RULES

### **WAITER CAN DO:**
- ✅ Add new items to active table
- ✅ Manage pending cart (add/remove pending items)
- ✅ Confirm order and send to kitchen
- ✅ View existing bill (read-only)
- ✅ Reassign token to different table (before confirmation)
- ✅ View kitchen status (which KOT is ready)

### **WAITER CANNOT DO:**
- ❌ Edit existing bill items
- ❌ Delete committed items
- ❌ Apply discounts
- ❌ Process payment
- ❌ Issue refunds
- ❌ Change prices
- ❌ Modify quantity of old items
- ❌ Close table if items are still pending (must confirm first)

### **MAIN POS CAN DO (WITH PASSWORD):**
- ✅ Edit/delete any item
- ✅ Apply discounts/coupons
- ✅ Issue refunds
- ✅ Split bills
- ✅ Merge bills
- ✅ Apply service tax/charges
- ✅ Process payment
- ✅ Void orders

---

## 🛡️ EDGE CASE HANDLING

### **CASE 1: Wrong Token Assigned Before Confirmation**

**Situation:** Waiter scans wrong token for Table 5

**Resolution:**
1. Waiter clicks "CHANGE TOKEN"
2. System shows warning: "You haven't confirmed yet. You can reassign."
3. Scan correct token
4. New bill loads

**After Confirmation:** Cannot change token (must contact admin)

---

### **CASE 2: Duplicate Token Use Prevention**

**Situation:** Token #1234 is already at Table A, waiter tries to use it for Table B

**System Response:**
- Error toast: "🚨 Token #1234 is already active at Table A (Seat 3)"
- Show action buttons:
  - "View Table A"
  - "Use Different Token"
  - "Transfer Token to Table B" (requires confirmation)

**Transfer Flow:**
- Asks: "Move token from Table A to Table B?"
- If yes → Table A becomes AVAILABLE, Table B becomes OCCUPIED
- If no → Abort

---

### **CASE 3: Pending Items When Closing Table**

**Situation:** Waiter clicks "FINISH TABLE" but forgot to confirm pending items

**System Action:**
- Show warning: "⚠️ You have 3 items pending. Confirm order first?"
- Two buttons:
  - "CONFIRM & CLOSE" (sends pending items, then closes)
  - "CONTINUE ADDING" (stay in OCCUPIED mode)

---

### **CASE 4: Customer Moves Table During Meal**

**Situation:** Customer was at Table 2, now moving to Table 5

**Resolution:**
1. Waiter initiates "TRANSFER TOKEN"
2. Selects source table (Table 2 - OCCUPIED)
3. Selects destination table (Table 5 - AVAILABLE)
4. System confirms: "Move bill from Table 2 to Table 5?"
5. On confirm:
   - Table 2 → AVAILABLE (bill stored externally)
   - Table 5 → OCCUPIED (bill loads)
   - Token moves with them
6. Waiter continues adding items at Table 5

---

### **CASE 5: Table Never Confirmed (Abandoned Session)**

**Situation:** Waiter added 5 items but walked away without confirming

**System Behavior:**

*Option A (Auto-Clean):*
- After 15 minutes idle → pending items auto-delete
- Toast: "Pending items expired due to inactivity"

*Option B (Manual):*
- Waiter can click "DISCARD PENDING"
- Confirmation: "Delete 5 pending items?"
- On confirm → cart cleared, bill remains unchanged

**Recommendation:** Option A (prevents human error)

---

### **CASE 6: Network Failure During Confirmation**

**Situation:** Waiter clicks CONFIRM, but server doesn't respond

**System Behavior:**

1. Show spinner for 3 seconds
2. If no response → Show error:
   ```
   "Cannot send to kitchen - No network connection"
   
   ✅ SAVE LOCALLY
   ⏳ RETRY LATER
   ```

3. If user clicks "SAVE LOCALLY":
   - Pending items stored in browser cache
   - KOT queued for when network returns
   - Waiter can close client (items not lost)

4. When network returns:
   - Auto-sync queued KOTs to server
   - Send all pending items
   - Toast: "✅ Queued orders sent!"

---

### **CASE 7: Double-Click Confirm (Prevent Duplicate KOT)**

**Situation:** Waiter double-clicks "CONFIRM ORDER"

**System Behavior:**
- Button becomes DISABLED after first click
- Spinner shows: "Sending to kitchen..."
- Button re-enables only after server response
- Prevents accidental duplicate KOT printing

---

### **CASE 8: Non-KOT Items in Bill**

**Situation:** Bill has items from Sub POS (bakery counter), waiter adds dine-in items

**System Behavior:**
- Old Sub POS items appear in read-only section
- Waiter items go to pending cart
- On confirm → Only waiter items sent to kitchen
- Main POS can see both when bill closes

---

## 📊 REAL-TIME UPDATES

**System broadcasts to all waiter terminals when:**

1. Table state changes (AVAILABLE → OCCUPIED)
2. KOT status updates ("Ready for serving")
3. Table is transferred
4. Bill is locked for payment
5. Payment confirmed (table freed up)

**Result:** All waiters see live table availability instantly

---

## ⚡ PERFORMANCE REQUIREMENTS

| Action | Target Time |
|--------|------------|
| Click table → Load bill | < 500ms |
| Add item to cart | Instant |
| Confirm order → KOT printed | < 1000ms |
| Table state update (broadcast) | < 500ms |
| Token lookup (scan/manual) | < 800ms |

---

## 🎯 WAITER TERMINAL SCREENS

### **SCREEN 1: TABLE SELECTION**
```
┌─────────────────────────┐
│ SELECT TABLE            │
├─────────────────────────┤
│ [?] Enter/Scan Token    │
│                         │
│ 🟢 Table 1 - AVAILABLE  │
│ 🔴 Table 2 - OCCUPIED   │
│ 🔴 Table 3 - OCCUPIED   │
│ 🟢 Table 4 - AVAILABLE  │
└─────────────────────────┘
```

### **SCREEN 2: ACTIVE TABLE (OCCUPIED)**
```
┌─────────────────────────┐
│ TABLE 2 | Customer: Raj │
├─────────────────────────┤
│ EXISTING BILL (Read-Only)
│ • Biryani x1  ₹450      │
│ • Naan x2     ₹200      │
│ Subtotal: ₹650          │
│                         │
│ ADD NEW ITEMS:          │
│ [+] Biryani    ₹450     │
│ [+] Butter Chicken ₹350 │
│ [+] Chai       ₹50      │
│                         │
│ PENDING (2 items):      │
│ • Biryani x1 ₹450       │
│ • Chai x1    ₹50        │
│ CONFIRM CONFIRM [CANCEL]
│ ───────────────────────│
│ FINISH TABLE            │
└─────────────────────────┘
```

### **SCREEN 3: KOT CONFIRMATION**
```
┌─────────────────────────┐
│ ✅ ORDER SENT!          │
│ KOT #0456               │
│ Table 2                 │
│                         │
│ • Biryani x1            │
│ • Chai x1               │
│                         │
│ Sent to kitchen! 🚀     │
│ [CLOSE] [PRINT AGAIN]   │
└─────────────────────────┘
```

---

## 🔐 SECURITY & CONSTRAINTS

1. **Waiter Terminal Access:**
   - Login required (same staff account)
   - Device PIN optional
   - Auto-logout after 30 min inactivity

2. **Bill Modification Lock:**
   - Once confirmed, items locked
   - Main POS has password protection for edits

3. **Payment Verification:**
   - Only Main POS can close bills
   - Token payment confirms bill status

4. **Audit Trail:**
   - Log every action (who added what, when, which table)
   - KOT timestamp recorded
   - Payment timestamp recorded

---

## 🚀 SUCCESS CRITERIA

**System is working correctly when:**

✅ Waiter adds 10+ items in under 1 minute  
✅ KOT prints within 1 second of confirmation  
✅ Table switches instantly ($< 500ms)  
✅ Network fails → items queue locally, sync on reconnect  
✅ No duplicate KOTs even with double-click  
✅ Duplicate tokens detected and prevented  
✅ Multiple waiters see live table updates  
✅ Customer confusion minimized (clear flow)  

---

## 📝 COMMON QUESTIONS ANSWERED

**Q: Can waiter split bill?**
A: No. Only Main POS can split. Waiter Terminal = single token per table.

**Q: What if customer leaves without paying?**
A: Bill locked at Main POS. Admin/Manager resolves with password.

**Q: Can waiter cancel an order after confirmation?**
A: No. Kitchen already received KOT. Must ask Manager to void in Main POS.

**Q: Waiter quits mid-shift, pending items in cart?**
A: Auto-discard (no confirmation) after 15 min or on logout.

**Q: Can we track which waiter added what?**
A: Yes. Each item stamped with "waiter: name" and timestamp.

---

## 🎬 END RESULT

**User Experience:**
1. Waiter taps table
2. Bill appears instantly
3. Taps items
4. Confirms with one click
5. KOT prints automatically
6. Customer pays at Main POS
7. Table resets automatically

**All in real-world time, zero confusion.**

