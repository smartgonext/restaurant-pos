import { Card } from '@/components/ui/Card';

export default function InventorySettings() {
  return (
    <div className="space-y-4 animate-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Inventory Settings</h1>
        <p className="text-xs text-text-muted mt-1">Configure inventory defaults and thresholds</p>
      </div>

      <Card>
        <div className="p-8 text-center text-text-muted">Settings UI scaffolded. Add form fields and save handlers as needed.</div>
      </Card>
    </div>
  );
}
