import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Sparkles, Send, Bot, User, BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ChatMessage {
  id: string;
  role: 'bot' | 'user';
  text: string;
  timestamp: Date;
}

const CAPABILITIES = [
  {
    title: 'Sales & Revenue',
    description: 'Day-wise gross/net sales, order counts, tax and discount totals',
    examples: ['What were the sales this week?', 'Revenue for last month', 'How much did we make today?'],
  },
  {
    title: 'Top Menu Items',
    description: 'Best-selling items by quantity sold with revenue',
    examples: ['Top selling items this month', 'Which dishes sold the most?'],
  },
  {
    title: 'Orders',
    description: 'Order list with status, table, customer, and total',
    examples: ['How many orders were paid today?', 'Show pending orders'],
  },
  {
    title: 'Kitchen Performance',
    description: 'KOT delay analysis, average prep time per kitchen',
    examples: ['What are the KOT delays?', 'Kitchen performance this week'],
  },
  {
    title: 'Inventory',
    description: 'Inventory usage from order items with unit and estimated cost',
    examples: ['What inventory was used?', 'Show inventory consumption'],
  },
  {
    title: 'Category Analysis',
    description: 'Sales performance broken down by menu item category',
    examples: ['Which category has the most sales?', 'Category revenue breakdown'],
  },
  {
    title: 'Taxes',
    description: 'Tax breakdown — SGST, CGST, totals per date range',
    examples: ['How much tax did we collect?', 'Tax report this month'],
  },
  {
    title: 'Cancellations',
    description: 'Cancelled orders with reason, cancelled by, amount',
    examples: ['Why were orders cancelled?', 'How many cancellations this week?'],
  },
  {
    title: 'Refunds',
    description: 'Refund transactions with type, amount, reason, processed by',
    examples: ['How much was refunded this month?', 'Show refund details'],
  },
  {
    title: 'Delivery',
    description: 'Delivery orders, platform performance, commissions',
    examples: ['Which delivery app has most orders?', 'Delivery commissions breakdown'],
  },
  {
    title: 'Expenses',
    description: 'Total expenses, breakdown by category, payment status',
    examples: ['What were the expenses this month?', 'Show expense categories'],
  },
  {
    title: 'Reservations',
    description: 'Table reservations list and statistics',
    examples: ['How many reservations this week?', 'Show upcoming reservations'],
  },
];

export default function AIInsights() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0];

  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'intro',
    role: 'bot',
    text: "Hi! I'm your AI Restaurant Assistant powered by real-time data.\n\nI can answer questions about your **sales, orders, top items, taxes, inventory, kitchen performance, delivery, expenses, refunds, cancellations, and reservations**.\n\nSelect a date range below and start asking — for example:\n• \"What were the sales this week?\"\n• \"Top selling items last month\"\n• \"How much tax did we collect?\"",
    timestamp: new Date()
  }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [expandedCap, setExpandedCap] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleSend = async (e?: React.FormEvent, presetMsg?: string) => {
    e?.preventDefault();
    const userMsg = (presetMsg || input).trim();
    if (!userMsg) return;
    setInput('');

    setMessages(prev => [...prev, {
      id: Date.now().toString(), role: 'user', text: userMsg, timestamp: new Date()
    }]);
    setIsTyping(true);

    try {
      const res = await api.post('/restaurant/ai-insights/chat', {
        message: userMsg,
        from_date: fromDate,
        to_date: toDate,
      });
      const data = res.data.data;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: data?.text || "I'm having trouble analyzing that. Please try rephrasing.",
        timestamp: new Date()
      }]);
    } catch {
      toast.error('AI service error');
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'bot',
        text: "Service temporarily unavailable. Please try again shortly.",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-6rem)] animate-in overflow-hidden pb-2">

      {/* ── Left: Chat (70%) ──────────────────────────────────────────────── */}
      <div className="flex-[2] flex flex-col overflow-hidden">
        {/* Chat header */}
        <div className="relative p-5 rounded-2xl bg-gradient-to-br from-indigo-900 to-blue-900 border border-blue-500/20 mb-4 shrink-0">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <BrainCircuit size={80} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-blue-200 font-bold uppercase tracking-widest text-[10px] mb-1">
                <Sparkles size={11} className="text-yellow-400" /> AI-Powered Intelligence
              </div>
              <h1 className="text-lg font-black text-white">Ask Restaurant AI</h1>
              <p className="text-blue-200/70 text-xs mt-0.5">Query your data in plain English</p>
            </div>
            {/* Date range pickers */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-blue-200/60 font-bold">FROM</span>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-blue-400/50 transition-colors" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-blue-200/60 font-bold">TO</span>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-blue-400/50 transition-colors" />
              </div>
            </div>
          </div>
        </div>

        {/* Chat window */}
        <Card className="flex-1 flex flex-col overflow-hidden p-0 border-border/50 bg-bg-secondary/40">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
            {messages.map((msg) => (
              <div key={msg.id}
                className={cn('flex gap-3 max-w-3xl animate-in slide-in-from-bottom-2',
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
              >
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                  msg.role === 'user' ? 'bg-blue-600 border border-blue-500' : 'bg-indigo-900 border border-indigo-500/30')}>
                  {msg.role === 'user' ? <User size={18} className="text-white" /> : <Bot size={18} className="text-indigo-200" />}
                </div>
                <div className={cn('flex flex-col gap-1', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold uppercase tracking-wide mb-0.5">
                    {msg.role === 'bot' ? 'Restorent AI' : 'You'}
                    <span className="opacity-30">•</span>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={cn(
                    'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-sm max-w-2xl',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm border border-blue-500'
                      : 'bg-bg-tertiary border border-border/50 text-text-primary rounded-tl-sm'
                  )}>
                    {msg.text}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 animate-in fade-in">
                <div className="w-9 h-9 rounded-xl bg-indigo-900 border border-indigo-500/30 flex items-center justify-center">
                  <Bot size={18} className="text-indigo-200 animate-pulse" />
                </div>
                <div className="flex items-center px-4 py-3 bg-bg-tertiary border border-border/50 rounded-2xl rounded-tl-sm">
                  <div className="flex space-x-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="p-4 border-t border-border/30 bg-bg-tertiary/50">
            <form className="flex items-center gap-2 relative max-w-full" onSubmit={handleSend}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Ask about data from ${fromDate} to ${toDate}...`}
                disabled={isTyping}
                className="flex-1 bg-bg-secondary border border-border/50 rounded-2xl pl-4 pr-14 py-3.5 text-sm text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
              />
              <button type="submit" disabled={!input.trim() || isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Send size={16} className={cn('transition-transform', input.trim() ? '-translate-y-0.5 translate-x-0.5' : '')} />
              </button>
            </form>
            <p className="text-center mt-2 text-[10px] text-text-muted/50 font-medium tracking-widest uppercase">
              AI can make mistakes — verify important decisions
            </p>
          </div>
        </Card>
      </div>

      {/* ── Right: Capabilities Panel (30%) ──────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col overflow-hidden">
        <div className="mb-3 shrink-0 px-1">
          <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" /> Available Capabilities
          </h2>
          <p className="text-[10px] text-text-muted mt-0.5">Click an example to auto-send</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-1">
          {CAPABILITIES.map((cap) => {
            const isExpanded = expandedCap === cap.title;
            return (
              <div key={cap.title} className="bg-bg-secondary/60 border border-border/50 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedCap(isExpanded ? null : cap.title)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-bg-hover/50 transition-colors"
                >
                  <span className="text-xs font-bold text-text-primary">{cap.title}</span>
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border/30">
                    <p className="text-[10px] text-text-muted leading-relaxed mt-2 mb-2">{cap.description}</p>
                    <div className="space-y-1">
                      {cap.examples.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => handleSend(undefined, ex)}
                          className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-blue-500/5 border border-blue-500/20 text-blue-400 hover:bg-blue-500/10 transition-colors font-medium leading-snug"
                        >
                          "{ex}"
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
