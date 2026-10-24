import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Settings as SettingsIcon, Save, Building2, DollarSign, Receipt, 
  Globe, Bell, Palette, Clock, Mail, ShieldCheck, CreditCard, 
  Printer, Smartphone, Trash2, Heart, Share2, Box, Database, Download, UploadCloud,
  SlidersHorizontal, CheckSquare, Square, Info, Sparkles, ArrowUpCircle, RefreshCw, CheckCircle2
} from 'lucide-react';
import { cn, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { ComingSoon } from '@/components/ui/ComingSoon';
import BillSettings from './BillSettings';
import BarcodeSettings from './BarcodeSettings';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import Units from '../inventory/Units';

const NAV_VISIBILITY_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard', category: 'Core', desc: 'Main restaurant overview & metrics' },
  { id: 'menu', label: 'Menu', category: 'Core', desc: 'Manage menus, items, categories, & modifiers' },
  { id: 'tables', label: 'Tables', category: 'Core', desc: 'Manage tables, areas, and QR codes' },
  { id: 'pos', label: 'POS & Billing', category: 'Billing', desc: 'POS terminals and billing dashboard' },
  { id: 'orders', label: 'Orders', category: 'Operations', desc: 'Track and manage live and past orders' },
  { id: 'reservations', label: 'Reservations', category: 'Operations', desc: 'Table bookings and guest schedule' },
  { id: 'branches', label: 'Branches', category: 'Management', desc: 'Manage restaurant branches and outlets' },
  { id: 'customers', label: 'Customers', category: 'Management', desc: 'Customer list and order history' },
  { id: 'staff', label: 'Staff', category: 'Management', desc: 'Staff directory, roles, and shift access' },
  { id: 'delivery', label: 'Delivery', category: 'Operations', desc: 'Delivery drivers and order assignments' },
  { id: 'expenses', label: 'Expenses', category: 'Finance', desc: 'Track operating expenses and payouts' },
  { id: 'payments', label: 'Payments', category: 'Finance', desc: 'Payment transactions and settlement logs' },
  { id: 'reports', label: 'Reports', category: 'Analytics', desc: 'Sales, KOT, tax, item, & financial analytics' },
  { id: 'kitchens', label: 'Kitchen', badge: 'Addon', category: 'Addons', desc: 'Kitchen Display System (KDS) & order queue' },
  { id: 'cash_register', label: 'Cash Register', badge: 'Addon', category: 'Addons', desc: 'Shift opening/closing & cash drawer tracking' },
  { id: 'inventory', label: 'Inventory', badge: 'Addon', category: 'Addons', desc: 'Stock control, recipes, suppliers, & POs' },
  { id: 'hotel', label: 'Hotel', badge: 'Addon', category: 'Addons', desc: 'Rooms, check-in/out, guests, & housekeeping' },
  { id: 'launch_terminals', label: 'Launch Terminals', category: 'Terminals', desc: 'Launcher shortcuts for Sub POS, Main POS, Waiter' },
];

const tabGroups = [
  {
    title: 'Core Configuration',
    tabs: [
      { id: 'general', label: 'General', icon: Building2 },
      { id: 'sidebar-visibility', label: 'Sidebar Visibility', icon: SlidersHorizontal },
      { id: 'taxes', label: 'Taxes', icon: Receipt },
      { id: 'currency', label: 'Currency', icon: DollarSign },
      { id: 'ordering', label: 'Ordering', icon: Globe },
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'appearance', label: 'Theme', icon: Palette },
      { id: 'security', label: 'Security', icon: ShieldCheck },
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
      { id: 'bill-settings', label: 'Bill Display', icon: Receipt },
      { id: 'barcode', label: 'Barcode Print', icon: Printer },
      { id: 'backup', label: 'Backup & Restore', icon: Database },
      { id: 'updates', label: 'App Updates', icon: Sparkles },
    ]
  }
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');
  const setTheme = useThemeStore((s) => s.setTheme);
  const [shifts, setShifts] = useState<any[]>([]);

  // Backup & Restore states
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size exceeds maximum 2MB limit. Please select a smaller logo.');
      return;
    }

    setIsUploadingLogo(true);
    const toastId = toast.loading('Uploading logo image...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/restaurant/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const logoUrl = res.data.url;
      setFormData((prev: any) => ({ ...prev, restaurantLogo: logoUrl }));
      toast.success('Logo uploaded successfully!', { id: toastId });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload logo image', { id: toastId });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleDownloadBackup = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Generating backup file...');
    try {
      const response = await api.get('/restaurant/backup/export', { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `restaurant_backup_${new Date().toISOString().slice(0, 10)}.db`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Backup downloaded successfully!', { id: toastId });
    } catch (err: any) {
      toast.error('Failed to generate backup.', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!backupFile) {
      toast.error('Please select a backup file first.');
      return;
    }

    const confirmRestore = window.confirm(
      'WARNING: This will overwrite your entire database with the uploaded backup file. All current data will be permanently overwritten. Are you sure you want to proceed?'
    );
    if (!confirmRestore) return;

    setIsRestoring(true);
    const toastId = toast.loading('Restoring database... Please do not close or reload the application.');

    try {
      const formData = new FormData();
      formData.append('file', backupFile);

      await api.post('/restaurant/backup/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      toast.success('Database restored successfully! Reloading application...', { id: toastId });
      setBackupFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to restore database.';
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsRestoring(false);
    }
  };

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: () => api.get('/restaurant/settings').then((r) => r.data.data ?? {}),
  });

  const [formData, setFormData] = useState<any>({});
  const [whatsappForm, setWhatsappForm] = useState({
    enabled: false,
    token: '',
    phoneNumberId: '',
    template: '',
    testPhone: '',
    testMessage: '',
    webhookText: '',
  });

  const { data: whatsappConfig, refetch: refetchWhatsappConfig } = useQuery({
    queryKey: ['restaurant-whatsapp-config'],
    queryFn: () => api.get('/restaurant/whatsapp/config').then((r) => r.data.data ?? {}),
  });

  const { data: whatsappTemplate, refetch: refetchWhatsappTemplate } = useQuery({
    queryKey: ['restaurant-whatsapp-template'],
    queryFn: () => api.get('/restaurant/whatsapp/template').then((r) => r.data.data ?? {}),
  });

  const { data: webhookUrls = [], refetch: refetchWhatsappWebhooks } = useQuery({
    queryKey: ['restaurant-whatsapp-webhooks'],
    queryFn: () => api.get('/restaurant/whatsapp/webhooks').then((r) => r.data.data || []),
  });

  useEffect(() => {
    if (!settings) return;
    let parsedShifts = [];
    try {
      if (settings.customerSiteConfig) {
        const parsed = JSON.parse(settings.customerSiteConfig);
        parsedShifts = parsed.shifts || [];
      }
    } catch (e) {}
    if (parsedShifts.length === 0) {
      parsedShifts = [
        { name: 'Morning Shift', startTime: '06:00', endTime: '14:00', isActive: true },
        { name: 'Evening Shift', startTime: '14:00', endTime: '22:00', isActive: true },
        { name: 'Night Shift', startTime: '22:00', endTime: '06:00', isActive: false }
      ];
    }
    setShifts(parsedShifts);
  }, [settings]);

  useEffect(() => {
    if (!whatsappConfig && !whatsappTemplate) return;
    setWhatsappForm((prev) => ({
      ...prev,
      enabled: Boolean(whatsappConfig?.whatsappEnabled),
      token: String(whatsappConfig?.whatsappToken || ''),
      phoneNumberId: String(whatsappConfig?.phoneNumberId || whatsappTemplate?.phoneNumberId || ''),
      template: String(whatsappTemplate?.template || ''),
      testMessage: prev.testMessage || 'Hello from Restaurant SaaS',
    }));
  }, [whatsappConfig, whatsappTemplate]);

  useEffect(() => {
    setWhatsappForm((prev) => ({
      ...prev,
      webhookText: Array.isArray(webhookUrls) ? webhookUrls.join('\n') : '',
    }));
  }, [webhookUrls]);

  const queryClient = useQueryClient();

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        customerSiteConfig: JSON.stringify({ shifts })
      };
      await api.put('/restaurant/settings/general', payload);
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
      queryClient.invalidateQueries({ queryKey: ['bill-settings'] });

      // Synchronize updated profile globally in auth store
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        const currentRest = currentUser.restaurant || { id: 1, name: '', slug: '' };
        useAuthStore.getState().updateUser({
          email: formData.restaurantEmail || currentUser.email,
          restaurant: {
            ...currentRest,
            name: formData.restaurantName || currentRest.name,
            phone: formData.restaurantPhone || (currentRest as any)?.phone,
            address: formData.restaurantAddress || (currentRest as any)?.address,
            logo: formData.restaurantLogo || (currentRest as any)?.logo,
          } as any
        });
      }

      toast.success('Settings saved successfully!');
      refetch();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Failed to save settings'); }
  };

  const handleSelectAllNav = () => {
    const current = formData?.theme?.navVisibility || {};
    const updated = { ...current };
    NAV_VISIBILITY_OPTIONS.forEach((item) => {
      updated[item.id] = true;
    });
    updateThemeField({ navVisibility: updated });
    toast.success('All sidebar menu items ticked (enabled)');
  };

  const handleDeselectAllNav = () => {
    const current = formData?.theme?.navVisibility || {};
    const updated = { ...current };
    NAV_VISIBILITY_OPTIONS.forEach((item) => {
      updated[item.id] = false;
    });
    updateThemeField({ navVisibility: updated });
    toast.success('Optional menu items unticked (hidden from sidebar)');
  };

  const saveWhatsappSettings = async () => {
    try {
      await api.put('/restaurant/whatsapp/config', {
        enabled: whatsappForm.enabled,
        token: whatsappForm.token,
        phoneNumberId: whatsappForm.phoneNumberId,
      });
      await api.put('/restaurant/whatsapp/template', {
        template: whatsappForm.template,
        phoneNumberId: whatsappForm.phoneNumberId,
      });
      toast.success('WhatsApp settings saved');
      refetchWhatsappConfig();
      refetchWhatsappTemplate();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save WhatsApp settings');
    }
  };

  const saveWebhookUrls = async () => {
    try {
      const urls = String(whatsappForm.webhookText || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);
      await api.put('/restaurant/whatsapp/webhooks', { urls });
      toast.success('Webhook URLs saved');
      refetchWhatsappWebhooks();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to save webhook URLs');
    }
  };

  const sendWhatsappTest = async () => {
    if (!whatsappForm.testPhone.trim()) {
      toast.error('Enter test phone number');
      return;
    }
    try {
      await api.post('/restaurant/whatsapp/test', {
        phone: whatsappForm.testPhone,
        message: whatsappForm.testMessage,
      });
      toast.success('Test message sent');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Test send failed');
    }
  };

  const updateThemeField = (next: Partial<{ mode: 'light' | 'dark'; brandColor: string; navVisibility: Record<string, boolean> }>) => {
    const current = formData?.theme || {};
    setFormData({
      ...formData,
      theme: {
        ...current,
        ...next,
      },
    });
  };

  if (settings && Object.keys(formData).length === 0) {
    const authUser = useAuthStore.getState().user;
    setFormData({
      restaurantName: settings.restaurantName || authUser?.restaurant?.name || '',
      restaurantEmail: settings.restaurantEmail || authUser?.email || '',
      restaurantPhone: settings.restaurantPhone || '',
      restaurantAddress: settings.restaurantAddress || '',
      restaurantLogo: settings.restaurantLogo || '',
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
      posDeletePassword: settings.posDeletePassword || '',
      igstRate: Number(settings.igstRate || 0),
      isInterState: settings.isInterState || false,
      cancellationReasons: settings.cancellationReasons || 'Customer changed mind, Incorrect item, Ordered by mistake, High wait time',
      theme: {
        mode: settings?.theme?.mode === 'light' ? 'light' : 'dark',
        brandColor: settings?.theme?.brandColor || '#2563eb',
        navVisibility: NAV_VISIBILITY_OPTIONS.reduce((acc: Record<string, boolean>, item) => {
          const saved = settings?.theme?.navVisibility?.[item.id];
          acc[item.id] = typeof saved === 'boolean' ? saved : true;
          return acc;
        }, {}),
      },
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
                 <p className="text-xs text-text-muted mt-1">Manage core restaurant identity, branding details, and system settings</p>
              </div>

              {/* Restaurant Identity & Profile Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">Restaurant Details & Branding</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    label="Restaurant Registered Name *" 
                    value={formData.restaurantName || ''} 
                    onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })} 
                    placeholder="e.g. SMARTGONEXT Bakery & Restaurant" 
                  />
                  <Input 
                    label="Phone Number" 
                    value={formData.restaurantPhone || ''} 
                    onChange={(e) => setFormData({ ...formData, restaurantPhone: e.target.value })} 
                    placeholder="e.g. +91 9876543210" 
                  />
                  <Input 
                    label="Email Address" 
                    type="email" 
                    value={formData.restaurantEmail || ''} 
                    onChange={(e) => setFormData({ ...formData, restaurantEmail: e.target.value })} 
                    placeholder="e.g. contact@restaurant.com" 
                  />
                </div>

                {/* Logo Upload Card with Best Specs Guidance */}
                <div className="p-4 rounded-xl bg-bg-tertiary border border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-blue-400" />
                      Restaurant Logo (Appears on Receipts, POS Bills & PDF Reports)
                    </label>
                    <span className="text-[10px] text-blue-400 font-semibold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      File Upload Enabled
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {formData.restaurantLogo ? (
                      <div className="w-20 h-20 rounded-xl border border-border overflow-hidden bg-white/10 shrink-0 flex items-center justify-center p-2 shadow-sm">
                        <img src={resolveImageUrl(formData.restaurantLogo)} alt="Restaurant Logo" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-xl border border-dashed border-border flex items-center justify-center shrink-0 text-text-muted text-[10px] text-center p-2 bg-bg-primary">
                        No Logo Uploaded
                      </div>
                    )}

                    <div className="flex-1 space-y-2.5 w-full">
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shrink-0">
                          <UploadCloud className="w-4 h-4" />
                          {isUploadingLogo ? 'Uploading Logo...' : 'Upload Logo File'}
                          <input 
                            type="file" 
                            accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml" 
                            onChange={handleLogoFileUpload} 
                            disabled={isUploadingLogo}
                            className="hidden" 
                          />
                        </label>

                        <Input 
                          value={formData.restaurantLogo || ''} 
                          onChange={(e) => setFormData({ ...formData, restaurantLogo: e.target.value })} 
                          placeholder="Or paste image URL (https://...)" 
                          className="flex-1 text-xs"
                        />
                      </div>

                      {/* Best Specifications Card */}
                      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[11px] space-y-1">
                        <p className="font-bold text-blue-400 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" /> Best Recommended Logo Specifications:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-text-muted pt-1">
                          <div className="bg-bg-primary/50 p-2 rounded border border-border/40">
                            <span className="font-semibold text-text-primary block">Recommended Dimensions:</span>
                            Square: 300×300 px or 512×512 px (Horizontal: 400×200 px)
                          </div>
                          <div className="bg-bg-primary/50 p-2 rounded border border-border/40">
                            <span className="font-semibold text-text-primary block">Recommended Formats:</span>
                            PNG or SVG (Transparent background recommended)
                          </div>
                          <div className="bg-bg-primary/50 p-2 rounded border border-border/40">
                            <span className="font-semibold text-text-primary block">Max File Size:</span>
                            Max 2 MB (High-contrast logos print sharpest on thermal bills)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-text-muted uppercase mb-1.5 block">Restaurant Complete Address (Appears on Bills & Reports)</label>
                  <textarea 
                    value={formData.restaurantAddress || ''} 
                    onChange={(e) => setFormData({ ...formData, restaurantAddress: e.target.value })} 
                    placeholder="Enter street, city, state, pincode..." 
                    className="glass-input w-full min-h-[70px] text-xs p-2.5 rounded-xl"
                  />
                </div>
              </div>

              {/* System Prefixes & Timezone Section */}
              <div className="space-y-4 pt-4 border-t border-border/40">
                <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider">System Prefix & Timezone</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              </div>

              {/* Enabled Order Types Section */}
              <div className="space-y-3 pt-4 border-t border-border/40">
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

          {activeTab === 'sidebar-visibility' && (
            <div className="space-y-6 animate-in">
              <div className="border-b border-border/50 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-blue-400" />
                    Sidebar Menu Tick & Module Controls
                  </h2>
                  <p className="text-xs text-text-muted mt-1">
                    Select which menu items appear in your restaurant sidebar. Untick unwanted options to simplify navigation and reduce employee confusion.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" icon={<CheckSquare className="w-3.5 h-3.5" />} onClick={handleSelectAllNav}>
                    Tick All (Enable All)
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Square className="w-3.5 h-3.5" />} onClick={handleDeselectAllNav}>
                    Untick All
                  </Button>
                </div>
              </div>

              {/* Notice Banner */}
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-blue-400">Default Behavior & Core Settings</p>
                  <p className="text-text-muted leading-relaxed">
                    By default, all sidebar menu options are <strong>TICKED (Visible)</strong>. If you untick any option below, that item will instantly disappear from the left sidebar navigation across all restaurant terminals.
                    <br />
                    <span className="text-amber-400 font-medium">* Settings section is main and always enabled so administrators can re-enable modules at any time.</span>
                  </p>
                </div>
              </div>

              {/* Tick Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {NAV_VISIBILITY_OPTIONS.map((item) => {
                  const isChecked = formData?.theme?.navVisibility?.[item.id] !== false;
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        'flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none',
                        isChecked
                          ? 'bg-blue-500/10 border-blue-500/40 text-text-primary shadow-sm shadow-blue-500/5'
                          : 'bg-bg-tertiary border-border/60 text-text-muted hover:border-border'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const current = formData?.theme?.navVisibility || {};
                          updateThemeField({ navVisibility: { ...current, [item.id]: e.target.checked } });
                        }}
                        className="w-4 h-4 mt-0.5 rounded border-border text-blue-500 focus:ring-blue-500/20 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn('text-xs font-bold truncate', isChecked ? 'text-text-primary' : 'text-text-muted')}>
                            {item.label}
                          </span>
                          {item.badge && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-semibold shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{item.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end pt-4 border-t border-border/40">
                <Button size="sm" icon={<Save className="w-4 h-4" />} onClick={handleSave}>
                  Save Sidebar Settings
                </Button>
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
                  <select className="glass-input h-10 text-xs" value={formData.taxMode || 'exclusive'} onChange={(e) => setFormData({ ...formData, taxMode: e.target.value })}>
                    <option value="exclusive">Exclusive (Add tax on top of prices)</option>
                    <option value="inclusive">Inclusive (Prices already contain tax)</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 py-2">
                   <input type="checkbox" id="interstate" checked={formData.isInterState} onChange={(e) => setFormData({...formData, isInterState: e.target.checked})} className="w-4 h-4 rounded border-border" />
                   <label htmlFor="interstate" className="text-sm font-bold text-text-primary cursor-pointer">Inter-State Supply (Apply IGST only)</label>
                </div>

                {!formData.isInterState ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="SGST Rate (%)" type="number" value={formData.sgstRate || 0} onChange={(e) => setFormData({ ...formData, sgstRate: Number(e.target.value) })} />
                    <Input label="CGST Rate (%)" type="number" value={formData.cgstRate || 0} onChange={(e) => setFormData({ ...formData, cgstRate: Number(e.target.value) })} />
                  </div>
                ) : (
                  <Input label="IGST Rate (%)" type="number" value={formData.igstRate || 0} onChange={(e) => setFormData({ ...formData, igstRate: Number(e.target.value) })} />
                )}
                
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
                 <h2 className="text-base font-bold text-text-primary">WhatsApp & Webhooks</h2>
                 <p className="text-xs text-text-muted mt-1">Configure WhatsApp bill sharing and external webhook endpoints</p>
               </div>
               <div className="space-y-5 max-w-2xl">
                  <div className="p-4 rounded-xl bg-bg-tertiary border border-border/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-text-primary">Enable WhatsApp Sharing</p>
                        <p className="text-[11px] text-text-muted">Send bills and test messages using WhatsApp Cloud API</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setWhatsappForm((p) => ({ ...p, enabled: !p.enabled }))}
                        className={cn('relative w-11 h-6 rounded-full transition-colors', whatsappForm.enabled ? 'bg-blue-600' : 'bg-bg-primary border border-border')}
                      >
                        <span className={cn('absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform', whatsappForm.enabled ? 'translate-x-5' : 'translate-x-1')} />
                      </button>
                    </div>
                    <Input
                      label="WhatsApp Access Token"
                      type="password"
                      value={whatsappForm.token}
                      onChange={(e) => setWhatsappForm((p) => ({ ...p, token: e.target.value }))}
                      placeholder="Paste Meta Cloud API token"
                    />
                    <Input
                      label="Phone Number ID"
                      value={whatsappForm.phoneNumberId}
                      onChange={(e) => setWhatsappForm((p) => ({ ...p, phoneNumberId: e.target.value }))}
                      placeholder="Meta WhatsApp phone number ID"
                    />
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text-muted uppercase">Message Template</label>
                      <textarea
                        value={whatsappForm.template}
                        onChange={(e) => setWhatsappForm((p) => ({ ...p, template: e.target.value }))}
                        className="glass-input w-full min-h-[130px] text-xs"
                        placeholder="Use placeholders like {{customerName}}, {{orderNumber}}, {{total}}, {{items}}"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={saveWhatsappSettings}>Save WhatsApp Settings</Button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-bg-tertiary border border-border/50 space-y-3">
                    <p className="text-sm font-bold text-text-primary">Test WhatsApp Message</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        label="Test Phone"
                        value={whatsappForm.testPhone}
                        onChange={(e) => setWhatsappForm((p) => ({ ...p, testPhone: e.target.value }))}
                        placeholder="91XXXXXXXXXX"
                      />
                      <Input
                        label="Message"
                        value={whatsappForm.testMessage}
                        onChange={(e) => setWhatsappForm((p) => ({ ...p, testMessage: e.target.value }))}
                        placeholder="Hello from Restaurant SaaS"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" variant="secondary" onClick={sendWhatsappTest}>Send Test</Button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-bg-tertiary border border-border/50 space-y-3">
                    <p className="text-sm font-bold text-text-primary">Webhook URLs</p>
                    <p className="text-[11px] text-text-muted">Enter one URL per line</p>
                    <textarea
                      value={whatsappForm.webhookText}
                      onChange={(e) => setWhatsappForm((p) => ({ ...p, webhookText: e.target.value }))}
                      className="glass-input w-full min-h-[120px] text-xs"
                      placeholder="https://example.com/webhooks/orders"
                    />
                    <div className="flex justify-end">
                      <Button size="sm" variant="secondary" onClick={saveWebhookUrls}>Save Webhooks</Button>
                    </div>
                  </div>
               </div>
             </div>
          )}

          {activeTab === 'security' && (
             <div className="space-y-6">
               <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">System Security & Access</h2>
                 <p className="text-xs text-text-muted mt-1">Configure PINs and access modes</p>
               </div>
               <div className="max-w-md space-y-4">
                  <Input 
                     label="Main POS Delete Override PIN" 
                     type="password" 
                     placeholder="e.g. 1992"
                     value={formData.posDeletePassword || ''} 
                     onChange={(e) => setFormData({ ...formData, posDeletePassword: e.target.value })} 
                  />
                  <p className="text-[10px] text-text-muted">This PIN is required when deleting items or reducing quantity on the Main POS billing screen.</p>
               </div>
             </div>
          )}



          {activeTab === 'ordering' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                <h2 className="text-base font-bold text-text-primary">Ordering Configuration</h2>
                <p className="text-xs text-text-muted mt-1">Control how orders are created and managed</p>
              </div>
              <div className="max-w-lg space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Order Number Prefix" value={formData.orderPrefix || 'ORD'} onChange={e => setFormData({ ...formData, orderPrefix: e.target.value })} placeholder="e.g. ORD, INV" />
                  <Input label="KOT Prefix" value={formData.kotPrefix || 'KOT'} onChange={e => setFormData({ ...formData, kotPrefix: e.target.value })} placeholder="e.g. KOT, TKT" />
                </div>
                <Input label="Minimum Order Amount ($)" type="number" value={formData.minOrderAmount || 0} onChange={e => setFormData({ ...formData, minOrderAmount: Number(e.target.value) })} />
                <Input label="Delivery Fee ($)" type="number" value={formData.deliveryFee || 0} onChange={e => setFormData({ ...formData, deliveryFee: Number(e.target.value) })} />
                {[
                  { key: 'allowDineIn', label: 'Allow Dine-In Orders', desc: 'Accept table-based dine in orders' },
                  { key: 'allowDelivery', label: 'Allow Delivery Orders', desc: 'Accept delivery orders from customers' },
                  { key: 'allowPickup', label: 'Allow Pickup Orders', desc: 'Accept takeaway / pickup orders' },
                ].map(toggle => (
                  <label key={toggle.key} className="flex items-center justify-between p-4 rounded-xl bg-bg-tertiary border border-border/50 cursor-pointer hover:bg-bg-hover transition-colors">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{toggle.label}</p>
                      <p className="text-[11px] text-text-muted mt-0.5">{toggle.desc}</p>
                    </div>
                    <div
                      onClick={() => setFormData({ ...formData, [toggle.key]: !formData[toggle.key] })}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${formData[toggle.key] ? 'bg-blue-600' : 'bg-bg-primary border border-border'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${formData[toggle.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                <h2 className="text-base font-bold text-text-primary">Notification Settings</h2>
                <p className="text-xs text-text-muted mt-1">Configure email and push notification alerts</p>
              </div>
              <div className="max-w-lg space-y-3">
                {[
                  { key: 'notifyNewOrder', label: 'New Order Alert', desc: 'Email alert when a new order is placed' },
                  { key: 'notifyLowStock', label: 'Low Stock Warning', desc: 'Alert when inventory item falls below threshold' },
                  { key: 'notifyDailySummary', label: 'Daily Sales Summary', desc: 'Receive daily report via email at midnight' },
                  { key: 'notifyReservation', label: 'Reservation Confirmation', desc: 'Email alert when a new reservation is made' },
                  { key: 'notifySMS', label: 'SMS Notifications', desc: 'Send SMS alerts for critical events (requires SMS provider)' },
                ].map(toggle => (
                  <label key={toggle.key} className="flex items-center justify-between p-4 rounded-xl bg-bg-tertiary border border-border/50 cursor-pointer hover:bg-bg-hover transition-colors">
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 text-text-muted shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{toggle.label}</p>
                        <p className="text-[11px] text-text-muted mt-0.5">{toggle.desc}</p>
                      </div>
                    </div>
                    <div
                      onClick={() => setFormData({ ...formData, [toggle.key]: !formData[toggle.key] })}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${formData[toggle.key] ? 'bg-blue-600' : 'bg-bg-primary border border-border'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${formData[toggle.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                    </div>
                  </label>
                ))}
                <div className="pt-2">
                  <Input label="Notification Email" type="email" placeholder="manager@yourrestaurant.com" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="border-b border-border/50 pb-4">
                <h2 className="text-base font-bold text-text-primary">Theme & Appearance</h2>
                <p className="text-xs text-text-muted mt-1">Customize the look and feel of your restaurant's admin and customer site</p>
              </div>
              <div className="max-w-lg space-y-6">
                {/* Color Picker */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-3 block">Primary Brand Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData?.theme?.brandColor || '#2563eb'}
                      onChange={(e) => updateThemeField({ brandColor: e.target.value })}
                      className="w-12 h-12 rounded-xl border border-border cursor-pointer bg-transparent"
                    />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-text-primary">Brand Color</p>
                      <p className="text-[11px] text-text-muted">Used for buttons, highlights and accent elements</p>
                    </div>
                  </div>
                </div>
                {/* Theme mode */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-3 block">Interface Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        updateThemeField({ mode: 'dark' });
                        setTheme('dark');
                      }}
                      className={`p-4 rounded-xl border text-sm font-semibold transition-all ${formData?.theme?.mode !== 'light' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border text-text-secondary hover:border-border/80 hover:bg-bg-hover'}`}
                    >
                      🌙 Dark Mode
                    </button>
                    <button
                      onClick={() => {
                        updateThemeField({ mode: 'light' });
                        setTheme('light');
                      }}
                      className={`p-4 rounded-xl border text-sm font-semibold transition-all ${formData?.theme?.mode === 'light' ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-border text-text-secondary hover:border-border/80 hover:bg-bg-hover'}`}
                    >
                      ☀️ Light Mode
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-text-secondary mb-3 block">Sidebar Page Visibility (Default ON)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {NAV_VISIBILITY_OPTIONS.map((item) => {
                      const isSettingsItem = item.id === 'settings';
                      const enabled = isSettingsItem ? true : formData?.theme?.navVisibility?.[item.id] !== false;
                      return (
                        <label key={item.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-bg-tertiary px-3 py-2">
                          <span className="text-xs font-medium text-text-primary">{item.label}</span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={isSettingsItem}
                            onChange={(e) => {
                              if (isSettingsItem) return;
                              const current = formData?.theme?.navVisibility || {};
                              updateThemeField({ navVisibility: { ...current, [item.id]: e.target.checked } });
                            }}
                            className="w-4 h-4 rounded border-border"
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-text-muted">When OFF, the page is hidden from the sidebar for your restaurant users. Settings is always ON to avoid lockout.</p>
                </div>

                {/* Logo upload */}
                <div>
                  <label className="text-xs font-medium text-text-secondary mb-3 block">Restaurant Logo</label>
                  <div className="border-2 border-dashed border-border/50 rounded-xl p-6 flex flex-col items-center gap-3 text-center hover:border-blue-500/30 transition-colors cursor-pointer">
                    <Palette className="w-10 h-10 text-text-muted/30" />
                    <div>
                      <p className="text-sm font-medium text-text-secondary">Drag & drop or click to upload</p>
                      <p className="text-[11px] text-text-muted">PNG, JPG up to 2MB. Recommended: 200×200px</p>
                    </div>
                    <Button size="sm" variant="secondary">Choose File</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bill-settings' && (
            <BillSettings />
          )}

          {activeTab === 'barcode' && (
            <BarcodeSettings />
          )}

          {activeTab === 'inventory' && (
            <Units />
          )}

          {activeTab === 'shifts' && (
            <div className="space-y-6 animate-in">
              <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">Operational Shifts</h2>
                 <p className="text-xs text-text-muted mt-1">Configure business operating shifts and hours of operation</p>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {shifts.map((s: any, idx: number) => (
                    <div key={idx} className={cn(
                      "p-4 rounded-xl border transition-all flex flex-col justify-between min-h-[140px]",
                      s.isActive ? "bg-blue-500/5 border-blue-500/30" : "bg-bg-tertiary border-border/50"
                    )}>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-text-primary uppercase tracking-wide">{s.name}</p>
                          <button
                            onClick={() => {
                              const updated = shifts.filter((_, i) => i !== idx);
                              setShifts(updated);
                            }}
                            className="text-text-muted hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p className="text-[11px] text-text-muted">Working Hours:</p>
                        <p className="text-lg font-black text-text-primary mt-1">{s.startTime} - {s.endTime}</p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-border/30 mt-3">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Status</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={s.isActive}
                            onChange={(e) => {
                              const updated = shifts.map((item, i) => i === idx ? { ...item, isActive: e.target.checked } : item);
                              setShifts(updated);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-bg-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-xl bg-bg-tertiary border border-border/50 space-y-4 max-w-lg">
                  <p className="text-xs font-bold text-text-primary uppercase">Add New Shift</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input id="new-shift-name" label="Shift Name" placeholder="e.g. Morning" />
                    <Input id="new-shift-start" label="Start Time" type="time" defaultValue="08:00" />
                    <Input id="new-shift-end" label="End Time" type="time" defaultValue="16:00" />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        const nameIn = document.getElementById('new-shift-name') as HTMLInputElement;
                        const startIn = document.getElementById('new-shift-start') as HTMLInputElement;
                        const endIn = document.getElementById('new-shift-end') as HTMLInputElement;
                        
                        const name = nameIn?.value.trim();
                        const start = startIn?.value;
                        const end = endIn?.value;

                        if (!name) {
                          toast.error('Enter a shift name');
                          return;
                        }

                        setShifts([
                          ...shifts,
                          { name, startTime: start, endTime: end, isActive: true }
                        ]);

                        nameIn.value = '';
                        toast.success(`Shift ${name} added!`);
                      }}
                    >
                      Add Shift
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted italic">Added shifts are configured locally. Click Save Changes at the top right to save configuration permanently.</p>
              </div>
            </div>
          )}

          {activeTab === 'cancellation' && (
            <div className="space-y-6 animate-in">
              <div className="border-b border-border/50 pb-4">
                 <h2 className="text-base font-bold text-text-primary">Cancellation Reasons</h2>
                 <p className="text-xs text-text-muted mt-1">Manage the list of standard reasons shown when cancelling an order or item</p>
              </div>
              <div className="max-w-md space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted uppercase">Defined Reasons</label>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                    {(formData.cancellationReasons || '')
                      .split(',')
                      .map((x: string) => x.trim())
                      .filter(Boolean)
                      .map((reason: string, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-bg-tertiary border border-border/50 group hover:border-red-500/30 transition-all animate-in fade-in zoom-in-95">
                          <span className="text-xs font-semibold text-text-primary">{reason}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const list = (formData.cancellationReasons || '')
                                .split(',')
                                .map((x: string) => x.trim())
                                .filter(Boolean);
                              const updated = list.filter((_: any, i: number) => i !== idx).join(', ');
                              setFormData({ ...formData, cancellationReasons: updated });
                            }}
                            className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    {!(formData.cancellationReasons || '').trim() && (
                      <p className="text-xs text-text-muted italic p-4 text-center border border-dashed border-border rounded-xl">No reasons configured. Add some below.</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    id="new-cancellation-reason"
                    placeholder="e.g. Delayed service, Burnt/Cold food"
                    className="glass-input flex-1 px-3 h-10 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const input = e.currentTarget;
                        const value = input.value.trim();
                        if (value) {
                          const list = (formData.cancellationReasons || '')
                            .split(',')
                            .map((x: string) => x.trim())
                            .filter(Boolean);
                          if (list.includes(value)) {
                            toast.error('Reason already exists');
                            return;
                          }
                          list.push(value);
                          setFormData({ ...formData, cancellationReasons: list.join(', ') });
                          input.value = '';
                        }
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById('new-cancellation-reason') as HTMLInputElement;
                      const value = input?.value.trim();
                      if (value) {
                        const list = (formData.cancellationReasons || '')
                          .split(',')
                          .map((x: string) => x.trim())
                          .filter(Boolean);
                        if (list.includes(value)) {
                          toast.error('Reason already exists');
                          return;
                        }
                        list.push(value);
                        setFormData({ ...formData, cancellationReasons: list.join(', ') });
                        input.value = '';
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                <p className="text-[10px] text-text-muted italic">Press Enter or click Add to append a new cancellation reason. Remember to save changes at the top right.</p>
              </div>
            </div>
          )}

          {/* Fallback for remaining empty tabs */}
          {activeTab === 'backup' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="border-b border-border/50 pb-4">
                <h2 className="text-base font-bold text-text-primary">System Backup & Restore</h2>
                <p className="text-xs text-text-muted mt-1">Manage database snapshots, export database backups, or restore them.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export card */}
                <div className="p-6 rounded-2xl bg-bg-tertiary border border-border/50 flex flex-col justify-between space-y-4 hover:border-blue-500/30 transition-all">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                      <Database size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-text-primary">Download System Backup</h3>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Generate and download a copy of the SQLite database containing all menus, item lists, branches, staff accounts, customers, active shifts, settings, and orders.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Button 
                      onClick={handleDownloadBackup} 
                      disabled={isExporting || isRestoring}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      <Download size={14} />
                      {isExporting ? 'Generating...' : 'Download Backup (.db)'}
                    </Button>
                  </div>
                </div>

                {/* Import card */}
                <div className="p-6 rounded-2xl bg-bg-tertiary border border-border/50 flex flex-col justify-between space-y-4 hover:border-red-500/30 transition-all">
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
                      <ShieldCheck size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-text-primary">Restore Database Backup</h3>
                    <p className="text-xs text-text-muted leading-relaxed">
                      Upload a previously saved `.db` backup file to restore the entire project database. Note that this action will completely overwrite the existing data.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border/50 rounded-xl cursor-pointer hover:border-red-500/30 transition-colors bg-bg-primary/50">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                        <UploadCloud size={20} className="text-text-muted mb-1" />
                        <p className="text-[11px] text-text-secondary font-medium px-2 truncate max-w-full">
                          {backupFile ? backupFile.name : 'Click to select .db backup file'}
                        </p>
                        <p className="text-[9px] text-text-muted mt-0.5">SQLite database file only</p>
                      </div>
                      <input 
                        type="file" 
                        accept=".db,.sqlite" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setBackupFile(file);
                        }}
                        disabled={isRestoring}
                      />
                    </label>

                    {backupFile && (
                      <div className="flex gap-2">
                        <Button 
                          variant="danger" 
                          onClick={handleRestoreBackup} 
                          disabled={isRestoring}
                          className="flex-1 flex items-center justify-center gap-2"
                        >
                          {isRestoring ? 'Restoring...' : 'Restore Now'}
                        </Button>
                        <Button 
                          variant="secondary" 
                          onClick={() => setBackupFile(null)} 
                          disabled={isRestoring}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 max-w-2xl">
                <p className="text-[10px] uppercase font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                  ⚠️ Safety Warning
                </p>
                <ul className="list-disc pl-4 text-[10px] text-text-muted space-y-1">
                  <li>Ensure no active orders or checkouts are being processed by terminals before executing a restore.</li>
                  <li>Always export a fresh backup before uploading any files in case you need to revert.</li>
                  <li>Uploading an invalid or corrupted file might cause the system database connection to fail.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'updates' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="border-b border-border/50 pb-4">
                <h2 className="text-lg font-bold text-text-primary">Software & System Updates</h2>
                <p className="text-xs text-text-muted mt-1">
                  Manage software updates automatically from GitHub Releases without data loss.
                </p>
              </div>

              {/* Update Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-bg-tertiary/40 border border-border/60 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Current Installed Version</p>
                      <p className="text-lg font-extrabold text-text-primary">v1.0.0</p>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted space-y-1 pt-1">
                    <p>• <strong>Repository:</strong> SmartGoNext/restaurant-pos</p>
                    <p>• <strong>Channel:</strong> GitHub Releases (Production)</p>
                    <p>• <strong>Auto-Check:</strong> Runs on startup & every 45 mins when online</p>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center gap-2.5 text-emerald-400">
                    <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-emerald-400/80">Zero Data Loss Architecture</p>
                      <p className="text-sm font-bold text-emerald-400">Database & Orders 100% Protected</p>
                    </div>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Updates only replace software code. Your database, bills, kitchen KOTs, customers, and settings live safely in Windows AppData and will never be overwritten.
                  </p>
                </div>
              </div>

              {/* Developer Workflow Guide */}
              <div className="p-5 rounded-2xl bg-bg-secondary border border-border/60 space-y-3">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Info size={16} className="text-primary" />
                  How You Release Updates in the Future
                </h3>
                <div className="space-y-2 text-xs text-text-muted leading-relaxed">
                  <p>1. Make whatever changes, bug fixes, or new features you want in your code.</p>
                  <p>2. Change the version number in <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-primary font-mono">package.json</code> (e.g. from <span className="text-amber-400">1.0.0</span> to <span className="text-emerald-400">1.0.1</span>).</p>
                  <p>3. Run: <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-primary font-mono">npm run release</code></p>
                  <p>4. All client computers connected to the internet will automatically receive the update notification and can update with 1-click!</p>
                </div>
              </div>
            </div>
          )}

          {!['general', 'taxes', 'currency', 'loyalty', 'webhooks', 'ordering', 'notifications', 'appearance', 'bill-settings', 'barcode', 'inventory', 'shifts', 'cancellation', 'backup', 'updates'].includes(activeTab) && (
            <div className="flex-1 flex items-center justify-center min-h-[400px]">
               <ComingSoon moduleName={tabGroups.flatMap(g => g.tabs).find(t => t.id === activeTab)?.label || activeTab} />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
