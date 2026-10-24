import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Monitor, CreditCard, Plus, Edit, Power, ExternalLink, X, Package } from 'lucide-react';
import { openNewTab, cn } from '@/lib/utils';

interface SubPOS { id: number; name: string; terminalCode: string; branchId: number; groupIds: number[]; isActive: boolean; createdAt: string; }
interface MainPOS { id: number; name: string; terminalCode: string; branchId: number; isActive: boolean; createdAt: string; }
interface Category { id: number; name: string; }
interface Branch { id: number; name: string; }

const subposSchema = z.object({
  name: z.string().min(1, 'Name required'),
  terminalCode: z.string().min(3, 'Min 3 chars').regex(/^\S+$/, 'No spaces'),
  pin: z.string().min(4, 'Min 4 digits').regex(/^\d+$/, 'Numbers only'),
  branchId: z.number({ required_error: 'Select branch' }),
  groupIds: z.array(z.number()).min(1, 'Select at least one group'),
});
const mainposSchema = z.object({
  name: z.string().min(1, 'Name required'),
  terminalCode: z.string().min(3, 'Min 3 chars').regex(/^\S+$/, 'No spaces'),
  pin: z.string().min(4, 'Min 4 digits').regex(/^\d+$/, 'Numbers only'),
  branchId: z.number({ required_error: 'Select branch' }),
});

type SubPOSForm = z.infer<typeof subposSchema>;
type MainPOSForm = z.infer<typeof mainposSchema>;

function SubPOSModal({ categories: rawCategories, branches, onClose, terminal }: { categories: Category[]; branches: Branch[]; onClose: () => void; terminal?: SubPOS; }) {
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sort categories alphabetically
  const categories = [...rawCategories].sort((a, b) => a.name.localeCompare(b.name));

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SubPOSForm>({
    resolver: zodResolver(subposSchema),
    defaultValues: terminal ? {
      name: terminal.name,
      terminalCode: terminal.terminalCode,
      branchId: terminal.branchId,
      groupIds: terminal.groupIds || [],
      pin: '' // PIN is usually not returned or editable for security, or requires re-entry
    } : { groupIds: [] },
  });
  
  const selectedGroups = watch('groupIds') || [];

  const mutation = useMutation({
    mutationFn: async (body: SubPOSForm) => {
      if (terminal) {
        const { data } = await api.put(`/restaurant/pos-terminals/subpos/${terminal.id}`, body);
        return data;
      } else {
        const { data } = await api.post('/restaurant/pos-terminals/subpos', body);
        return data;
      }
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['subpos-terminals'] }); 
      toast.success(terminal ? 'Sub POS updated!' : 'Sub POS created!'); 
      onClose(); 
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Operation failed'),
  });

  const toggleGroup = (id: number) => {
    setValue('groupIds', selectedGroups.includes(id) ? selectedGroups.filter((g) => g !== id) : [...selectedGroups, id]);
  };

  const handleSelectAll = () => {
    if (selectedGroups.length === categories.length) {
      setValue('groupIds', []);
    } else {
      setValue('groupIds', categories.map(c => c.id));
    }
  };

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <Monitor className="w-5 h-5 text-amber-400" /> 
            {terminal ? 'Edit Sub POS Terminal' : 'Create Sub POS Terminal'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <form
          onSubmit={handleSubmit((d) => {
            const fixed = {
              ...d,
              groupIds: Array.isArray(d.groupIds) ? d.groupIds.map(Number) : [],
              branchId: Number(d.branchId),
            };

            if (!fixed.branchId || Number.isNaN(fixed.branchId)) {
              toast.error('Select a branch before submitting');
              return;
            }
            if (!Array.isArray(fixed.groupIds) || fixed.groupIds.length === 0) {
              toast.error('Select at least one item group before submitting');
              return;
            }

            mutation.mutate(fixed);
          })}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block">Terminal Name</label>
              <input {...register('name')} placeholder="e.g. Snacks Counter" className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 text-sm transition-all" />
              {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block">Terminal Code</label>
              <input {...register('terminalCode')} placeholder="e.g. SUB1" className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 text-sm uppercase transition-all" />
              {errors.terminalCode && <p className="text-red-400 text-xs mt-1">{errors.terminalCode.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block">{terminal ? 'New PIN (Optional)' : '4-Digit PIN'}</label>
              <input {...register('pin')} type="password" placeholder="e.g. 1234" maxLength={4} className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 text-sm transition-all" />
              {errors.pin && <p className="text-red-400 text-xs mt-1">{errors.pin.message}</p>}
            </div>
            <div>
              <label className="text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5 block">Branch</label>
              <select {...register('branchId', { valueAsNumber: true })} className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 text-sm transition-all appearance-none">
                <option value="">Select branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-300 text-xs font-bold uppercase tracking-wider block">Item Groups</label>
              <button 
                type="button" 
                onClick={handleSelectAll}
                className="text-[10px] font-black uppercase text-amber-400 hover:text-amber-300 transition-colors"
              >
                {selectedGroups.length === categories.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="relative mb-2">
               <input 
                 type="text" 
                 placeholder="Search categories..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full px-3 py-2 bg-[#0d0f1c] border border-[#2a2d3e] rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-400/50 transition-all"
               />
            </div>

            <div className="h-40 overflow-y-auto custom-scrollbar border border-[#2a2d3e] bg-[#0d0f1c] rounded-xl p-2 space-y-1">
              {filteredCategories.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {filteredCategories.map((cat) => (
                    <button 
                      key={cat.id} 
                      type="button" 
                      onClick={() => toggleGroup(cat.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                        selectedGroups.includes(cat.id) 
                          ? 'bg-amber-500 border-amber-400 text-white shadow-lg shadow-amber-500/20' 
                          : 'bg-[#1e2235] border-[#2a2d3e] text-slate-400 hover:border-amber-500/50'
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 text-xs uppercase font-bold italic">No groups found</div>
              )}
            </div>
            {errors.groupIds && <p className="text-red-400 text-xs mt-1">{errors.groupIds.message}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2a2d3e] text-slate-300 rounded-xl hover:bg-[#2a2d3e] transition font-bold uppercase text-xs tracking-widest">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-black rounded-xl transition uppercase text-xs tracking-widest">
              {mutation.isPending ? 'Saving...' : (terminal ? 'Update Sub POS' : 'Create Sub POS')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MainPOSModal({ branches, onClose }: { branches: Branch[]; onClose: () => void; }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<MainPOSForm>({ resolver: zodResolver(mainposSchema) });

  const createMut = useMutation({
    mutationFn: async (body: MainPOSForm) => {
      const { data } = await api.post('/restaurant/pos-terminals/mainpos', body);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mainpos-terminals'] }); toast.success('Main POS created!'); onClose(); },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to create MainPOS'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-lg flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-400" /> Create Main POS Terminal</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit((d) => createMut.mutate(d))} className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Terminal Name</label>
            <input {...register('name')} placeholder="e.g. Billing Counter 1" className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm" />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-300 text-sm mb-1 block">Terminal Code</label>
              <input {...register('terminalCode')} placeholder="e.g. MAIN1" className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm uppercase" />
              {errors.terminalCode && <p className="text-red-400 text-xs mt-1">{errors.terminalCode.message}</p>}
            </div>
            <div>
              <label className="text-slate-300 text-sm mb-1 block">4-Digit PIN</label>
              <input {...register('pin')} type="password" placeholder="e.g. 1234" maxLength={4} className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm" />
              {errors.pin && <p className="text-red-400 text-xs mt-1">{errors.pin.message}</p>}
            </div>
          </div>
          <div>
            <label className="text-slate-300 text-sm mb-1 block">Branch</label>
            <select {...register('branchId', { valueAsNumber: true })} className="w-full px-3 py-2.5 bg-[#0d0f1c] border border-[#2a2d3e] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm">
              <option value="">Select branch</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[#2a2d3e] text-slate-300 rounded-xl hover:bg-[#2a2d3e] transition">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl transition">
              {createMut.isPending ? 'Creating...' : 'Create Main POS'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function POSTerminals() {
  const [activeTab, setActiveTab] = useState<'subpos' | 'mainpos'>('subpos');
  const [showSubModal, setShowSubModal] = useState(false);
  const [showMainModal, setShowMainModal] = useState(false);
  const qc = useQueryClient();

  const { data: subTerminals = [] } = useQuery<SubPOS[]>({
    queryKey: ['subpos-terminals'],
    queryFn: async () => { const { data } = await api.get('/restaurant/pos-terminals/subpos'); return data.data; },
  });
  const { data: mainTerminals = [] } = useQuery<MainPOS[]>({
    queryKey: ['mainpos-terminals'],
    queryFn: async () => { const { data } = await api.get('/restaurant/pos-terminals/mainpos'); return data.data; },
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['item-categories'],
    queryFn: async () => { 
      const { data } = await api.get('/restaurant/item-categories'); 
      return (data.data || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
  });
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => { 
      const { data } = await api.get('/restaurant/branches'); 
      return (data.data || []).sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
  });

  const [editingSubPOS, setEditingSubPOS] = useState<SubPOS | null>(null);

  const toggleSubPOS = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const { data } = await api.put(`/restaurant/pos-terminals/subpos/${id}`, { isActive: !isActive });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subpos-terminals'] }); toast.success('Updated'); },
  });

  const toggleMainPOS = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const { data } = await api.put(`/restaurant/pos-terminals/mainpos/${id}`, { isActive: !isActive });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mainpos-terminals'] }); toast.success('Updated'); },
  });

  const getCatNames = (groupIds: number[]) => {
    try {
      if (!Array.isArray(groupIds)) return 'Invalid Groups';
      return groupIds.map((id) => categories.find((c) => c.id === id)?.name ?? id).join(', ');
    } catch {
      return 'Invalid Groups';
    }
  };
  const getBranchName = (id: number) => branches.find((b) => b.id === id)?.name ?? `Branch ${id}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">POS Terminals</h1>
          <p className="text-slate-400 text-sm mt-1">Manage Sub POS and Main POS terminals</p>
        </div>
        <button
          onClick={() => activeTab === 'subpos' ? setShowSubModal(true) : setShowMainModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition"
        >
          <Plus className="w-4 h-4" /> New {activeTab === 'subpos' ? 'Sub POS' : 'Main POS'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#2a2d3e]">
        {(['subpos', 'mainpos'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 font-medium text-sm transition border-b-2 -mb-px ${activeTab === tab ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'}`}
          >
            {tab === 'subpos' ? <><Monitor className="w-4 h-4 inline mr-1.5" />Sub POS ({subTerminals.length})</> : <><CreditCard className="w-4 h-4 inline mr-1.5" />Main POS ({mainTerminals.length})</>}
          </button>
        ))}
      </div>

      {/* Sub POS list */}
      {activeTab === 'subpos' && (
        <div className="grid gap-4">
          {subTerminals.map((t) => (
            <div key={t.id} className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.isActive ? 'bg-amber-500/20' : 'bg-slate-700'}`}>
                <Monitor className={`w-5 h-5 ${t.isActive ? 'text-amber-400' : 'text-slate-500'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold">{t.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.isActive ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>{t.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="text-slate-400 text-sm">@{t.terminalCode} · {getBranchName(t.branchId)}</div>
                <div className="text-slate-500 text-xs mt-1 flex items-center gap-1"><Package className="w-3 h-3" /> {getCatNames(t.groupIds) || 'No groups'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                   onClick={() => setEditingSubPOS(t)}
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 rounded-xl text-sm transition"
                ><Edit className="w-3.5 h-3.5" /> Edit</button>
                <button
                  onClick={() => openNewTab('/subpos')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 rounded-xl text-sm transition"
                ><ExternalLink className="w-3.5 h-3.5" /> Open</button>
                <button
                  onClick={() => toggleSubPOS.mutate({ id: t.id, isActive: t.isActive })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2d3e] text-slate-300 hover:bg-[#3a3d4e] rounded-xl text-sm transition"
                ><Power className="w-3.5 h-3.5" /> {t.isActive ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          ))}
          {subTerminals.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No Sub POS terminals yet. Create one to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* Main POS list */}
      {activeTab === 'mainpos' && (
        <div className="grid gap-4">
          {mainTerminals.map((t) => (
            <div key={t.id} className="bg-[#1e2235] border border-[#2a2d3e] rounded-2xl p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.isActive ? 'bg-indigo-500/20' : 'bg-slate-700'}`}>
                <CreditCard className={`w-5 h-5 ${t.isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-semibold">{t.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.isActive ? 'bg-green-900 text-green-300' : 'bg-slate-700 text-slate-400'}`}>{t.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="text-slate-400 text-sm">@{t.terminalCode} · {getBranchName(t.branchId)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openNewTab('/mainpos')} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 rounded-xl text-sm transition"><ExternalLink className="w-3.5 h-3.5" /> Open</button>
                <button onClick={() => toggleMainPOS.mutate({ id: t.id, isActive: t.isActive })} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2d3e] text-slate-300 hover:bg-[#3a3d4e] rounded-xl text-sm transition"><Power className="w-3.5 h-3.5" /> {t.isActive ? 'Disable' : 'Enable'}</button>
              </div>
            </div>
          ))}
          {mainTerminals.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No Main POS terminals yet.</p>
            </div>
          )}
        </div>
      )}

      {showSubModal && <SubPOSModal categories={categories} branches={branches} onClose={() => setShowSubModal(false)} />}
      {editingSubPOS && <SubPOSModal categories={categories} branches={branches} terminal={editingSubPOS} onClose={() => setEditingSubPOS(null)} />}
      {showMainModal && <MainPOSModal branches={branches} onClose={() => setShowMainModal(false)} />}
    </div>
  );
}
