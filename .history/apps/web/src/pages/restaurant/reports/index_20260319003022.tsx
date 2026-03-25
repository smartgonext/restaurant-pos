import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { TrendingUp, Package, Layers, DollarSign, Receipt, BarChart3 } from 'lucide-react';

export default function ReportsIndex() {
  const reports = [
    {
      id: 'sales',
      title: 'Sales Report',
      description: 'Track your restaurant earnings with detailed payment breakdown and tax information',
      icon: TrendingUp,
      color: 'from-blue-500 to-blue-600',
      textColor: 'text-blue-400',
      path: '/admin/reports/sales'
    },
    {
      id: 'items',
      title: 'Item Report',
      description: 'View detailed sales performance of individual menu items and categories',
      icon: Package,
      color: 'from-purple-500 to-purple-600',
      textColor: 'text-purple-400',
      path: '/admin/reports/items'
    },
    {
      id: 'categories',
      title: 'Category Report',
      description: 'Analyze sales performance by menu categories and understand customer preferences',
      icon: Layers,
      color: 'from-green-500 to-green-600',
      textColor: 'text-green-400',
      path: '/admin/reports/categories'
    },
    {
      id: 'tax',
      title: 'Tax Report',
      description: 'Monitor tax collection broken down by SGST and CGST with daily summaries',
      icon: DollarSign,
      color: 'from-orange-500 to-orange-600',
      textColor: 'text-orange-400',
      path: '/admin/reports/tax'
    },
    {
      id: 'expenses',
      title: 'Expense Report',
      description: 'Track operating expenses and payment status across different categories',
      icon: Receipt,
      color: 'from-red-500 to-red-600',
      textColor: 'text-red-400',
      path: '/admin/reports/expenses'
    },
  ];

  return (
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Reports</h1>
        <p className="text-sm text-text-muted mt-2">Access all your business analytics and reports in one place</p>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => {
          const IconComponent = report.icon;
          return (
            <Link key={report.id} to={report.path}>
              <Card className="h-full cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-300 p-6 border-border/50">
                <div className="space-y-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${report.color} flex items-center justify-center`}>
                    <IconComponent className="w-6 h-6 text-white" />
                  </div>

                  {/* Content */}
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">{report.title}</h3>
                    <p className="text-sm text-text-muted mt-2 line-clamp-3">
                      {report.description}
                    </p>
                  </div>

                  {/* Arrow Indicator */}
                  <div className={`flex items-center gap-2 ${report.textColor} text-sm font-medium`}>
                    <span>View Report</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick Stats Overview */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-text-primary mb-4">Quick Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <div className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">What You Can Do</div>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                <span>Track daily sales</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                <span>Monitor item performance</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                <span>Analyze categories</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <div className="text-[11px] font-medium text-green-400 uppercase tracking-wider">Financial Data</div>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                <span>Revenue breakdown</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                <span>Tax collection</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                <span>Expense tracking</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <div className="text-[11px] font-medium text-purple-400 uppercase tracking-wider">Export Options</div>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                <span>CSV export</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                <span>PDF reports</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400"></div>
                <span>Custom date ranges</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
            <div className="text-[11px] font-medium text-orange-400 uppercase tracking-wider">Data Features</div>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                <span>Real-time data</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                <span>Interactive charts</span>
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                <span>Detailed tables</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Help Text */}
      <Card className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <h3 className="font-semibold text-text-primary text-sm">Need Help?</h3>
        <p className="text-sm text-text-muted mt-2">
          Each report includes interactive charts, filters, and export options. Click on any report card above to get started and explore your business data in detail.
        </p>
      </Card>
    </div>
  );
}
