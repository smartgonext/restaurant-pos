import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Plus, Edit2, Trash2, ListTree } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';

const initialModifiers = [
  { id: 1, name: 'Crust Type', required: true, multiple: false, items: 4, options: [{name: 'Thin', price: 0}, {name: 'Cheese Burst', price: 2.5}] },
  { id: 2, name: 'Extra Toppings', required: false, multiple: true, items: 12, options: [{name: 'Extra Cheese', price: 1.5}, {name: 'Olives', price: 0.5}] },
  { id: 3, name: 'Spice Level', required: true, multiple: false, items: 18, options: [{name: 'Mild', price: 0}, {name: 'Medium', price: 0}, {name: 'Hot', price: 0}] },
];

export default function Modifiers() {
  const [modifiers, setModifiers] = useState(initialModifiers);

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Menu Modifiers</h1>
          <p className="text-sm text-text-muted mt-1">Manage add-ons, variations, and required choices</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />}>Create Modifier Group</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {modifiers.map((mod) => (
          <Card key={mod.id} className="flex flex-col h-full hover:border-blue-500/30 transition-all border-border/50">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <h3 className="font-bold text-lg text-text-primary mb-1">{mod.name}</h3>
                 <div className="flex gap-2">
                   {mod.required && <Badge variant="danger">Required</Badge>}
                   {mod.multiple && <Badge variant="info">Multi-Select</Badge>}
                 </div>
               </div>
               <div className="flex gap-1 bg-bg-tertiary p-1 rounded-lg border border-border">
                 <button className="p-1.5 text-blue-400 hover:bg-bg-hover rounded-md transition-colors"><Edit2 className="w-4 h-4" /></button>
                 <button className="p-1.5 text-danger hover:bg-danger/20 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
               </div>
             </div>

             <div className="bg-bg-tertiary/50 rounded-xl p-4 border border-border/50 flex-1 mb-4">
               <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Options ({mod.options.length}+)</h4>
               <div className="space-y-2">
                 {mod.options.map((opt, i) => (
                   <div key={i} className="flex justify-between items-center text-sm bg-bg-secondary p-2 rounded-md">
                     <span className="text-text-primary">{opt.name}</span>
                     <span className="text-success font-medium">{opt.price === 0 ? 'Free' : `+${formatCurrency(opt.price)}`}</span>
                   </div>
                 ))}
               </div>
             </div>

             <div className="mt-auto pt-4 border-t border-border/50 flex items-center gap-2 text-sm text-text-muted">
                <ListTree className="w-4 h-4 text-blue-400" />
                Linked to <strong className="text-text-primary">{mod.items} Menu Items</strong>
             </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
