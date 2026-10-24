# 🖥️ CUSTOMER DISPLAY SYSTEM — WORKFLOW

---

## OVERVIEW
Dual-screen POS: **Main POS (Cashier)** ↔ **Customer Display (Customer-facing)**
Real-time sync via WebSocket. No payment gateway — static UPI QR only.

---

## 🔄 WORKFLOW STATES & TRANSITIONS

### **STATE 1: IDLE**
**Display Shows:**
- Welcome message
- Shop branding
- "Please wait…"
- (Waiting for cashier action)

**Triggers Exit:**
- Cashier clicks "Present to Customer" button
- Triggers: Load bill → Transition to SHOWING

---

### **STATE 2: SHOWING (Bill Display)**
**Display Shows:**
- Token Number (large)
- Customer Name (if exists)
- Item List (name, qty, price per item)
- Subtotal
- Tax (SGST + CGST)
- Total Amount (large, bold)
- Action Buttons: "Show Payment QR", "Mark Paid (Cash)", "Reset"

**Triggers Exit:**
- Cashier selects payment method → PAYMENT_QR or PAYMENT_OK
- Cashier cancels bill → IDLE
- Auto-timeout after 15min → IDLE

---

### **STATE 3: PAYMENT QR**
**Display Shows:**
- UPI Payment QR Code (static, 420×420)
- Total Amount
- Message: "Scan & Pay"
- Buttons: "Already Paid", "Back"

**How QR Works:**
- QR encodes: `upi://pay?pa=[MERCHANT_UPI]&pn=[MERCHANT_NAME]&am=[AMOUNT]&tr=[TOKEN_ID]`
- Customer scans → Opens UPI app (GPay/PhonePe/Paytm)
- Amount pre-filled
- Manual payment confirmation by cashier

**Triggers Exit:**
- Cashier clicks "Already Paid" → PAYMENT_OK
- Cashier clicks "Back" → SHOWING
- Auto-timeout 3min → SHOWING

---

### **STATE 4: PAYMENT_OK (Success Screen)**
**Display Shows:**
- ✅ Checkmark (green, large)
- "Payment Confirmed"
- Bill Amount
- Customer Name
- Thank you message
- "Thank you & Visit Again!"

**Auto-Behavior:**
- Show for 5 seconds
- Then auto-transition → IDLE (reset)

---

## 📡 REAL-TIME SYNC MECHANISM

### Socket Events (Main POS → Customer Display)

#### Event 1: `customer_display_show_bill`
```javascript
{
  tokenNumber: 125,
  customerName: "John",
  // Display fetches full token details from /restaurant/tokens/lookup
}
```
**Trigger:** Cashier clicks "Present to Customer"  
**Display Action:** Load bill, show SHOWING state

---

#### Event 2: `customer_display_payment_ok`
```javascript
{
  customerName: "John",
  paid: 500,
  pointsEarned: 50
}
```
**Trigger:** `/mainpos/token/:qr/payment` endpoint records payment  
**Display Action:** Show PAYMENT_OK state, auto-reset after 5s

---

## 🎯 KEY BEHAVIORS

### Item Addition (LOCAL CART)
1. Cashier adds items in Main POS
2. Local cart accumulates in MainPOS UI
3. Running Total calculated locally
4. **NOT sent to display** until "Save Token" or "Present to Customer"

---

### Token Lookup
1. Cashier scans/enters token number
2. Token loaded from server (with items + payments)
3. "Present to Customer" button becomes available
4. Display fetches from `/restaurant/tokens/lookup`

---

### Payment Flow
1. Cashier clicks payment method (Cash/GPay/Card/UPI)
2. If UPI → Display shows QR
3. If Cash → Display shows "Mark Paid (Cash)" button OR direct payment record
4. Upon successful payment:
   - Server emits `customer_display_payment_ok`
   - Display shows PAYMENT_OK (5s)
   - Auto-reset → IDLE

---

### Fallback (Socket Down)
If WebSocket is unavailable:
- Display shows "Waiting for connection" message
- No functionality (read-only fallback polling only)
- Re-enables when socket reconnects

---

## ⚙️ IMPLEMENTATION DETAILS

### Main POS Actions
| Action | Button | Effect |
|--------|--------|--------|
| Add items | + / - | Update local cart |
| Save as token | Save as Token | Create token, enable "Present to Customer" |
| Add to existing | Save Items to Token | Append to loaded token |
| Present to customer | **🖥️ Present to Customer** | Open display window, emit show_bill |
| Payment (Cash) | Cash | Record payment → emit payment_ok |
| Payment (UPI/Card/GPay) | UPI/Card/GPay | Record payment → emit payment_ok |

---

### Customer Display Actions
| Button | State | Effect |
|--------|-------|--------|
| Show Payment QR | SHOWING | Transition to PAYMENT_QR |
| Mark Paid (Cash) | SHOWING | Call `/mainpos/token/:qr/payment`, await payment_ok event |
| Already Paid | PAYMENT_QR | Transition to PAYMENT_OK |
| Back | PAYMENT_QR | Transition to SHOWING |
| Reset | SHOWING | Clear display → IDLE |
| (Auto) | PAYMENT_OK | After 5s → IDLE |

---

## 🔐 PAYMENT QR SECURITY

**No Gateway Integration:**
- QR is static (calculated once per bill)
- Encodes: `upi://pay?pa=merchant@upi&pn=ShopName&am=AMOUNT&tr=TOKEN_ID`
- Customer scans → Opens UPI app on phone
- Manual confirmation: Cashier clicks "Payment Received" after customer confirms

**Why Static?**
- No external API calls required
- Offline-capable (QR generated locally)
- No PCI compliance burden
- Works with any UPI provider

---

## 📊 STATE MACHINE (Simplified)

```
IDLE
  ↓ (Cashier: Present to Customer)
SHOWING ← (Cashier: Update items in Main POS)
  ├→ (Cashier: Show QR) → PAYMENT_QR
  │                        ├→ (Already Paid) → PAYMENT_OK
  │                        └→ (Back) → SHOWING
  ├→ (Cashier: Mark Paid) → PAYMENT_OK
  └→ (Timeout/Reset) → IDLE

PAYMENT_OK (5s auto-timer)
  ↓
IDLE (reset for next customer)
```

---

## ✅ TESTING CHECKLIST

- [ ] Open Main POS + Customer Display in separate windows
- [ ] Add items to cart → No display update (expected)
- [ ] Click "Present to Customer" → Display shows bill
- [ ] Modify items in Main POS → Display does NOT auto-update (expected)
- [ ] Click "Save Items to Token" → Token created/updated
- [ ] Click "Show Payment QR" → QR displays correctly
- [ ] Scan QR with phone → Opens UPI app with amount pre-filled
- [ ] Click "Mark Paid (Cash)" in display → Triggers payment endpoint
- [ ] Verify `customer_display_payment_ok` event received
- [ ] Display shows success screen for 5s
- [ ] Display auto-resets to IDLE
- [ ] Next customer: Repeat flow

---

## 🎯 SUMMARY

**Cashier's Action → Display's Response:**

1. **Add items** → Display NOT updated (local only)
2. **Present to Customer** → Display shows bill (SHOWING)
3. **Select payment** → Display shows QR or prompt (PAYMENT_QR or SHOWING)
4. **Payment received** → Display shows success (PAYMENT_OK)
5. **5s passes** → Display resets (IDLE)

**Result:** Seamless dual-screen experience, no external payment gateway, full control.
