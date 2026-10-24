import React, { useState, useEffect } from 'react';
import { Sparkles, Download, RefreshCw, CheckCircle2, ShieldCheck, ArrowUpCircle, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import type { UpdaterStatusPayload } from '@/types/electron';

export function SoftwareUpdateBadge() {
  const [appVersion, setAppVersion] = useState<string>('1.0.0');
  const [status, setStatus] = useState<UpdaterStatusPayload>({ status: 'up-to-date' });
  const [isOpen, setIsOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // 1. Get current app version
    if (window.electron?.getAppVersion) {
      window.electron.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      }).catch(() => {});
    }

    // 2. Subscribe to electron auto-updater events
    if (window.electron?.onUpdaterStatus) {
      const unsubscribe = window.electron.onUpdaterStatus((payload) => {
        console.log('[Updater] Status update:', payload);
        setStatus(payload);

        if (payload.status === 'available') {
          toast.success(`🎉 New Software Update v${payload.version || ''} available!`, {
            duration: 6000,
            icon: '🚀'
          });
        }

        if (payload.status === 'downloaded') {
          setIsDownloading(false);
          toast.success('Update ready to install! Restart to apply changes.', {
            duration: 8000,
            icon: '✅'
          });
        }

        if (payload.status === 'error') {
          setIsDownloading(false);
          setIsChecking(false);
        }
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, []);

  const handleCheckUpdates = async () => {
    if (!window.electron?.checkForUpdates) {
      toast('Running in browser mode. Desktop app auto-updates in Windows executable.');
      return;
    }

    setIsChecking(true);
    toast('Checking for updates on GitHub...', { icon: '🔍' });
    try {
      const res = await window.electron.checkForUpdates();
      setIsChecking(false);
      if (!res.success) {
        toast.error(res.error ? `Update check: ${res.error}` : 'Unable to check for updates. Check internet connection.');
      }
    } catch (err: any) {
      setIsChecking(false);
      toast.error('Network error checking updates. Ensure internet is connected.');
    }
  };

  const handleDownload = async () => {
    if (!window.electron?.downloadUpdate) return;
    setIsDownloading(true);
    toast('Downloading update in the background...', { icon: '📥' });
    try {
      const res = await window.electron.downloadUpdate();
      if (!res.success) {
        setIsDownloading(false);
        toast.error(res.error || 'Failed to start download');
      }
    } catch (err: any) {
      setIsDownloading(false);
      toast.error('Download error: ' + err.message);
    }
  };

  const handleInstall = async () => {
    if (!window.electron?.installUpdate) return;
    toast('Creating safety backup and applying update...', { icon: '🛡️' });
    try {
      await window.electron.installUpdate();
    } catch (err: any) {
      toast.error('Error applying update: ' + err.message);
    }
  };

  // Determine badge styling based on state
  const hasUpdate = status.status === 'available' || status.status === 'downloading' || status.status === 'downloaded';
  const isDownloaded = status.status === 'downloaded';

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all shadow-sm ${
          isDownloaded
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 animate-pulse'
            : hasUpdate
            ? 'bg-gradient-to-r from-violet-600/20 to-indigo-600/20 text-indigo-300 border border-indigo-500/40 hover:border-indigo-500/60 animate-bounce'
            : 'bg-bg-tertiary/60 text-text-muted hover:text-text-primary border border-border/50 hover:bg-bg-hover'
        }`}
        title="Check software updates"
      >
        {isDownloaded ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        ) : hasUpdate ? (
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        ) : (
          <ArrowUpCircle className="w-3.5 h-3.5 text-text-muted" />
        )}
        <span>
          {isDownloaded
            ? `Install v${status.version || 'New'}`
            : hasUpdate
            ? `Update v${status.version || ''}`
            : `v${appVersion}`}
        </span>
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Software & System Updates"
        size="md"
      >
        <div className="space-y-4 text-text-primary">
          {/* Header Info Banner */}
          <div className="flex items-center justify-between p-3.5 bg-bg-tertiary rounded-xl border border-border/50">
            <div>
              <p className="text-xs text-text-muted font-medium">Installed Version</p>
              <p className="text-base font-bold text-text-primary">v{appVersion}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted font-medium">Channel</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                GitHub Release (SmartGoNext)
              </span>
            </div>
          </div>

          {/* 🛡️ 100% Data Loss Protection Guarantee Notice */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2.5 text-xs text-emerald-300">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-300">100% Data Loss Guarantee</p>
              <p className="text-emerald-300/80 text-[11px] leading-relaxed mt-0.5">
                All your orders, tokens, menu items, prices, and configurations are stored separately in your Windows AppData and are <strong>never touched</strong> by software updates.
              </p>
            </div>
          </div>

          {/* Status Details */}
          {status.status === 'available' && (
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  New Version v{status.version} Available!
                </span>
                {status.isFastUpdate ? (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
                    ⚡ Fast 15s Update (~1.2 MB)
                  </span>
                ) : (
                  <span className="text-[10px] text-indigo-200/60">
                    {status.releaseDate ? new Date(status.releaseDate).toLocaleDateString() : 'Latest'}
                  </span>
                )}
              </div>
              <div className="bg-bg-secondary/60 p-2.5 rounded-lg border border-border/40 text-[11px] text-text-secondary max-h-32 overflow-y-auto">
                <p className="font-semibold text-text-primary mb-1">Release Highlights:</p>
                <p className="whitespace-pre-line text-text-muted">{status.releaseNotes || 'Bug fixes, UI enhancements, and performance updates.'}</p>
              </div>
            </div>
          )}

          {status.status === 'downloading' && (
            <div className="p-3.5 bg-bg-tertiary rounded-xl border border-border/50 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-indigo-400 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Downloading Update...
                </span>
                <span className="font-mono font-bold text-text-primary">{status.percent || 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-bg-secondary rounded-full overflow-hidden border border-border/50">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(status.percent || 0, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-text-muted text-right">
                {status.bytesPerSecond ? `${(status.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s` : 'Downloading from GitHub...'}
              </p>
            </div>
          )}

          {status.status === 'downloaded' && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1.5 text-xs text-emerald-300">
              <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Update v{status.version} is Ready to Install!</span>
              </div>
              <p className="text-[11px] text-emerald-200/80">
                Click the button below to restart the app and apply the update. A safe backup of your database will be created automatically.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 space-y-2">
            {status.status === 'downloaded' ? (
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold transition text-white text-sm shadow-lg shadow-emerald-600/20"
              >
                <RefreshCw className="w-4 h-4" />
                Restart App & Apply Update Now
              </button>
            ) : status.status === 'available' ? (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-bold transition text-white text-sm shadow-lg shadow-indigo-600/20"
              >
                <Download className={`w-4 h-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                {isDownloading ? 'Starting Download...' : `Download & Update to v${status.version}`}
              </button>
            ) : (
              <button
                onClick={handleCheckUpdates}
                disabled={isChecking}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-bg-tertiary hover:bg-bg-hover rounded-xl font-semibold transition text-text-primary text-xs border border-border/70"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking ? 'Checking GitHub Releases...' : 'Check For Updates Now'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
