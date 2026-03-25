import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { 
  Globe, 
  Settings, 
  Image as ImageIcon, 
  Layout, 
  FileText,
  ExternalLink,
  Save,
  LayoutTemplate as Header,
  Layers,
  Star,
  MessageCircle,
  Mail,
  HelpCircle,
  Tag,
  Eye,
  EyeOff
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const landingTabs = [
  { id: 'general', label: 'Disable Landing Site', icon: EyeOff },
  { id: 'more-pages', label: 'Show More Web Page', icon: Layout },
  { id: 'header', label: 'Header Page', icon: Header },
  { id: 'feature-img', label: 'Feature With Image', icon: ImageIcon },
  { id: 'feature-icon', label: 'Feature With Icon', icon: Layers },
  { id: 'reviews', label: 'Review Setting', icon: Star },
  { id: 'faq', label: 'FAQ Setting', icon: HelpCircle },
  { id: 'contact', label: 'Contact Setting', icon: Mail },
  { id: 'pricing', label: 'Price Setting', icon: Tag },
];

export default function LandingSite() {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="space-y-4 animate-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Landing Page Management</h1>
          <p className="text-xs text-text-muted mt-1">Configure your public facing platform website</p>
        </div>
        <div className="flex gap-2">
           <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />}>View Site</Button>
           <Button size="sm" icon={<Save size={14} />}>Save All</Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar */}
        <div className="w-full lg:w-56 shrink-0 space-y-1">
          {landingTabs.map((tab) => (
            <button 
              key={tab.id} 
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left',
                activeTab === tab.id 
                  ? 'bg-blue-500/10 text-blue-400' 
                  : 'text-text-muted hover:bg-bg-tertiary hover:text-text-secondary'
              )}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <Card className="flex-1 min-h-[600px]">
           {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                   <h3 className="text-base font-bold text-text-primary mb-1">General Settings</h3>
                   <p className="text-xs text-text-muted">Control landing site visibility and base meta data</p>
                </div>
                <div className="p-4 rounded-xl bg-bg-tertiary border border-border/50 flex items-center justify-between">
                   <div className="space-y-0.5">
                      <p className="text-sm font-bold text-text-primary">Enable Public Landing Site</p>
                      <p className="text-[10px] text-text-muted">Disable this if you want to use a custom or external landing page</p>
                   </div>
                   <input type="checkbox" defaultChecked className="w-5 h-5 rounded border-border" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
                    <Input label="App Name" defaultValue="RestaurantSaaS" />
                    <Input label="Site Color Palette" defaultValue="#3b82f6" />
                    <Input label="Facebook URL" placeholder="https://..." />
                    <Input label="Twitter URL" placeholder="https://..." />
                </div>
              </div>
           )}

           {activeTab === 'pricing' && (
              <div className="space-y-6">
                 <div>
                    <h3 className="text-base font-bold text-text-primary mb-1">Pricing Section</h3>
                    <p className="text-xs text-text-muted">Manage how subscription plans appear on top</p>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Section Title" defaultValue="Simple, Transparent Pricing" />
                    <Input label="Section Subtitle" defaultValue="Choose a plan that fits your business needs" />
                 </div>
                 <div className="p-12 border-2 border-dashed border-border/50 rounded-2xl text-center">
                    <p className="text-xs text-text-muted italic">Plans are automatically synced from "Packages" module.</p>
                 </div>
              </div>
           )}

           {/* Fallback for other tabs */}
           {!['general', 'pricing'].includes(activeTab) && (
             <div className="h-full flex flex-col items-center justify-center py-20 bg-bg-tertiary/20 rounded-2xl border border-dashed border-border/50">
                <Layout size={48} className="text-text-muted/30 mb-4" />
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">Section Editor: {activeTab.replace('-', ' ')}</h3>
                <p className="text-[10px] text-text-muted mt-2 max-w-xs text-center leading-relaxed">
                   The builder module for this section is currently being updated for better drag-and-drop support.
                </p>
                <div className="mt-8 flex gap-4">
                   <div className="w-16 h-1 bg-blue-500 rounded-full animate-pulse" />
                   <div className="w-16 h-1 bg-blue-500/30 rounded-full" />
                   <div className="w-16 h-1 bg-blue-500/30 rounded-full" />
                </div>
             </div>
           )}
        </Card>
      </div>
    </div>
  );
}
