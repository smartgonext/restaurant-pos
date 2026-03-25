import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { Receipt, Plus, Search, Filter, Trash2, Edit2 } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function Expenses() {
  const [activeTab, setActiveTab] = useState('list');
  
  const { data: expensesRes, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get('/restaurant/expenses').then(r => r.data.data)
  });

  const { data: categoriesRes } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/restaurant/expense-categories').then(r => r.data.data)
  });

  const expenses = expensesRes || [];
  const categories = categoriesRes || [];

  const totalSpent = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const pendingAmount = expenses.filter((e: any) => e.paymentStatus === 'pending').reduce((sum: number, e: any) => sum + Number(e.amount), 0);

  if (expensesLoading) return <div className="p-8 text-center text-text-muted">Loading expenses...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Operating Expenses</h1>
          <p className="text-xs text-text-muted mt-1">Track and manage outgoing restaurant costs</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<Plus className="w-4 h-4" />}>Record Expense</Button>
        </div>
      </div>

      <Tabs 
        activeTab={activeTab} 
        onChange={setActiveTab} 
        tabs={[
          { id: 'list', label: 'All Expenses' },
          { id: 'categories', label: 'Expense Categories' }
        ]} 
      />

      {activeTab === 'list' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="flex flex-col gap-1 bg-danger/5 border-danger/20">
              <span className="text-[10px] font-medium text-danger uppercase tracking-wider">Total Expenses (Month)</span>
              <span className="text-xl font-bold text-text-primary">{formatCurrency(totalSpent)}</span>
            </Card>
            <Card className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-warning uppercase tracking-wider">Pending Payments</span>
              <span className="text-xl font-bold text-warning">{formatCurrency(pendingAmount)}</span>
            </Card>
            <Card className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-success uppercase tracking-wider">Categories</span>
              <span className="text-xl font-bold text-success">{categories.length}</span>
            </Card>
          </div>

          <Card padding={false} className="border-border/50">
            <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:w-80">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                 <input className="glass-input w-full pl-9 h-9 text-sm" placeholder="Search expenses by title..." />
              </div>
              <Button size="sm" variant="secondary" icon={<Filter className="w-4 h-4" />}>Filter</Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-bg-tertiary/30 border-b border-border text-left text-text-secondary">
                    <th className="py-3 px-4 font-medium w-64">Description</th>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Amount</th>
                    <th className="py-3 px-4 font-medium">Status & Payment</th>
                    <th className="py-3 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {expenses.map((exp: any) => (
                    <tr key={exp.id} className="hover:bg-bg-hover/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-text-primary">{exp.title}</td>
                      <td className="py-3 px-4 text-text-secondary">{exp.category?.name}</td>
                      <td className="py-3 px-4 text-text-primary">{new Date(exp.expenseDate).toLocaleDateString()}</td>
                      <td className="py-3 px-4 font-bold text-text-primary">{formatCurrency(exp.amount)}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col items-start gap-1">
                          <Badge size="sm" variant={exp.paymentStatus === 'paid' ? 'success' : 'warning'} className="capitalize">{exp.paymentStatus}</Badge>
                          <span className="text-[10px] text-text-muted">{exp.paymentMethod || '-'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="text-blue-400 hover:text-blue-300 p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button className="text-danger hover:text-danger/70 p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-text-muted italic">No expenses recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {activeTab === 'categories' && (
        <Card padding={false} className="border-border/50">
           <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
             <h3 className="font-semibold text-text-primary text-sm">Expense Categories Budgeting</h3>
             <Button variant="secondary" size="sm" icon={<Plus className="w-3 h-3" />}>New Category</Button>
           </div>
           <div className="divide-y divide-border/50">
             {categories.map((cat: any) => (
               <div key={cat.id} className="p-4 flex flex-col hover:bg-bg-hover/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-text-primary">{cat.name}</h4>
                    <span className="text-[10px] text-text-muted">{cat._count?.expenses || 0} Transactions</span>
                  </div>
                  <p className="text-xs text-text-muted">{cat.description || 'No description'}</p>
               </div>
             ))}
             {categories.length === 0 && (
                <div className="p-8 text-center text-text-muted italic text-xs">No categories found.</div>
             )}
           </div>
        </Card>
      )}
    </div>
  );
}
