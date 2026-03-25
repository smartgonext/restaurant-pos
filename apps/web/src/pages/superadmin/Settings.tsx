import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Save, Globe, Mail, Shield } from 'lucide-react';

export default function SuperAdminSettings() {
  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">System Settings</h1>
          <p className="text-sm text-text-muted mt-1">Global platform configuration</p>
        </div>
        <Button icon={<Save className="w-4 h-4" />}>Save Global Settings</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Globe className="w-5 h-5 text-blue-400" /> Platform Details
          </div>
          <Input label="Platform Name" defaultValue="Restaurant SaaS" />
          <Input label="Support Email" defaultValue="support@restaurant-saas.com" />
          <Input label="Default Currency" defaultValue="USD" />
          <Input label="Default Timezone" defaultValue="UTC" />
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Mail className="w-5 h-5 text-purple-400" /> SMTP Configuration
          </div>
          <Input label="SMTP Host" defaultValue="smtp.mailgun.org" />
          <Input label="SMTP Port" defaultValue="587" />
          <Input label="SMTP User" defaultValue="postmaster@yourdomain.com" />
          <Input label="SMTP Password" type="password" defaultValue="********" />
        </Card>

        <Card className="space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 text-lg font-semibold text-text-primary mb-4">
            <Shield className="w-5 h-5 text-success" /> Security & Features
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary">
              <span className="text-sm">Auto-approve New Restaurants</span>
              <input type="checkbox" className="w-4 h-4 rounded" />
            </label>
            <label className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary">
              <span className="text-sm">Enable AI Insights Globally</span>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
            </label>
            <label className="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary">
              <span className="text-sm">Enable WhatsApp Integrations</span>
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
            </label>
          </div>
        </Card>
      </div>
    </div>
  );
}
