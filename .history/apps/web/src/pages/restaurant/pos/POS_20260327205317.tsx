// ============================================================
// IMPROVED POS — Drop-in replacement for the existing POS.tsx
// All bugs fixed + UX improvements as listed in the brief
// ============================================================
// NOTE: This is a self-contained demo/preview artifact.
// In production, replace mock data with real API calls and
// import your real cartStore / api / Modal / OrderDetailPanel.
// ============================================================

import { useEffect, useState, useMemo, useRef } from "react";

// ─── tiny helpers ────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

const cn = (...c) => c.filter(Boolean).join(" ");

// ─── mock data (swap with real API) ──────────────────────────
const MOCK_CATEGORIES = [
  { id: "all", name: "All Items" },
  { id: 1, name: "Starters" },
  { id: 2, name: "Mains" },
  { id: 3, name: "Breads" },
  { id: 4, name: "Desserts" },
  { id: 5, name: "Drinks" },
];

const FOOD_EMOJIS = { 1: "🍢", 2: "🍛", 3: "🫓", 4: "🍮", 5: "🥤" };

const MOCK_ITEMS = [
  { id: 1, name: "Paneer Tikka", price: 280, categoryId: 1, isVeg: true, popular: true },
  { id: 2, name: "Chicken 65", price: 320, categoryId: 1, isVeg: false, popular: true },
  { id: 3, name: "Veg Manchurian", price: 220, categoryId: 1, isVeg: true, popular: false },
  { id: 4, name: "Butter Chicken", price: 380, categoryId: 2, isVeg: false, popular: true },
  { id: 5, name: "Dal Makhani", price: 260, categoryId: 2, isVeg: true, popular: false },
  { id: 6, name: "Paneer Butter Masala", price: 300, categoryId: 2, isVeg: true, popular: false },
  { id: 7, name: "Biryani Chicken", price: 420, categoryId: 2, isVeg: false, popular: true },
  { id: 8, name: "Butter Naan", price: 60, categoryId: 3, isVeg: true, popular: false },
  { id: 9, name: "Garlic Roti", price: 50, categoryId: 3, isVeg: true, popular: false },
  { id: 10, name: "Paratha", price: 70, categoryId: 3, isVeg: true, popular: false },
  { id: 11, name: "Gulab Jamun", price: 120, categoryId: 4, isVeg: true, popular: false },
  { id: 12, name: "Rasmalai", price: 140, categoryId: 4, isVeg: true, popular: false },
  { id: 13, name: "Mango Lassi", price: 120, categoryId: 5, isVeg: true, popular: false },
  { id: 14, name: "Masala Chai", price: 60, categoryId: 5, isVeg: true, popular: false },
  { id: 15, name: "Fresh Lime Soda", price: 80, categoryId: 5, isVeg: true, popular: false },
];

const MOCK_TABLES = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  name: `${i + 1}`,
  status: [3, 7, 11].includes(i + 1) ? "running" : "available",
}));

const MOCK_STAFF = [
  { id: 1, name: "Ravi Kumar" },
  { id: 2, name: "Priya Devi" },
  { id: 3, name: "Arjun Singh" },
];

const TAX_RATE = 0.05; // 5% total (2.5 SGST + 2.5 CGST)

// ─── cart hook ───────────────────────────────────────────────
function useCart() {
  const [items, setItems] = useState([]);
  const [orderType, setOrderType] = useState("dine_in");
  const [tableId, setTableId] = useState(null);

  const addItem = (menuItem) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.menuItemId === menuItem.id);
      if (exists)
        return prev.map((i) =>
          i.menuItemId === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      return [
        ...prev,
        { id: `${menuItem.id}-${Date.now()}`, menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1, note: "" },
      ];
    });
  };

  const updateQty = (menuItemId, delta) => {
    setItems((prev) =>
      prev
        .map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeItem = (menuItemId) => setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));

  const updateNote = (menuItemId, note) =>
    setItems((prev) => prev.map((i) => (i.menuItemId === menuItemId ? { ...i, note } : i)));

  const clearCart = () => { setItems([]); setTableId(null); };

  const getQty = (menuItemId) => items.find((i) => i.menuItemId === menuItemId)?.quantity || 0;

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return { items, orderType, setOrderType, tableId, setTableId, addItem, updateQty, removeItem, updateNote, clearCart, getQty, subtotal };
}

// ─── small components ────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#16181f] border border-gray-700/50 rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <span className="font-bold text-sm tracking-widest uppercase text-gray-300">{title}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={cn(
          "px-4 py-2.5 rounded-lg text-xs font-bold shadow-lg transition-all animate-slide-in",
          t.type === "success" ? "bg-emerald-600 text-white" : t.type === "error" ? "bg-red-600 text-white" : "bg-gray-700 text-white"
        )}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const toast = (message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  };
  return { toasts, toast };
}

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function POS() {
  const cart = useCart();
  const { toasts, toast } = useToast();

  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const [pax, setPax] = useState(1);
  const [waiterId, setWaiterId] = useState("");
  const [discount, setDiscount] = useState(0); // % discount
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderCounter] = useState(Math.floor(Math.random() * 900) + 100);

  // modals
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState(null);

  const filteredItems = useMemo(() => {
    return MOCK_ITEMS.filter((item) => {
      const matchCat = activeCategory === "all" || item.categoryId === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchVeg = !vegOnly || item.isVeg;
      return matchCat && matchSearch && matchVeg;
    });
  }, [activeCategory, search, vegOnly]);

  // ── financials (discount before tax — GST compliant) ────────
  const subtotal = cart.subtotal;
  const discountAmt = subtotal * (discount / 100);
  const taxableAmt = subtotal - discountAmt;
  const sgst = taxableAmt * 0.025;
  const cgst = taxableAmt * 0.025;
  const total = taxableAmt + sgst + cgst;

  const handleAddToCart = (item) => {
    cart.addItem(item);
    toast(`Added ${item.name}`, "success");
  };

  const simulateOrder = async (label) => {
    if (cart.items.length === 0) { toast("Cart is empty", "error"); return; }
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 900));
    const orderId = `ORD-${Date.now().toString().slice(-6)}`;
    setLastOrder({ id: orderId, label, total, items: cart.items.length });
    cart.clearCart();
    setDiscount(0);
    setIsSubmitting(false);
    setShowSuccessModal(true);
  };

  const selectedWaiter = MOCK_STAFF.find((s) => s.id === waiterId);
  const orderTypeLabel = { dine_in: "Dine In", delivery: "Delivery", pickup: "Pickup" }[cart.orderType];
  const assignedTable = MOCK_TABLES.find((t) => t.id === cart.tableId);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0d12; color: #e2e8f0; font-family: 'Syne', sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 99px; }
        .mono { font-family: 'DM Mono', monospace; }
        @keyframes slide-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in { animation: slide-in 0.2s ease; }
        @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
        .pop { animation: pop 0.18s ease; }
        .cat-pill { transition: background 0.15s, color 0.15s; white-space: nowrap; }
        .cat-pill.active { background: #7c5cfc; color: #fff; }
        .menu-card:hover .add-overlay { opacity: 1; }
        .add-overlay { opacity: 0; transition: opacity 0.15s; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .cart-row:last-child { border-bottom: none !important; }
      `}</style>

      <Toast toasts={toasts} />

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0b0d12", overflow: "hidden" }}>

        {/* ── Top bar ── */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1e2130", display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.03em", color: "#fff" }}>
            🍽 POS <span style={{ color: "#7c5cfc" }}>#{orderCounter}</span>
          </div>

          {/* search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 380 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#4a5068", fontSize: 14 }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              style={{ width: "100%", background: "#13151e", border: "1px solid #1e2130", borderRadius: 10, padding: "9px 12px 9px 34px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
            />
          </div>

          {/* veg filter */}
          <button
            onClick={() => setVegOnly(!vegOnly)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${vegOnly ? "#22c55e" : "#1e2130"}`, background: vegOnly ? "#22c55e18" : "#13151e", color: vegOnly ? "#22c55e" : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e", display: "inline-block", border: "1.5px solid #22c55e" }} />
            Veg Only
          </button>

          {/* order type badge */}
          <button
            onClick={() => setShowOrderTypeModal(true)}
            style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #1e2130", background: "#13151e", fontSize: 12, fontWeight: 700, color: "#a78bfa", cursor: "pointer" }}
          >
            {orderTypeLabel} {assignedTable ? `· T${assignedTable.name}` : ""}
            {" "}
            <span style={{ color: "#6b7280" }}>▾</span>
          </button>

          {/* reset */}
          <button
            onClick={() => { setSearch(""); setActiveCategory("all"); setVegOnly(false); }}
            style={{ padding: "8px 14px", borderRadius: 10, background: "#1e2130", fontSize: 12, fontWeight: 700, color: "#6b7280", cursor: "pointer", border: "none" }}
          >
            ↺ Reset
          </button>
        </div>

        {/* ── Category pills ── */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #1e2130", display: "flex", gap: 8, overflowX: "auto", flexShrink: 0 }}>
          {MOCK_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`cat-pill${activeCategory === cat.id ? " active" : ""}`}
              style={{ padding: "6px 18px", borderRadius: 99, border: "1.5px solid", borderColor: activeCategory === cat.id ? "#7c5cfc" : "#1e2130", background: activeCategory === cat.id ? "#7c5cfc" : "#13151e", color: activeCategory === cat.id ? "#fff" : "#6b7280", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              {cat.id !== "all" && (FOOD_EMOJIS[cat.id] + " ")}
              {cat.name}
            </button>
          ))}
        </div>

        {/* ── Main split ── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 0 }}>

          {/* ── MENU GRID ── */}
          <div style={{ flex: "1 1 0", overflow: "auto", padding: "16px 20px" }}>
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#4a5068", fontSize: 13, fontWeight: 700 }}>No items found</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
                {filteredItems.map((item) => {
                  const qty = cart.getQty(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleAddToCart(item)}
                      className="menu-card"
                      style={{ position: "relative", background: "#13151e", border: `1.5px solid ${qty > 0 ? "#7c5cfc60" : "#1e2130"}`, borderRadius: 14, overflow: "hidden", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, transform 0.1s", transform: "scale(1)" }}
                    >
                      {/* emoji tile */}
                      <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, background: "#0f1118" }}>
                        {FOOD_EMOJIS[item.categoryId] || "🍽"}
                        {item.popular && (
                          <span style={{ position: "absolute", top: 8, left: 8, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 99, letterSpacing: "0.05em" }}>
                            🔥 HOT
                          </span>
                        )}
                      </div>

                      {/* veg/non-veg dot */}
                      <span style={{ position: "absolute", top: 8, right: 8, width: 12, height: 12, borderRadius: 3, border: `1.5px solid ${item.isVeg ? "#22c55e" : "#ef4444"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.isVeg ? "#22c55e" : "#ef4444" }} />
                      </span>

                      {/* qty badge */}
                      {qty > 0 && (
                        <span style={{ position: "absolute", bottom: 48, right: 8, background: "#7c5cfc", color: "#fff", fontSize: 10, fontWeight: 800, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px #7c5cfc60" }}>
                          {qty}
                        </span>
                      )}

                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: "#a78bfa", marginTop: 2 }}>{fmt(item.price)}</div>
                      </div>

                      {/* hover overlay */}
                      <div className="add-overlay" style={{ position: "absolute", inset: 0, background: "#7c5cfc20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, pointerEvents: "none" }}>
                        ＋
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── CART / ACTION PANEL ── */}
          <div style={{ width: 380, flexShrink: 0, background: "#10121a", borderLeft: "1px solid #1e2130", display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Panel header */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e2130", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Order Details
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setShowTableModal(true)} style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: "#1e2130", border: "1px solid #2a2d3a", color: "#9ca3af", cursor: "pointer" }}>
                    {assignedTable ? `Table ${assignedTable.name}` : "Assign Table"}
                  </button>
                  <button onClick={() => setShowCustomerModal(true)} style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: "#1e2130", border: "1px solid #2a2d3a", color: "#a78bfa", cursor: "pointer" }}>
                    + Customer
                  </button>
                </div>
              </div>

              {/* PAX + Waiter row */}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: "0 0 auto" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Pax</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#1a1c26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "4px 8px" }}>
                    <button onClick={() => setPax(Math.max(1, pax - 1))} style={{ width: 20, height: 20, borderRadius: 6, background: "#2a2d3a", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, width: 20, textAlign: "center", color: "#e2e8f0" }}>{pax}</span>
                    <button onClick={() => setPax(pax + 1)} style={{ width: 20, height: 20, borderRadius: 6, background: "#7c5cfc", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Waiter</div>
                  <select
                    value={waiterId}
                    onChange={(e) => setWaiterId(e.target.value ? parseInt(e.target.value) : "")}
                    style={{ width: "100%", background: "#1a1c26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "6px 10px", color: waiterId ? "#e2e8f0" : "#6b7280", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer" }}
                  >
                    <option value="">— No Waiter —</option>
                    {MOCK_STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Cart items */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {cart.items.length === 0 ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#2a2d3a", gap: 10 }}>
                  <span style={{ fontSize: 48 }}>🛒</span>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Cart is empty</div>
                </div>
              ) : (
                cart.items.map((item) => (
                  <div key={item.id} className="cart-row" style={{ padding: "10px 0", borderBottom: "1px solid #1a1c26" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#1a1c26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                        {FOOD_EMOJIS[MOCK_ITEMS.find(m => m.id === item.menuItemId)?.categoryId] || "🍽"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#e2e8f0", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <button onClick={() => cart.updateQty(item.menuItemId, -1)} style={{ width: 22, height: 22, borderRadius: 7, background: "#1e2130", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span className="mono" style={{ fontSize: 13, fontWeight: 600, width: 18, textAlign: "center" }}>{item.quantity}</span>
                          <button onClick={() => cart.updateQty(item.menuItemId, 1)} style={{ width: 22, height: 22, borderRadius: 7, background: "#7c5cfc", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                          <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, marginLeft: 2 }}>× {fmt(item.price)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>{fmt(item.price * item.quantity)}</div>
                        <button onClick={() => cart.removeItem(item.menuItemId)} style={{ marginTop: 4, fontSize: 16, color: "#ef444450", cursor: "pointer", background: "none", border: "none", padding: 0, lineHeight: 1, transition: "color 0.15s" }} onMouseEnter={(e) => e.target.style.color = "#ef4444"} onMouseLeave={(e) => e.target.style.color = "#ef444450"}>
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* Note field */}
                    {expandedNoteId === item.menuItemId ? (
                      <input
                        autoFocus
                        value={item.note}
                        onChange={(e) => cart.updateNote(item.menuItemId, e.target.value)}
                        onBlur={() => setExpandedNoteId(null)}
                        placeholder="Add a note (e.g. no onion, extra spicy)…"
                        style={{ marginTop: 6, width: "100%", background: "#1a1c26", border: "1px solid #2a2d3a", borderRadius: 8, padding: "5px 10px", color: "#e2e8f0", fontSize: 11, outline: "none" }}
                      />
                    ) : (
                      <button onClick={() => setExpandedNoteId(item.menuItemId)} style={{ marginTop: 4, fontSize: 10, color: item.note ? "#a78bfa" : "#4a5068", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: 600 }}>
                        {item.note ? `📝 ${item.note}` : "+ Add note"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Summary */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid #1e2130", background: "#0b0d12", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                <span>{cart.items.length} item(s)</span>
                <span className="mono">{fmt(subtotal)}</span>
              </div>

              {/* Discount */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280" }}>Discount</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#13151e", border: "1px solid #1e2130", borderRadius: 8, padding: "3px 8px", flex: 1 }}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discount}
                    onChange={(e) => setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))}
                    style={{ width: "100%", background: "transparent", border: "none", color: discount > 0 ? "#f59e0b" : "#e2e8f0", fontSize: 12, fontWeight: 700, outline: "none", fontFamily: "DM Mono, monospace" }}
                  />
                  <span style={{ fontSize: 11, color: "#6b7280" }}>%</span>
                </div>
                {discountAmt > 0 && <span className="mono" style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>−{fmt(discountAmt)}</span>}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 2 }}>
                <span>SGST (2.5%)</span><span className="mono">{fmt(sgst)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
                <span>CGST (2.5%)</span><span className="mono">{fmt(cgst)}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: "1px solid #1e2130", paddingTop: 8 }}>
                <span>Total</span>
                <span className="mono" style={{ color: "#a78bfa" }}>{fmt(total)}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ padding: "10px 12px 14px", background: "#0b0d12", borderTop: "1px solid #1e2130", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Primary: KOT */}
              <button
                onClick={() => simulateOrder("KOT")}
                disabled={isSubmitting || cart.items.length === 0}
                style={{ width: "100%", padding: "13px", borderRadius: 12, background: cart.items.length === 0 ? "#1e2130" : "linear-gradient(135deg, #7c5cfc, #5b3de0)", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: cart.items.length === 0 ? "not-allowed" : "pointer", opacity: cart.items.length === 0 ? 0.4 : 1 }}
              >
                🧾 {isSubmitting ? "Sending…" : "Send KOT to Kitchen"}
              </button>

              {/* Secondary row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[
                  { label: "Bill", color: "#9b59b6", action: () => simulateOrder("Bill") },
                  { label: "Bill & Pay", color: "#22c55e", action: () => simulateOrder("Bill & Pay") },
                  { label: "Bill & Print", color: "#3b82f6", action: () => simulateOrder("Bill & Print") },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={btn.action}
                    disabled={isSubmitting || cart.items.length === 0}
                    style={{ padding: "9px 4px", borderRadius: 10, background: cart.items.length === 0 ? "#1e2130" : btn.color, border: "none", color: "#fff", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", cursor: cart.items.length === 0 ? "not-allowed" : "pointer", opacity: cart.items.length === 0 ? 0.3 : 1 }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Save draft */}
              <button
                onClick={() => simulateOrder("Draft")}
                disabled={isSubmitting || cart.items.length === 0}
                style={{ padding: "8px", borderRadius: 10, background: "#1e2130", border: "1px dashed #2a2d3a", color: "#6b7280", fontSize: 10, fontWeight: 700, cursor: cart.items.length === 0 ? "not-allowed" : "pointer", opacity: cart.items.length === 0 ? 0.3 : 1 }}
              >
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Order Type Modal ── */}
      <Modal open={showOrderTypeModal} onClose={() => setShowOrderTypeModal(false)} title="Select Order Type">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: 20 }}>
          {[
            { id: "dine_in", label: "Dine In", icon: "🍽" },
            { id: "delivery", label: "Delivery", icon: "🛵" },
            { id: "pickup", label: "Pickup", icon: "📦" },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => { cart.setOrderType(mode.id); setShowOrderTypeModal(false); }}
              style={{ padding: "20px 12px", borderRadius: 14, border: `2px solid ${cart.orderType === mode.id ? "#7c5cfc" : "#1e2130"}`, background: cart.orderType === mode.id ? "#7c5cfc18" : "#13151e", color: cart.orderType === mode.id ? "#fff" : "#6b7280", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", transition: "all 0.15s" }}
            >
              <span style={{ fontSize: 28 }}>{mode.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>{mode.label}</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Table Modal ── */}
      <Modal open={showTableModal} onClose={() => setShowTableModal(false)} title="Assign Table">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, padding: 20, maxHeight: "60vh", overflowY: "auto" }}>
          {MOCK_TABLES.map((t) => (
            <button
              key={t.id}
              disabled={t.status === "running"}
              onClick={() => { cart.setTableId(t.id); setShowTableModal(false); }}
              style={{ aspectRatio: "1", borderRadius: 12, border: `2px solid ${cart.tableId === t.id ? "#7c5cfc" : t.status === "running" ? "#ef444430" : "#1e2130"}`, background: cart.tableId === t.id ? "#7c5cfc18" : t.status === "running" ? "#ef444410" : "#13151e", color: t.status === "running" ? "#ef444460" : "#e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: t.status === "running" ? "not-allowed" : "pointer" }}
            >
              <span style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>TBL</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{t.name}</span>
              {t.status === "running" && <span style={{ fontSize: 7, color: "#ef4444", fontWeight: 700 }}>●</span>}
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Customer Modal ── */}
      <Modal open={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Customer Details">
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Name", value: customerName, setter: setCustomerName, type: "text", placeholder: "Customer name" },
            { label: "Phone", value: customerPhone, setter: setCustomerPhone, type: "tel", placeholder: "+91 98765 43210" },
          ].map((field) => (
            <div key={field.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{field.label}</div>
              <input
                type={field.type}
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                placeholder={field.placeholder}
                style={{ width: "100%", background: "#13151e", border: "1px solid #2a2d3a", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              onClick={() => { if (customerName || customerPhone) { toast("Customer saved", "success"); setShowCustomerModal(false); } else { toast("Enter at least one field", "error"); } }}
              style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#7c5cfc", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              Save
            </button>
            <button
              onClick={() => setShowCustomerModal(false)}
              style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#1e2130", border: "none", color: "#9ca3af", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Success Modal ── */}
      <Modal open={showSuccessModal} onClose={() => setShowSuccessModal(false)} title="Order Confirmed">
        {lastOrder && (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e", marginBottom: 4 }}>{lastOrder.label} Sent!</div>
            <div className="mono" style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Order ID: {lastOrder.id}</div>
            <div className="mono" style={{ fontSize: 18, fontWeight: 800, color: "#a78bfa", marginBottom: 20 }}>{fmt(lastOrder.total)}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { window.print(); }} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#1e2130", border: "none", color: "#9ca3af", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🖨 Print Bill
              </button>
              <button onClick={() => setShowSuccessModal(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "#7c5cfc", border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                + New Order
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}