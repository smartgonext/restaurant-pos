import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  Save, Receipt, MessageSquare, Eye, EyeOff, 
  Maximize2, Settings, Info, UploadCloud
} from 'lucide-react';
import { cn, resolveImageUrl } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function BillSettings() {
  const [formData, setFormData] = useState<any>({});
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
      setFormData((prev: any) => ({ ...prev, logoUrl }));
      toast.success('Logo uploaded successfully!', { id: toastId });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload logo image', { id: toastId });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const { data: billSettings, isLoading, refetch } = useQuery({
    queryKey: ['bill-settings'],
    queryFn: () => api.get('/restaurant/bill-settings').then((r) => r.data.data),
  });

  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data) => api.put('/restaurant/bill-settings', data),
    onSuccess: () => {
      toast.success('Bill settings saved!');
      queryClient.invalidateQueries({ queryKey: ['bill-settings'] });
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to save bill settings');
    }
  });

  useEffect(() => {
    if (billSettings && Object.keys(formData).length === 0) {
      setFormData({
        showGST: billSettings.showGST ?? false,
        showUnitForKOT: billSettings.showUnitForKOT ?? false,
        showUnitForNonKOT: billSettings.showUnitForNonKOT ?? true,
        loyaltyDiscountFormat: billSettings.loyaltyDiscountFormat ?? 'small_line',
        billHeaderText: billSettings.billHeaderText || '',
        thankYouMessage: billSettings.thankYouMessage || 'Thank you for your business!',
        showTokenNumber: billSettings.showTokenNumber ?? true,
        showRestaurantInfo: billSettings.showRestaurantInfo ?? true,
        showPhoneNumber: billSettings.showPhoneNumber ?? true,
        showLogo: billSettings.showLogo ?? true,
        logoUrl: billSettings.logoUrl || '',
        restaurantAddress: billSettings.restaurantAddress || '',
        restaurantPhone: billSettings.restaurantPhone || '',
        itemTaxDisplay: billSettings.itemTaxDisplay ?? 'none',
        upiVpa: billSettings.upiVpa || billSettings.upiId || '',
        registerAutoCloseTime: billSettings.registerAutoCloseTime || '23:59',
      });
    }
  }, [billSettings]);

  const isUpiVpaValid = (vpa?: string) => {
    if (!vpa || vpa.trim() === '') return true;
    return /^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+$/.test(vpa.trim());
  };

  const isUpiInvalid = formData.upiVpa && !isUpiVpaValid(formData.upiVpa);

  const handleSave = async () => {
    if (formData.upiVpa && !isUpiVpaValid(formData.upiVpa)) {
      toast.error('Invalid UPI / GPay VPA format! Example: yourstore@oksbi or 9876543210@paytm');
      return;
    }
    mutation.mutate(formData);
  };

  if (isLoading) return <div className="p-8 text-center text-text-muted">Loading bill settings...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-400" />
            Bill Display Settings
          </h2>
          <p className="text-xs text-text-muted mt-1">Configure how bills and receipts are displayed to customers</p>
        </div>
        <Button 
          size="sm" 
          icon={<Save className="w-3.5 h-3.5" />} 
          onClick={handleSave}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Bill Header Section */}
      <Card>
        <div className="border-b border-border/50 pb-4 mb-4">
          <h3 className="text-sm font-bold text-text-primary">Bill Header</h3>
          <p className="text-xs text-text-muted mt-1">Content displayed at the top of bills</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formData.showLogo ?? true}
                onChange={(e) => setFormData({ ...formData, showLogo: e.target.checked })}
                className="w-4 h-4 rounded border-border text-blue-500"
              />
              <span className="text-xs font-bold text-text-primary">Show Restaurant Small Logo on Top</span>
            </label>

            {formData.showLogo && (
              <div className="mt-3 p-3.5 rounded-xl bg-bg-tertiary border border-border/50 space-y-3">
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {formData.logoUrl ? (
                    <div className="w-16 h-16 rounded-lg border border-border overflow-hidden bg-white/10 shrink-0 flex items-center justify-center p-1.5 shadow-sm">
                      <img src={resolveImageUrl(formData.logoUrl)} alt="Receipt Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center shrink-0 text-text-muted text-[9px] text-center p-1 bg-bg-primary">
                      No Logo Selected
                    </div>
                  )}

                  <div className="flex-1 space-y-2 w-full">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shrink-0">
                        <UploadCloud className="w-3.5 h-3.5" />
                        {isUploadingLogo ? 'Uploading...' : 'Upload Logo File'}
                        <input 
                          type="file" 
                          accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml" 
                          onChange={handleLogoFileUpload} 
                          disabled={isUploadingLogo}
                          className="hidden" 
                        />
                      </label>

                      <Input 
                        value={formData.logoUrl || ''} 
                        onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })} 
                        placeholder="Or paste image URL (https://...)" 
                        className="flex-1 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[10px] space-y-1">
                  <p className="font-bold text-blue-400 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Recommended Logo Dimensions for Receipts & Bills:
                  </p>
                  <p className="text-text-muted leading-relaxed">
                    • <strong>Best Size:</strong> Square 300×300 px or 512×512 px (Horizontal 400×200 px).<br />
                    • <strong>Format:</strong> PNG or SVG (Transparent background renders cleanest on thermal printouts & PDF reports).<br />
                    • <strong>Max Size:</strong> 2 MB.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formData.showRestaurantInfo ?? true}
                onChange={(e) => setFormData({ ...formData, showRestaurantInfo: e.target.checked })}
                className="w-4 h-4 rounded border-border text-blue-500"
              />
              <span className="text-xs font-bold text-text-primary">Show Restaurant Name & Address</span>
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formData.showPhoneNumber ?? true}
                onChange={(e) => setFormData({ ...formData, showPhoneNumber: e.target.checked })}
                className="w-4 h-4 rounded border-border text-blue-500"
              />
              <span className="text-xs font-bold text-text-primary">Show Phone Number</span>
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formData.showTokenNumber ?? true}
                onChange={(e) => setFormData({ ...formData, showTokenNumber: e.target.checked })}
                className="w-4 h-4 rounded border-border text-blue-500"
              />
              <span className="text-xs font-bold text-text-primary">Show Token Number</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Custom Address for Bill (Optional)</label>
              <Input
                value={formData.restaurantAddress || ''}
                onChange={(e) => setFormData({ ...formData, restaurantAddress: e.target.value })}
                placeholder="Leave empty to use store profile address"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Custom Phone for Bill (Optional)</label>
              <Input
                value={formData.restaurantPhone || ''}
                onChange={(e) => setFormData({ ...formData, restaurantPhone: e.target.value })}
                placeholder="Leave empty to use store profile phone"
              />
            </div>
          </div>

          <div className={cn(
            "p-3.5 rounded-xl transition-all space-y-2 border",
            isUpiInvalid ? "bg-red-500/10 border-red-500/50" : "bg-purple-500/10 border-purple-500/20"
          )}>
            <label className="text-xs font-bold text-purple-400 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1.5">📱 UPI / GPay Merchant VPA ID (For Dynamic QR Code)</span>
              {formData.upiVpa && !isUpiInvalid && (
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">✓ Valid VPA Format</span>
              )}
            </label>
            <Input
              value={formData.upiVpa || ''}
              onChange={(e) => setFormData({ ...formData, upiVpa: e.target.value })}
              placeholder="e.g. yourstore@oksbi or 9876543210@paytm"
              className={cn(
                "text-xs font-mono font-bold transition-colors",
                isUpiInvalid && "border-red-500 text-red-400 focus:border-red-500 focus:ring-red-500"
              )}
            />
            {isUpiInvalid ? (
              <p className="text-[11px] font-bold text-red-400 flex items-center gap-1 animate-bounce">
                <span>❌</span> Invalid UPI VPA handle. Must match format username@bank (e.g. yourstore@oksbi or 9876543210@paytm)
              </p>
            ) : (
              <p className="text-[10px] text-text-muted">
                Enter your UPI ID (GPay / Paytm / PhonePe VPA). This generates the customer display QR code automatically on POS checkout.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Custom Header Text (Optional)</label>
            <textarea
              value={formData.billHeaderText || ''}
              onChange={(e) => setFormData({ ...formData, billHeaderText: e.target.value })}
              placeholder="Leave empty for default format"
              className="glass-input w-full h-20 text-xs p-2 rounded"
            />
          </div>
        </div>
      </Card>

      {/* Cash Register Auto-Close Settings */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <div className="border-b border-border/50 pb-4 mb-4">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            🏦 Cash Register Auto-Close Cutoff Time
          </h3>
          <p className="text-xs text-text-muted mt-1">Set the daily time when open register shifts automatically close</p>
        </div>

        <div className="space-y-4">
          <div className="max-w-xs">
            <label className="text-xs font-bold text-text-muted uppercase mb-1.5 block">Daily Auto-Close Time (HH:MM)</label>
            <Input
              type="time"
              value={formData.registerAutoCloseTime || '23:59'}
              onChange={(e) => setFormData({ ...formData, registerAutoCloseTime: e.target.value })}
              className="font-mono font-bold text-sm"
            />
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            ⚡ At this set cutoff time (default <strong>23:59</strong>), if any cashier register session was left open, the backend automatically calculates total cash collections, closes the shift cleanly, and resets the POS top navbar to <strong>Open Register</strong> for the next day's cashier.
          </p>
        </div>
      </Card>

      {/* Tax & Items Display */}
      <Card>
        <div className="border-b border-border/50 pb-4 mb-4">
          <h3 className="text-sm font-bold text-text-primary">Items & Taxes Display</h3>
          <p className="text-xs text-text-muted mt-1">How items and taxes appear on bills</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Item Tax Details on Bill</label>
            <select
              value={formData.itemTaxDisplay || 'none'}
              onChange={(e) => setFormData({ ...formData, itemTaxDisplay: e.target.value })}
              className="glass-input h-10 text-xs w-full max-w-md"
            >
              <option value="none">Remove Item Tax Details (Clean Bill + Summary at Bottom)</option>
              <option value="item_level">Show Per-Item Tax Percentage</option>
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={formData.showGST ?? false}
                onChange={(e) => setFormData({ ...formData, showGST: e.target.checked })}
                className="w-4 h-4 rounded border-border text-blue-500"
              />
              <span className="text-xs font-bold text-text-primary">Show GST Breakdown as Separate Lines (SGST/CGST)</span>
            </label>
            <p className="text-[10px] text-text-muted ml-6 -mt-1">If unchecked, total tax is displayed as single summary line</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={formData.showUnitForKOT ?? false}
                  onChange={(e) => setFormData({ ...formData, showUnitForKOT: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-blue-500"
                />
                <span className="text-xs font-bold text-text-primary">Show Unit for KOT Items</span>
              </label>
              <p className="text-[10px] text-text-muted ml-6">KOT items: qty, rate, name</p>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={formData.showUnitForNonKOT ?? true}
                  onChange={(e) => setFormData({ ...formData, showUnitForNonKOT: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-blue-500"
                />
                <span className="text-xs font-bold text-text-primary">Show Unit for Non-KOT Items</span>
              </label>
              <p className="text-[10px] text-text-muted ml-6">Non-KOT: unit, MRP, qty, total</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Loyalty & Footer */}
      <Card>
        <div className="border-b border-border/50 pb-4 mb-4">
          <h3 className="text-sm font-bold text-text-primary">Loyalty & Footer</h3>
          <p className="text-xs text-text-muted mt-1">Loyalty discount and thank you message</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-text-muted uppercase">Loyalty Discount Format</label>
            <select
              value={formData.loyaltyDiscountFormat || 'small_line'}
              onChange={(e) => setFormData({ ...formData, loyaltyDiscountFormat: e.target.value })}
              className="glass-input h-10 text-xs"
            >
              <option value="small_line">One line: "Loyalty Discount: -₹X"</option>
              <option value="full_section">Full section with points breakdown</option>
              <option value="hidden">Don't show on bill</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted uppercase mb-2 block">Thank You Message</label>
            <Input
              value={formData.thankYouMessage || ''}
              onChange={(e) => setFormData({ ...formData, thankYouMessage: e.target.value })}
              placeholder="Thank you for your business!"
              maxLength={80}
            />
            <p className="text-[10px] text-text-muted mt-1">Shown at bottom of bill ({formData.thankYouMessage?.length || 0}/80 chars)</p>
          </div>
        </div>
      </Card>

      {/* Preview Info */}
      <Card className="bg-blue-500/5 border-blue-500/30">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-[11px] text-text-muted leading-relaxed">
            <p className="font-bold text-blue-400 mb-1">Bill Format Preview:</p>
            <p>Restaurant Name/Address/Phone → Token # → [KOT Items: name, qty, rate] → [Non-KOT Items: name, unit, MRP, qty, total] → Subtotal → Taxes → Loyalty Discount → Total → Thank You Message</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
