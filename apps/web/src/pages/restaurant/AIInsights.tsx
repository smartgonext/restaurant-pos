import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { 
  Sparkles, 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  ArrowRight,
  BrainCircuit,
  Lightbulb
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function AIInsights() {
  const { data: insightsRes, isLoading, refetch } = useQuery({
    queryKey: ['ai-insights'],
    queryFn: () => api.get('/restaurant/ai-insights/analyze').then(r => r.data.data)
  });

  if (isLoading) return <div className="p-8 text-center text-text-muted">Analyzing business patterns...</div>;

  const insights = insightsRes?.insights || [];

  return (
    <div className="space-y-4 animate-in">
      <div className="relative p-6 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 overflow-hidden shadow-lg shadow-blue-500/20">
        <div className="absolute top-0 right-0 p-4 opacity-10">
           <BrainCircuit size={100} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-blue-100 font-bold uppercase tracking-widest text-[10px]">
               <Sparkles size={12} className="text-yellow-400" />
               AI-Powered Intelligence
            </div>
            <h1 className="text-xl font-black text-white">Business Insights</h1>
            <p className="text-blue-100/80 max-w-md text-xs">
              Analyzed {insightsRes?.orderCount || 'last'} orders to find growth opportunities.
            </p>
          </div>
          <Button 
            size="sm"
            className="bg-white text-blue-600 hover:bg-blue-50 border-none px-4 h-9"
            onClick={() => refetch()}
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Re-Analyze
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {insights.map((insight: any, i: number) => (
          <Card key={i} className="group flex flex-col p-4">
            <div className="flex items-center justify-between mb-3">
              <Badge 
                variant={insight.impact === 'High' ? 'danger' : insight.impact === 'Medium' ? 'warning' : 'info'}
                size="sm"
              >
                {insight.impact} Impact
              </Badge>
              <div className="p-1.5 rounded-lg bg-bg-tertiary text-primary group-hover:scale-105 transition-transform">
                {insight.type === 'revenue' ? <TrendingUp size={16} /> : insight.type === 'ops' ? <Users size={16} /> : <ShoppingBag size={16} />}
              </div>
            </div>
            <h3 className="text-sm font-bold text-text-primary mb-1.5 group-hover:text-primary transition-colors">
              {insight.title}
            </h3>
            <p className="text-[11px] text-text-secondary leading-relaxed flex-1">
              {insight.description}
            </p>
            <div className="pt-4 mt-auto">
               <button className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-wider hover:gap-2 transition-all">
                  Apply Suggestion <ArrowRight size={12} />
               </button>
            </div>
          </Card>
        ))}

        <Card className="bg-bg-tertiary/20 border-dashed flex flex-col items-center justify-center p-6 text-center h-full">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
             <Lightbulb size={20} />
          </div>
          <h4 className="text-text-primary font-bold text-sm">More Pending</h4>
          <p className="text-[10px] text-text-muted mt-1.5">
             Neural processing continues. Check back in 24 hours.
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Card className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
               <TrendingUp size={24} />
            </div>
            <div>
               <p className="text-[10px] font-medium text-text-muted uppercase">Predictive Growth</p>
               <h4 className="text-lg font-black text-text-primary">+12.4% <span className="text-[10px] font-normal text-success">Expected</span></h4>
            </div>
         </Card>
         <Card className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
               <Users size={24} />
            </div>
            <div>
               <p className="text-[10px] font-medium text-text-muted uppercase">Staffing Efficiency</p>
               <h4 className="text-lg font-black text-text-primary">88% <span className="text-[10px] font-normal text-success">Optimized</span></h4>
            </div>
         </Card>
      </div>
    </div>
  );
}
