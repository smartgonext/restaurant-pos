import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { ExportDropdown } from '@/components/ui/ExportDropdown';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/lib/api';

import { FilterBar } from '@/components/ui/FilterBar';

export default function Expenses() {
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const queryClient = useQueryClient();

  const { data: expensesRes, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get('/restaurant/expenses').then(r => r.data.data)
  });

  const { data: categoriesRes } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/restaurant/expense-categories').then(r => r.data.data)
  });

  const rawExpenses = expensesRes || [];
  const categories = categoriesRes || [];

  const expenses = rawExpenses.filter((exp: any) => {
    const matchSearch = !search || String(exp.title || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || exp.paymentStatus === statusFilter;
    const expDate = exp.expenseDate ? new Date(exp.expenseDate).toISOString().split('T')[0] : '';
    const matchStart = !dateRange.startDate || expDate >= dateRange.startDate;
    const matchEnd = !dateRange.endDate || expDate <= dateRange.endDate;
    return matchSearch && matchStatus && matchStart && matchEnd;
  });
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ title: '', amount: '', categoryId: '', paymentStatus: 'paid', paymentMethod: '', expenseDate: new Date().toISOString().split('T')[0] });

  // Edit expense
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [editExpenseForm, setEditExpenseForm] = useState({ title: '', amount: '', categoryId: '', paymentStatus: 'paid', paymentMethod: '', expenseDate: '' });

  // Delete expense
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);

  // Edit / delete category
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryDescription, setEditCategoryDescription] = useState('');

  const openEditExpense = (exp: any) => {
    setEditingExpense(exp);
    setEditExpenseForm({
      title: exp.title || '',
      amount: String(exp.amount ?? ''),
      categoryId: exp.categoryId ? String(exp.categoryId) : '',
      paymentStatus: exp.paymentStatus || 'paid',
      paymentMethod: exp.paymentMethod || '',
      expenseDate: exp.expenseDate ? new Date(exp.expenseDate).toISOString().split('T')[0] : '',
    });
    setShowEditExpenseModal(true);
  };

  const handleSaveEditExpense = async () => {
    const amount = Number(editExpenseForm.amount);
    if (!editExpenseForm.title || Number.isNaN(amount)) { toast.error('Provide valid title and amount'); return; }
    try {
      await api.put(`/restaurant/expenses/${editingExpense.id}`, {
        title: editExpenseForm.title,
        amount,
        categoryId: editExpenseForm.categoryId || undefined,
        expenseDate: editExpenseForm.expenseDate || undefined,
        paymentStatus: editExpenseForm.paymentStatus,
        paymentMethod: editExpenseForm.paymentMethod || undefined,
      });
      toast.success('Expense updated');
      setShowEditExpenseModal(false);
      setEditingExpense(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update expense');
    }
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    try {
      await api.delete(`/restaurant/expenses/${expenseToDelete.id}`);
      toast.success('Expense deleted');
      setExpenseToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete expense');
    }
  };

  const openEditCategory = (cat: any) => {
    setEditingCategory(cat);
    setEditCategoryName(cat.name || '');
    setEditCategoryDescription(cat.description || '');
  };

  const handleSaveEditCategory = async () => {
    const name = String(editCategoryName || '').trim();
    if (!name) { toast.error('Category name is required'); return; }
    try {
      await api.put(`/restaurant/expense-categories/${editingCategory.id}`, { name, description: editCategoryDescription || undefined });
      toast.success('Category updated');
      setEditingCategory(null);
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update category');
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    try {
      await api.delete(`/restaurant/expense-categories/${categoryToDelete.id}`);
      toast.success('Category deleted');
      setCategoryToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete category');
    }
  };

  const totalSpent = expenses.reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const pendingAmount = expenses.filter((e: any) => e.paymentStatus === 'pending').reduce((sum: number, e: any) => sum + Number(e.amount), 0);
  const productionTotal = expenses.reduce((sum: number, e: any) => sum + ((e?.category?.type === 'PRODUCTION') ? Number(e.amount) : 0), 0);
  const shopTotal = expenses.reduce((sum: number, e: any) => sum + ((e?.category?.type === 'SHOP') ? Number(e.amount) : 0), 0);

  if (expensesLoading) return <div className="p-8 text-center text-text-muted">Loading expenses...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Operating Expenses</h1>
          <p className="text-xs text-text-muted mt-1">Track and manage outgoing restaurant costs</p>
        </div>
        <div className="flex gap-2">
          <ExportDropdown data={expenses} filename="expenses" title="Expenses" size="sm" />
          <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddExpenseModal(true)}>Record Expense</Button>
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
              <div className="text-[11px] text-text-muted mt-1">
                <div>Production: <strong className="text-text-primary">{formatCurrency(productionTotal)}</strong></div>
                <div>Shop: <strong className="text-text-primary">{formatCurrency(shopTotal)}</strong></div>
              </div>
            </Card>

            <Modal open={showAddExpenseModal} onClose={() => setShowAddExpenseModal(false)} title="Add Expense">
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Expense Title</label>
                  <input value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Category</label>
                  <select value={expenseForm.categoryId} onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })} className="w-full bg-white text-black border border-border rounded p-2 text-sm">
                    <option value="">Select Category</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-text-muted block mb-1">Amount</label>
                    <input value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-text-muted block mb-1">Expense Date</label>
                    <input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Payment Status</label>
                  <select value={expenseForm.paymentStatus} onChange={(e) => setExpenseForm({ ...expenseForm, paymentStatus: e.target.value })} className="w-full bg-white text-black border border-border rounded p-2 text-sm">
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowAddExpenseModal(false)}>Cancel</Button>
                  <Button onClick={async () => {
                    const amount = Number(expenseForm.amount);
                    if (!expenseForm.title || Number.isNaN(amount)) { toast.error('Provide valid title and amount'); return; }
                    try {
                      await api.post('/restaurant/expenses', { title: expenseForm.title, amount, categoryId: expenseForm.categoryId || undefined, expenseDate: expenseForm.expenseDate, paymentStatus: expenseForm.paymentStatus, paymentMethod: expenseForm.paymentMethod || undefined });
                      toast.success('Expense recorded');
                      setShowAddExpenseModal(false);
                      queryClient.invalidateQueries({ queryKey: ['expenses'] });
                    } catch (err: any) {
                      toast.error(err?.response?.data?.error || 'Failed to record expense');
                    }
                  }} variant="primary">Save Expense</Button>
                </div>
              </div>
            </Modal>
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
            <div className="p-3 border-b border-border/50">
              <FilterBar
                searchQuery={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search expenses by title..."
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onDateChange={setDateRange}
                showDateFilter={true}
                status={statusFilter === 'all' ? '' : statusFilter}
                statusOptions={[
                  { label: 'Paid', value: 'paid' },
                  { label: 'Pending', value: 'pending' },
                ]}
                onStatusChange={(val) => setStatusFilter(val || 'all')}
                onReset={() => { setSearch(''); setStatusFilter('all'); setDateRange({ startDate: '', endDate: '' }); }}
              />
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
                          <button onClick={() => openEditExpense(exp)} className="text-blue-400 hover:text-blue-300 p-1.5"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setExpenseToDelete(exp)} className="text-danger hover:text-danger/70 p-1.5"><Trash2 className="w-3.5 h-3.5" /></button>
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

          <Modal open={showEditExpenseModal} onClose={() => { setShowEditExpenseModal(false); setEditingExpense(null); }} title="Edit Expense">
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">Expense Title</label>
                <input value={editExpenseForm.title} onChange={(e) => setEditExpenseForm({ ...editExpenseForm, title: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">Category</label>
                <select value={editExpenseForm.categoryId} onChange={(e) => setEditExpenseForm({ ...editExpenseForm, categoryId: e.target.value })} className="w-full bg-white text-black border border-border rounded p-2 text-sm">
                  <option value="">Select Category</option>
                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Amount</label>
                  <input value={editExpenseForm.amount} onChange={(e) => setEditExpenseForm({ ...editExpenseForm, amount: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-text-muted block mb-1">Expense Date</label>
                  <input type="date" value={editExpenseForm.expenseDate} onChange={(e) => setEditExpenseForm({ ...editExpenseForm, expenseDate: e.target.value })} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-text-muted block mb-1">Payment Status</label>
                <select value={editExpenseForm.paymentStatus} onChange={(e) => setEditExpenseForm({ ...editExpenseForm, paymentStatus: e.target.value })} className="w-full bg-white text-black border border-border rounded p-2 text-sm">
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setShowEditExpenseModal(false); setEditingExpense(null); }}>Cancel</Button>
                <Button onClick={handleSaveEditExpense}>Save Changes</Button>
              </div>
            </div>
          </Modal>

          <Modal open={!!expenseToDelete} onClose={() => setExpenseToDelete(null)} title="Delete Expense">
            <div className="p-4 space-y-4">
              <p className="text-sm text-text-secondary">
                Are you sure you want to delete this expense?
                {expenseToDelete && <span className="font-semibold text-text-primary"> "{expenseToDelete.title}"</span>} This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setExpenseToDelete(null)}>Cancel</Button>
                <Button variant="danger" onClick={handleDeleteExpense}>Delete</Button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {activeTab === 'categories' && (
        <>
        <Card padding={false} className="border-border/50">
           <div className="p-3 border-b border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
             <h3 className="font-semibold text-text-primary text-sm">Expense Categories Budgeting</h3>
             <Button variant="secondary" size="sm" icon={<Plus className="w-3 h-3" />} onClick={() => setShowNewCategoryModal(true)}>New Category</Button>
           </div>
           <div className="divide-y divide-border/50">
             {categories.map((cat: any) => (
               <div key={cat.id} className="p-4 flex flex-col hover:bg-bg-hover/20 transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-text-primary">{cat.name}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-text-muted">{cat._count?.expenses || 0} Transactions</span>
                      <button onClick={() => openEditCategory(cat)} className="p-1 rounded hover:bg-bg-hover text-blue-400 hover:text-blue-300"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setCategoryToDelete(cat)} className="p-1 rounded hover:bg-bg-hover text-danger hover:text-danger/70"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted">{cat.description || 'No description'}</p>
               </div>
             ))}
             {categories.length === 0 && (
                <div className="p-8 text-center text-text-muted italic text-xs">No categories found.</div>
             )}
           </div>
        </Card>

       <Modal open={showNewCategoryModal} onClose={() => setShowNewCategoryModal(false)} title="Create Expense Category">
         <div className="p-4 space-y-3">
           <div>
             <label className="text-xs font-bold text-text-muted block mb-1">Category name</label>
             <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
           </div>
           <div>
             <label className="text-xs font-bold text-text-muted block mb-1">Description (opt)</label>
             <input value={newCategoryDescription} onChange={(e) => setNewCategoryDescription(e.target.value)} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
           </div>
           <div className="flex justify-end gap-2">
             <Button variant="secondary" onClick={() => setShowNewCategoryModal(false)}>Cancel</Button>
             <Button onClick={async () => {
               const name = String(newCategoryName || '').trim();
               if (!name) { toast.error('Category name is required'); return; }
               try {
                 await api.post('/restaurant/expense-categories', { name, description: newCategoryDescription || undefined });
                 toast.success('Category created');
                 setNewCategoryName(''); setNewCategoryDescription(''); setShowNewCategoryModal(false);
                 queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
               } catch (err: any) {
                 toast.error(err?.response?.data?.error || 'Failed to create category');
               }
             }}>Create</Button>
           </div>
         </div>
      </Modal>
       <Modal open={!!editingCategory} onClose={() => setEditingCategory(null)} title="Edit Expense Category">
         <div className="p-4 space-y-3">
           <div>
             <label className="text-xs font-bold text-text-muted block mb-1">Category name</label>
             <input value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
           </div>
           <div>
             <label className="text-xs font-bold text-text-muted block mb-1">Description (opt)</label>
             <input value={editCategoryDescription} onChange={(e) => setEditCategoryDescription(e.target.value)} className="w-full bg-bg-dark border border-border rounded p-2 text-sm" />
           </div>
           <div className="flex justify-end gap-2">
             <Button variant="secondary" onClick={() => setEditingCategory(null)}>Cancel</Button>
             <Button onClick={handleSaveEditCategory}>Save</Button>
           </div>
         </div>
      </Modal>
       <Modal open={!!categoryToDelete} onClose={() => setCategoryToDelete(null)} title="Delete Expense Category">
         <div className="p-4 space-y-4">
           <p className="text-sm text-text-secondary">
             Are you sure you want to delete this category?
             {categoryToDelete && <span className="font-semibold text-text-primary"> "{categoryToDelete.name}"</span>} This action cannot be undone.
           </p>
           <div className="flex justify-end gap-2">
             <Button variant="secondary" onClick={() => setCategoryToDelete(null)}>Cancel</Button>
             <Button variant="danger" onClick={handleDeleteCategory}>Delete</Button>
           </div>
         </div>
      </Modal>
      </>
          )}
    </div>
  );
}
