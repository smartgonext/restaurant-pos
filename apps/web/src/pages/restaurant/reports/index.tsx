import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import {
  TrendingUp, BarChart3, PieChart, Percent, DollarSign,
  Truck, XCircle, Trash2, RotateCcw, Heart, CreditCard, FileText,
  ShoppingBag, Package, ClipboardList, Users, LayoutGrid,
  Landmark, ShoppingCart, Tag, TrendingDown
} from 'lucide-react';

const reportGroups = [
  {
    group: '📊 Sales & Revenue',
    reports: [
      { id: 'sales', title: 'Sales Report', description: 'Daily, weekly & monthly revenue with payment method breakdown', icon: TrendingUp, color: 'from-blue-600 to-blue-700', textColor: 'text-blue-400', path: '/admin/reports/sales', stats: 'Revenue, Orders, Taxes' },
      { id: 'orders', title: 'Order Report', description: 'All orders with type, status, table & staff details', icon: ShoppingBag, color: 'from-indigo-600 to-indigo-700', textColor: 'text-indigo-400', path: '/admin/reports/orders', stats: 'Orders, Types, Status' },
      { id: 'payments', title: 'Payment Report', description: 'Payment transactions broken down by method with due tracking', icon: CreditCard, color: 'from-purple-600 to-purple-700', textColor: 'text-purple-400', path: '/admin/reports/payments', stats: 'Cash, UPI, Card, Due' },
      { id: 'discounts', title: 'Discount Report', description: 'Discounts given per order with staff breakdown', icon: Tag, color: 'from-rose-600 to-rose-700', textColor: 'text-rose-400', path: '/admin/reports/discounts', stats: 'Discounts, Staff, %' },
      { id: 'profit-loss', title: 'Profit & Loss', description: 'Complete P&L statement — revenue minus all expenses', icon: TrendingDown, color: 'from-emerald-600 to-emerald-700', textColor: 'text-emerald-400', path: '/admin/reports/profit-loss', stats: 'Profit, Loss, Margin' },
    ]
  },
  {
    group: '🧾 Item & Category',
    reports: [
      { id: 'items', title: 'Item Report', description: 'Top selling menu items with units sold and revenue', icon: BarChart3, color: 'from-violet-600 to-violet-700', textColor: 'text-violet-400', path: '/admin/reports/items', stats: 'Quantities, Revenue' },
      { id: 'categories', title: 'Category Report', description: 'Sales performance analysis by menu categories', icon: PieChart, color: 'from-green-600 to-green-700', textColor: 'text-green-400', path: '/admin/reports/categories', stats: 'Distribution, Trends' },
      { id: 'tax', title: 'Tax Report', description: 'SGST & CGST collected with daily breakdown', icon: Percent, color: 'from-orange-600 to-orange-700', textColor: 'text-orange-400', path: '/admin/reports/tax', stats: 'SGST, CGST, Rate' },
    ]
  },
  {
    group: '🍳 Kitchen & Operations',
    reports: [
      { id: 'kot', title: 'KOT Report', description: 'Kitchen Order Tickets — status, items and kitchen-wise breakdown', icon: ClipboardList, color: 'from-amber-600 to-amber-700', textColor: 'text-amber-400', path: '/admin/reports/kot', stats: 'KOTs, Items, Status' },
      { id: 'removed-kot', title: 'Removed KOT Items', description: 'Items removed from Kitchen Order Tickets with cost impact', icon: Trash2, color: 'from-pink-600 to-pink-700', textColor: 'text-pink-400', path: '/admin/reports/removed-kot', stats: 'Removals, Lost Revenue' },
      { id: 'cancelled-orders', title: 'Cancelled Orders', description: 'All cancelled orders with lost revenue calculation', icon: XCircle, color: 'from-red-600 to-red-700', textColor: 'text-red-400', path: '/admin/reports/cancelled-orders', stats: 'Cancellations, Lost Revenue' },
    ]
  },
  {
    group: '👥 Staff & Customers',
    reports: [
      { id: 'staff-performance', title: 'Staff Performance', description: 'POS billing, table orders & revenue per logged-in staff member', icon: Users, color: 'from-sky-600 to-sky-700', textColor: 'text-sky-400', path: '/admin/reports/staff-performance', stats: 'Billing, Revenue, Collections' },
      { id: 'customers', title: 'Customer Report', description: 'Customer visits, spending patterns & loyalty points', icon: Heart, color: 'from-fuchsia-600 to-fuchsia-700', textColor: 'text-fuchsia-400', path: '/admin/reports/customers', stats: 'Visits, Revenue, Loyalty' },
      { id: 'tables', title: 'Table Report', description: 'Revenue, order count and average per table', icon: LayoutGrid, color: 'from-teal-600 to-teal-700', textColor: 'text-teal-400', path: '/admin/reports/tables', stats: 'Revenue, Orders, AOV' },
    ]
  },
  {
    group: '💰 Finance & Register',
    reports: [
      { id: 'cash-register', title: 'Cash Register Report', description: 'Session-wise opening, closing balances & discrepancies', icon: Landmark, color: 'from-lime-600 to-lime-700', textColor: 'text-lime-400', path: '/admin/reports/cash-register', stats: 'Sessions, Balances, Discrepancy' },
      { id: 'expenses', title: 'Expense Report', description: 'Operating expenses by category with payment status', icon: DollarSign, color: 'from-yellow-600 to-yellow-700', textColor: 'text-yellow-400', path: '/admin/reports/expenses', stats: 'Paid, Pending, Categories' },
      { id: 'refunds', title: 'Refund Report', description: 'All refunds and inventory adjustments processed', icon: RotateCcw, color: 'from-cyan-600 to-cyan-700', textColor: 'text-cyan-400', path: '/admin/reports/refunds', stats: 'Refunds, Adjustments' },
    ]
  },
  {
    group: '📦 Inventory & Supply',
    reports: [
      { id: 'stock', title: 'Inventory / Stock Report', description: 'Current stock levels, low stock alerts & total valuation', icon: Package, color: 'from-slate-600 to-slate-700', textColor: 'text-slate-400', path: '/admin/reports/stock', stats: 'Stock, Low Alerts, Value' },
      { id: 'purchases', title: 'Purchase Report', description: 'Purchase orders from suppliers with status tracking', icon: ShoppingCart, color: 'from-stone-600 to-stone-700', textColor: 'text-stone-400', path: '/admin/reports/purchases', stats: 'POs, Suppliers, Amount' },
      { id: 'production', title: 'Production Report', description: 'Production runs, yields, wastage & transit inventory', icon: FileText, color: 'from-neutral-600 to-neutral-700', textColor: 'text-neutral-400', path: '/admin/reports/production', stats: 'Yields, Cost, Waste' },
    ]
  },
  {
    group: '🚴 Delivery & Loyalty',
    reports: [
      { id: 'delivery-app', title: 'Delivery App Report', description: 'Orders and revenue from Zomato, Swiggy & other platforms', icon: Truck, color: 'from-cyan-600 to-cyan-700', textColor: 'text-cyan-400', path: '/admin/reports/delivery-app', stats: 'Orders, Revenue, Apps' },
      { id: 'loyalty', title: 'Loyalty Report', description: 'Points earned and redeemed by customers', icon: Heart, color: 'from-pink-500 to-rose-600', textColor: 'text-pink-400', path: '/admin/reports/loyalty', stats: 'Points, Members, Redemption' },
      { id: 'due-payments-received', title: 'Due Payments Received', description: 'Collection of outstanding dues and pending amounts', icon: CreditCard, color: 'from-teal-600 to-teal-700', textColor: 'text-teal-400', path: '/admin/reports/due-payments-received', stats: 'Due, Collected, Pending' },
    ]
  },
];

const totalReports = reportGroups.reduce((s, g) => s + g.reports.length, 0);

export default function ReportsIndex() {
  return (
    <div className="space-y-6 animate-in p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Reports</h1>
          <p className="text-sm text-text-muted mt-2">Complete business analytics — all reports in one place</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span>{totalReports} Reports Available</span>
        </div>
      </div>

      {/* Report Groups */}
      {reportGroups.map((group) => (
        <div key={group.group}>
          <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">{group.group}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {group.reports.map((report) => {
              const IconComponent = report.icon;
              return (
                <Link key={report.id} to={report.path} className="group">
                  <Card className="h-full cursor-pointer hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.02] transition-all duration-300 p-5 border-border/50">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${report.color} flex items-center justify-center shadow-lg shadow-black/20`}>
                          <IconComponent className="w-5 h-5 text-white" />
                        </div>
                        <div className={`flex items-center gap-1.5 ${report.textColor} text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity`}>
                          <span>View</span>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary group-hover:text-blue-400 transition-colors">{report.title}</h3>
                        <p className="text-[11px] text-text-muted mt-1.5 line-clamp-2 leading-relaxed">{report.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-auto">
                        {report.stats.split(', ').map((stat, i) => (
                          <span key={i} className="text-[9px] font-medium text-text-muted bg-bg-tertiary/50 px-2 py-0.5 rounded-full border border-border/30">{stat}</span>
                        ))}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer Info */}
      <div className="bg-bg-secondary/50 border border-border/50 rounded-xl p-5">
        <div className="flex flex-wrap gap-3 items-center text-xs text-text-muted">
          {[{ color: 'bg-blue-400', label: 'PDF & Excel exports' }, { color: 'bg-purple-400', label: 'Interactive charts' }, { color: 'bg-green-400', label: 'Date range filters' }, { color: 'bg-orange-400', label: 'Real-time data' }].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <div className="w-px h-4 bg-border/50" />}
              <span className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-3">Each report includes interactive charts, date range filters, and Excel/PDF export options.</p>
      </div>
    </div>
  );
}