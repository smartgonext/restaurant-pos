import { Card } from '@/components/ui/Card';

export default function InventoryReports() {
  return (
    <div className="space-y-4 animate-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Inventory Reports</h1>
        <p className="text-xs text-text-muted mt-1">Inventory reports and summaries (scaffold)</p>
      </div>

      <Card>
        <div className="p-8 text-center text-text-muted">Reports UI scaffolded. Add report endpoints and visualizations as needed.</div>
      </Card>
    </div>
  );
}
