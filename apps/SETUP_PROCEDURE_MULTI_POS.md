# Complete Step-by-Step Setup Procedure & Architecture: Multi-Computer POS (C1, C2, C3, C4)

This document is the physical operating handbook for running the **Restaurant SaaS POS across 4 computers** on a local offline network without internet.

---

## 1. Quick Summary of Computer Roles

| Computer | Hardware Role | What Staff Sees | IP Configuration |
| :--- | :--- | :--- | :--- |
| **C1** | Counter 1 (Main Billing) | Desktop Icon: `POS Counter 1 (Main)` | Primary Server (Auto-syncs live to C2) |
| **C2** | Counter 2 (Backup Mirror) | Desktop Icon: `POS Counter 2 (Mirror)` | Hot Standby Mirror (Auto-syncs from C1 every 10s) |
| **C3** | Token Counter / Kiosk | Desktop Icon: `Token Counter` | **Zero-IP**. Auto-discovers whichever server is ON |
| **C4** | Cashier / Quick Billing | Desktop Icon: `Billing Counter` | **Zero-IP**. Auto-discovers whichever server is ON |

---

## 2. Step-by-Step Physical Setup (Do This Right Now)

### Step 1: Build the Setup File (On Development Computer)
In the project directory `d:\restorent\apps`:
```powershell
npm run build:exe
```
When finished, go to `d:\restorent\apps\release\`:
Copy **`Restaurant SaaS Setup 1.0.0.exe`** onto a **USB Pendrive**.

---

### Step 2: Install and Configure Computer 1 (C1 — Main Counter)
1. Plug the USB Pendrive into **C1**.
2. Run `Restaurant SaaS Setup 1.0.0.exe` and complete installation.
3. Go to the Windows Desktop, find the **Restaurant SaaS POS** shortcut icon.
4. **Right-click the icon ➔ Properties**:
   - In the **Target** box, append ` --node-id=C1 --role=LEADER` at the very end.
   - Example Target:
     ```
     "C:\Program Files\Restaurant SaaS POS\Restaurant SaaS POS.exe" --node-id=C1 --role=LEADER
     ```
   - In the **General** tab, rename the shortcut to:
     **`POS Counter 1 (Main)`**
5. Click **OK**.
6. Double-click the shortcut to open. C1 is now your active Primary Server.

---

### Step 3: Install and Configure Computer 2 (C2 — Counter 2 / Backup Mirror)
1. Plug the USB Pendrive into **C2**.
2. Run `Restaurant SaaS Setup 1.0.0.exe` and complete installation.
3. Go to the Windows Desktop, find the **Restaurant SaaS POS** shortcut icon.
4. **Right-click the icon ➔ Properties**:
   - In the **Target** box, append ` --node-id=C2 --role=STANDBY` at the very end.
   - Example Target:
     ```
     "C:\Program Files\Restaurant SaaS POS\Restaurant SaaS POS.exe" --node-id=C2 --role=STANDBY
     ```
   - In the **General** tab, rename the shortcut to:
     **`POS Counter 2 (Mirror)`**
5. Click **OK**.
6. Double-click the shortcut to open.
   - Look at the top bar header: you will see a badge **`🟡 Standby Mirror (C2)`**.
   - C2 is now active and automatically copying every order and token from C1 every 10 seconds!

---

### Step 4: Install and Configure Computer 3 (C3 — Token Counter)
1. Plug the USB Pendrive into **C3**.
2. Run `Restaurant SaaS Setup 1.0.0.exe` and complete installation.
3. Go to the Windows Desktop, find the **Restaurant SaaS POS** shortcut icon.
4. **Right-click the icon ➔ Properties**:
   - In the **Target** box, append ` --mode=terminal --terminal=token` at the very end.
   - Example Target:
     ```
     "C:\Program Files\Restaurant SaaS POS\Restaurant SaaS POS.exe" --mode=terminal --terminal=token
     ```
   - In the **General** tab, rename the shortcut to:
     **`Token Counter`**
5. Click **OK**.
6. Double-click to open. It will find C1 or C2 across the LAN and open directly into Token Management. **Staff never types any IP address!**

---

### Step 5: Install and Configure Computer 4 (C4 — Billing Counter)
1. Plug the USB Pendrive into **C4**.
2. Run `Restaurant SaaS Setup 1.0.0.exe` and complete installation.
3. Go to the Windows Desktop, find the **Restaurant SaaS POS** shortcut icon.
4. **Right-click the icon ➔ Properties**:
   - In the **Target** box, append ` --mode=terminal --terminal=billing` at the very end.
   - Example Target:
     ```
     "C:\Program Files\Restaurant SaaS POS\Restaurant SaaS POS.exe" --mode=terminal --terminal=billing
     ```
   - In the **General** tab, rename the shortcut to:
     **`Billing Counter`**
5. Click **OK**.
6. Double-click to open. It will find C1 or C2 across the LAN and open directly into Billing POS. **Staff never types any IP address!**

---

## 3. How Synchronization Works (Zero Data Loss)

### A. Continuous Background Sync (Every 10 Seconds)
- When both C1 and C2 are powered on, C2 checks with C1 every 10 seconds:
  `GET /api/lan-sync/catchup?since=<timestamp>`
- All new bills, tokens, and payments are automatically upserted into C2's local SQLite database.
- Staff does not need to click anything.

### B. Morning / Late Catch-Up Sync
- If C2 is turned on late at 11:00 AM, it detects C1 on the LAN, downloads all morning sales in **2 to 3 seconds**, and joins regular billing.

### C. Manual 1-Click Sync
- On C2, click the **`Standby Mirror (C2)`** badge in the Top Bar.
- Click **`[ 🔄 Sync Latest Data From Master Now ]`** to trigger an instant sync at any time.

---

## 4. Emergency Failover Protocol

### What If C1 Fails or Goes to Service for 5 Days?
1. If C1 is turned off or taken to service, C2 notices no heartbeats after **7 seconds** and automatically promotes itself to **Main Server**.
2. Or the manager on C2 can click **`[ 👑 Promote This Machine to Main Server ]`** in the Top Bar badge.
3. C3 and C4 automatically detect that C2 is the active server and reconnect seamlessly.
4. The entire restaurant continues working for all 5 days on C2.

### What Happens When C1 Returns from Service After 5 Days?
1. When C1 comes back, plug it into the LAN and turn it on.
2. C1 detects C2 has 5 days of newer sales.
3. C1 locks its old database and downloads the full updated database from C2 in **5 seconds**.
4. **Zero new data is overwritten or lost!**
