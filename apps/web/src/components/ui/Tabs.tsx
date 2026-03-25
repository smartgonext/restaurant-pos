import React from 'react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: React.ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex space-x-2 border-b border-border/50 overflow-x-auto scrollbar-hide", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
            "border-b-2 hover:text-text-primary outline-none",
            activeTab === tab.id
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-text-muted"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
