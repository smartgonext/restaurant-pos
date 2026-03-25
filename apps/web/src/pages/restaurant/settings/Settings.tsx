import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Settings as SettingsIcon, Save, Building2, DollarSign, Receipt, 
  Globe, Bell, Palette, Clock, Mail, ShieldCheck, CreditCard, 
  Printer, Smartphone, Trash2, Heart, Share2, Box
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const tabGroups = [
  {
    title: 'Core Configuration',
    tabs: [
      { id: 'general', label: 'General', icon: Building2 },
      { id: 'taxes', label: 'Taxes', icon: Receipt },
      { id: 'currency', label: 'Currency', icon: DollarSign },
      { id: 'ordering', label: 'Ordering', icon: Globe },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'appearance', label: 'Theme', icon: Palette },
    ]
  },
  {
    title: 'Operations',
    tabs: [
      { id: 'shifts', label: 'Operational Shifts', icon: Clock },
      { id: 'loyalty', label: 'Loyalty Program', icon: Heart },
      { id: 'webhooks', label: 'Webhooks', icon: Share2 },
      { id: 'cancellation', label: 'Cancellation Reasons', icon: Trash2 },
      { id: 'inventory', label: 'Inventory Units', icon: Box },
    ]
  }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: () => api.get('/restaurant/settings').then((r) => r.data.data),
  });

  const [formData, setFormData] = useState<any>({});

  const handleSave = async () => {
    try {
      await api.put('/restaurant/settings/general', formData);
      toast.success('Settings saved!');
      refetch();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  if (settings && Object.keys(formData).length === 0) {
    setFormData({
      currency: settings.currency,
      currencySymbol: settings.currencySymbol,
      taxMode: settings.taxMode,
      sgstRate: Number(settings.sgstRate),
      cgstRate: Number(settings.cgstRate),
      timezone: settings.timezone,
      orderPrefix: settings.orderPrefix,
      kotPrefix: settings.kotPrefix,
      deliveryFee: Number(settings.deliveryFee),
      minOrderAmount: Number(settings.minOrderAmount),
      allowDineIn: settings.allowDineIn,
      allowDelivery: settings.allowDelivery,
      allowPickup: settings.allowPickup,
      loyaltyEnabled: settings.loyaltyEnabled,
    });
  }

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading settings...</div>;

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Restaurant Settings</h1>
          <p className="text-xs text-text-muted mt-1">Configure your business rules and appearance</p>
        </div>
        <Button size="sm" icon={<Save className="w-3.5 h-3.5" />} onClick={handleSave}>Save Changes</Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar Tabs */}
        <div className="w-full lg:w-56 shrink-0 space-y-4">
          {tabGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest px-3 mb-2">{group.title}</p>
              {group.tabs.map((tab) => (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                    activeTab === tab.id 
                      ? 'bg-blue-500/10 text-blue-400' 
                      : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Content Area */}
        <Card className="flex-1 min-h-[500px]">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">General Configuration</h2>
                 <p className="text-xs text-text-muted mt-1">Manage core restaurant identifiers</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Order Prefix" value={formData.orderPrefix || ''} onChange={(e) => setFormData({ ...formData, orderPrefix: e.target.value })} placeholder="ORD" />
                <Input label="KOT Prefix" value={formData.kotPrefix || ''} onChange={(e) => setFormData({ ...formData, kotPrefix: e.target.value })} placeholder="KOT" />
                <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-text-muted uppercase">Primary Timezone</label>
                   <select className="glass-input h-10 text-xs" value={formData.timezone || 'UTC'} onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}>
                      <option value="UTC">UTC (Universal)</option>
                      <option value="Asia/Kolkata">IST (Asia/Kolkata)</option>
                      <option value="America/New_York">EST (America/New_York)</option>
                      <option value="Europe/London">GMT (Europe/London)</option>
                   </select>
                </div>
              </div>
              <div className="space-y-3 pt-4">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Enabled Order Types</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                   {[
                     { id: 'allowDineIn', label: 'Dine In', desc: 'At-table service' },
                     { id: 'allowDelivery', label: 'Delivery', desc: 'To customer home' },
                     { id: 'allowPickup', label: 'Pickup', desc: 'Customer collects' }
                   ].map((type) => (
                     <label key={type.id} className={cn(
                       "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer",
                       formData[type.id] ? "bg-blue-500/5 border-blue-500/30" : "bg-bg-tertiary border-border/50"
                     )}>
                        <input 
                          type="checkbox" 
                          checked={formData[type.id] ?? true} 
                          onChange={(e) => setFormData({ ...formData, [type.id]: e.target.checked })}
                          className="w-4 h-4 rounded border-border text-blue-500 focus:ring-blue-500/20"
                        />
                        <div>
                           <p className="text-xs font-bold text-text-primary">{type.label}</p>
                           <p className="text-[10px] text-text-muted">{type.desc}</p>
                        </div>
                     </label>
                   ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'taxes' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">Taxation Rules</h2>
                 <p className="text-xs text-text-muted mt-1">Configure VAT/GST and tax application modes</p>
              </div>
              <div className="max-w-md space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-text-muted uppercase">Calculation Mode</label>
                  <select className="glass-input h-10 text-xs" value={formData.taxMode || 'order'} onChange={(e) => setFormData({ ...formData, taxMode: e.target.value })}>
                    <option value="order">Apply on Total Bill (Standard)</option>
                    <option value="item">Apply on Individual Items</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input label="SGST Rate (%)" type="number" value={formData.sgstRate || 0} onChange={(e) => setFormData({ ...formData, sgstRate: Number(e.target.value) })} />
                  <Input label="CGST Rate (%)" type="number" value={formData.cgstRate || 0} onChange={(e) => setFormData({ ...formData, cgstRate: Number(e.target.value) })} />
                </div>
                <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20">
                   <p className="text-[10px] uppercase font-bold text-orange-400 mb-1">Important Note</p>
                   <p className="text-[10px] text-text-muted leading-relaxed">Tax changes will only apply to new orders created after saving. Historical orders will retain their original tax values.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'currency' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">Currency & Locale</h2>
                 <p className="text-xs text-text-muted mt-1">Set your primary currency and display symbol</p>
              </div>
              <div className="max-w-md grid grid-cols-2 gap-4">
                <Input label="Currency (ISO)" value={formData.currency || 'USD'} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} />
                <Input label="Symbol" value={formData.currencySymbol || '$'} onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })} />
              </div>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">Loyalty Program</h2>
                 <p className="text-xs text-text-muted mt-1">Reward your customers for their repeat business</p>
              </div>
              <div className="max-w-md space-y-4">
                 <label className="flex items-center justify-between p-4 rounded-xl bg-bg-tertiary border border-border/50 cursor-pointer">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
                          <Heart size={20} />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-text-primary">Enable Program</p>
                          <p className="text-[10px] text-text-muted">Allow customers to earn and spend points</p>
                       </div>
                    </div>
                    <input 
                       type="checkbox" 
                       checked={formData.loyaltyEnabled || false} 
                       onChange={(e) => setFormData({ ...formData, loyaltyEnabled: e.target.checked })}
                       className="w-5 h-5 rounded border-border"
                    />
                 </label>
                 {formData.loyaltyEnabled && (
                   <div className="space-y-4 pt-4 border-t border-border/30">
                      <Input label="Points per 1.00 spent" type="number" defaultValue={1} />
                      <Input label="Conversion Value (1 Point = $)" type="number" defaultValue={0.01} />
                   </div>
                 )}
              </div>
            </div>
          )}

          {activeTab === 'webhooks' && (
             <div className="space-y-6">
               <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">Webhooks</h2>
                 <p className="text-xs text-text-muted mt-1">Receive real-time order updates on your external systems</p>
               </div>
               <div className="space-y-4">
                  <div className="p-12 border-2 border-dashed border-border/50 rounded-2xl flex flex-col items-center justify-center text-center">
                     <Share2 size={48} className="text-text-muted/30 mb-4" />
                     <h3 className="text-sm font-bold text-text-primary">No Webhooks Configured</h3>
                     <p className="text-xs text-text-muted mt-1 max-w-xs">Connecting your POS data to external apps like spreadsheets or CRMs.</p>
                     <Button size="sm" className="mt-6" variant="secondary">Add Webhook URL</Button>
                  </div>
               </div>
             </div>
          )}

          {/* Fallback for empty tabs */}
          {!['general', 'taxes', 'currency', 'loyalty', 'webhooks'].includes(activeTab) && (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40">
               <SettingsIcon size={64} className="mb-4 animate-spin-slow" />
               <h3 className="text-lg font-bold">Coming Soon</h3>
               <p className="text-xs max-w-xs mt-2">This configuration module is being finalized. Advanced settings for {activeTab} will be available in the next release.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
