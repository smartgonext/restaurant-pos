import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, RefreshCw, CheckCircle2, ShieldAlert, Radio, ArrowUpCircle, Download, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';

interface PeerStatus {
  success: boolean;
  role: 'LEADER' | 'STANDBY' | 'CLIENT';
  nodeId: string;
  localIp: string;
  httpPort: number;
  lastOrderId: number;
  activeLeader: {
    ip: string;
    httpPort: number;
    nodeId: string;
    lastOrderId: number;
  } | null;
  isLeader: boolean;
}

export function NetworkPeerStatusBadge() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data: status, isLoading } = useQuery<PeerStatus>({
    queryKey: ['lan-sync-status'],
    queryFn: async () => {
      try {
        const res = await api.get('/lan-sync/status');
        return res.data;
      } catch (err) {
        return null;
      }
    },
    refetchInterval: 6000,
    retry: false
  });

  const promoteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/lan-sync/promote');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Promoted to Main Server!');
      queryClient.invalidateQueries({ queryKey: ['lan-sync-status'] });
      setIsOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Promotion failed');
    }
  });

  const demoteMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/lan-sync/demote');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Switched to Standby Mirror mode');
      queryClient.invalidateQueries({ queryKey: ['lan-sync-status'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to switch to standby');
    }
  });

  const catchupMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/lan-sync/trigger-catchup', { includeCatalog: true });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.count || 0} orders & catalog from Master!`);
      queryClient.invalidateQueries();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Catch-up sync failed');
    }
  });

  const cloneSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/lan-sync/restore-full-snapshot');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'All items, categories and data cloned from Master! Refreshing...');
      queryClient.invalidateQueries();
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Database clone failed');
    }
  });

  if (!status || !status.success) {
    return null; // Not running in local server-pair mode
  }

  const isLeader = status.role === 'LEADER';
  const isStandby = status.role === 'STANDBY';
  const hasRemoteLeader = Boolean(status.activeLeader && status.activeLeader.ip !== status.localIp);
  const isConflict = isLeader && hasRemoteLeader;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all shadow-sm ${
          isConflict
            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40 animate-pulse'
            : isLeader
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
            : isStandby
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
            : 'bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20'
        }`}
        title="Click to view Local Network POS Cluster status"
      >
        <Radio className={`w-3.5 h-3.5 ${isConflict ? 'text-rose-400' : isLeader ? 'text-emerald-400' : 'text-amber-400'}`} />
        <span>
          {isConflict
            ? `Conflict (${status.nodeId})`
            : isLeader
            ? `Master (${status.nodeId})`
            : isStandby
            ? `Standby Mirror (${status.nodeId})`
            : `Terminal (${status.nodeId})`}
        </span>
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Local Network POS Cluster"
        size="md"
      >
        <div className="space-y-4 text-text-primary">
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between items-center py-2.5 px-3 bg-bg-tertiary rounded-xl border border-border/50">
              <span className="text-text-muted">Current Computer Role:</span>
              <span className={`font-semibold px-2.5 py-0.5 rounded text-xs ${
                isConflict
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : isLeader
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}>
                {isConflict ? `${status.role} (Role Conflict)` : status.role}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 px-3 bg-bg-tertiary rounded-xl border border-border/50">
              <span className="text-text-muted">Node Identifier:</span>
              <span className="font-mono text-text-primary font-bold">{status.nodeId}</span>
            </div>

            <div className="flex justify-between items-center py-2.5 px-3 bg-bg-tertiary rounded-xl border border-border/50">
              <span className="text-text-muted">Local IP Address:</span>
              <span className="font-mono text-indigo-400 font-bold">{status.localIp}:{status.httpPort}</span>
            </div>

            <div className="flex justify-between items-center py-2.5 px-3 bg-bg-tertiary rounded-xl border border-border/50">
              <span className="text-text-muted">Active Leader (Master):</span>
              <span className="font-mono text-emerald-400 font-bold">
                {status.activeLeader ? `${status.activeLeader.nodeId} (${status.activeLeader.ip})` : 'This Machine (Primary)'}
              </span>
            </div>

            <div className="flex justify-between items-center py-2.5 px-3 bg-bg-tertiary rounded-xl border border-border/50">
              <span className="text-text-muted">Latest Order ID:</span>
              <span className="font-mono text-text-primary font-bold">#{status.lastOrderId || 0}</span>
            </div>
          </div>

          {/* Conflict Alert */}
          {isConflict && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-rose-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Both this machine and {status.activeLeader?.nodeId} claim to be Master!</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-200/80">
                To sync items and categories from Master ({status.activeLeader?.nodeId}), switch this machine to Standby mode below.
              </p>
              <button
                onClick={() => demoteMutation.mutate()}
                disabled={demoteMutation.isPending}
                className="w-full py-2 px-3 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg font-medium text-xs transition"
              >
                Set This Machine as Standby Mirror
              </button>
            </div>
          )}

          <div className="pt-2 space-y-2.5">
            {/* 1-Click Clone from Master (Visible for Standby or if Remote Master is detected) */}
            {hasRemoteLeader && (
              <button
                onClick={() => {
                  if (confirm('This will copy all items, categories, menus and settings from the Master computer. Continue?')) {
                    cloneSnapshotMutation.mutate();
                  }
                }}
                disabled={cloneSnapshotMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl font-semibold transition text-white text-sm shadow-md"
              >
                <Download className={`w-4 h-4 ${cloneSnapshotMutation.isPending ? 'animate-bounce' : ''}`} />
                {cloneSnapshotMutation.isPending ? 'Cloning All Items & Menus...' : `📥 Clone All Items & Menus From Master (${status.activeLeader?.nodeId || 'C1'})`}
              </button>
            )}

            {(isStandby || isConflict) && (
              <>
                <button
                  onClick={() => catchupMutation.mutate()}
                  disabled={catchupMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-medium transition text-white text-sm shadow-md"
                >
                  <RefreshCw className={`w-4 h-4 ${catchupMutation.isPending ? 'animate-spin' : ''}`} />
                  {catchupMutation.isPending ? 'Syncing...' : 'Sync Latest Orders & Catalog Now'}
                </button>

                {isStandby && (
                  <button
                    onClick={() => promoteMutation.mutate()}
                    disabled={promoteMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl font-medium transition text-white text-sm shadow-md"
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    Promote This Machine to Main Server
                  </button>
                )}
              </>
            )}

            {isLeader && !hasRemoteLeader && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>This machine is the Active Leader. All tokens, items, categories and bills are live and mirrored to standby peers.</span>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

