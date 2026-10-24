import { useRef } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Printer } from 'lucide-react';

interface BillReceiptProps {
  order: any;
  onClose?: () => void;
}

export function BillReceipt({ order, onClose }: BillReceiptProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=400,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Bill - ${order.orderNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 10px; font-size: 12px; color: #000; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .line { border-bottom: 1px dashed #333; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; padding: 2px 0; }
            .item-row { display: flex; gap: 4px; padding: 3px 0; }
            .item-qty { width: 24px; text-align: right; color: #1a7fc4; font-weight: bold; }
            .item-name { flex: 1; }
            .item-price { width: 60px; text-align: right; }
            .item-amount { width: 60px; text-align: right; font-weight: bold; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; padding: 4px 0; }
            .header-title { font-size: 16px; font-weight: bold; }
            .sub-text { font-size: 10px; color: #666; }
            .thank-you { border-top: 1px dashed #333; border-bottom: 1px dashed #333; padding: 8px 0; margin-top: 12px; text-align: center; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; }
            th { text-align: left; border-bottom: 1px solid #666; padding: 4px 2px; font-size: 11px; color: #1a7fc4; }
            td { padding: 3px 2px; font-size: 11px; }
            th:nth-child(1), td:nth-child(1) { width: 24px; text-align: center; }
            th:nth-child(3), td:nth-child(3) { text-align: right; width: 60px; }
            th:nth-child(4), td:nth-child(4) { text-align: right; width: 60px; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const items = order.flatItems || [];
  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const sgst = Number(order.sgst || 0);
  const cgst = Number(order.cgst || 0);
  const total = Number(order.total || 0);
  const date = new Date(order.createdAt);
  const settings = (globalThis as any).__RESTAURANT_SETTINGS__ || {};
  const sgstRate = Number(settings.sgstRate ?? 2.5);
  const cgstRate = Number(settings.cgstRate ?? 2.5);

  return (
    <div>
      {/* Hidden print content */}
      <div ref={printRef} style={{ display: 'none' }}>
        <div className="center">
          <div className="header-title">{order.restaurant?.name || 'Restaurant'}</div>
          <div className="sub-text">Phone:{order.restaurant?.phone || ''}</div>
          <div className="line" />
          <div className="sub-text">
            Order #{order.orderNumber} &nbsp;&nbsp; {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="line" />
        </div>

        <table>
          <thead>
            <tr><th>Qty</th><th>Item Name</th><th>Price</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={idx}>
                <td>{item.quantity}</td>
                <td>{item.name}</td>
                <td>{formatCurrency(item.price)}</td>
                <td>{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="line" />
        <div className="row"><span>Sub Total:</span><span>{formatCurrency(subtotal)}</span></div>
        <div className="row"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
        <div className="row"><span>SGST ({sgstRate}%):</span><span>{formatCurrency(sgst)}</span></div>
        <div className="row"><span>CGST ({cgstRate}%):</span><span>{formatCurrency(cgst)}</span></div>
        <div className="line" />
        <div className="total-row"><span>Total:</span><span>{formatCurrency(total)}</span></div>
        <div className="thank-you">— Thank you for your visit! —</div>
      </div>

      {/* Visible preview */}
      <div className="bg-white text-gray-900 rounded-2xl p-6 max-w-[340px] mx-auto shadow-2xl" style={{ fontFamily: "'Courier New', monospace" }}>
        <div className="text-center">
          <h2 className="font-bold text-lg">{order.restaurant?.name || 'Restaurant'}</h2>
          <p className="text-[10px] text-gray-500">Phone:{order.restaurant?.phone || ''}</p>
          <div className="border-b border-dashed border-gray-300 my-3" />
          <p className="text-[10px] text-gray-600">
            Order #{order.orderNumber} &nbsp;&nbsp; {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="border-b border-dashed border-gray-300 my-3" />
        </div>

        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-1 text-left w-8 text-blue-600">Qty</th>
              <th className="py-1 text-left text-blue-600">Item Name</th>
              <th className="py-1 text-right w-16 text-blue-600">Price</th>
              <th className="py-1 text-right w-16 text-blue-600">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any, idx: number) => (
              <tr key={idx} className="border-b border-gray-100">
                <td className="py-1.5 text-center font-bold">{item.quantity}</td>
                <td className="py-1.5">{item.name}</td>
                <td className="py-1.5 text-right text-gray-600">{formatCurrency(item.price)}</td>
                <td className="py-1.5 text-right font-semibold">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-b border-dashed border-gray-300 my-3" />

        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between"><span>Sub Total:</span><span className="font-semibold">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(discount)}</span></div>
          <div className="flex justify-between text-orange-600"><span>SGST ({sgstRate}%):</span><span>{formatCurrency(sgst)}</span></div>
          <div className="flex justify-between text-orange-600"><span>CGST ({cgstRate}%):</span><span>{formatCurrency(cgst)}</span></div>
        </div>

        <div className="border-b border-dashed border-gray-300 my-3" />
        <div className="flex justify-between font-bold text-sm">
          <span>Total:</span>
          <span className="text-blue-700">{formatCurrency(total)}</span>
        </div>
        <div className="border-t border-b border-dashed border-gray-300 my-4 py-2 text-center text-[10px] text-gray-500">
          — Thank you for your visit! —
        </div>
      </div>

      <div className="flex justify-center mt-4">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/30"
        >
          <Printer size={16} /> Print Bill
        </button>
      </div>
    </div>
  );
}
