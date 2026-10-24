import { useState, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ImportModal({ isOpen, onClose }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ created: number; updated: number; failed: number; errors: string[] } | null>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) setFile(droppedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(30);
    const fd = new FormData();
    fd.append('file', file);

    try {
      setProgress(60);
      const res = await api.post('/restaurant/inventory/bulk-upload', fd);
      setProgress(100);
      const data = res.data.data;
      setSummary({
        created: data.created || 0,
        updated: data.updated || 0,
        failed: data.errors?.length || 0,
        errors: (data.errors || []).map((err: any) => `Row ${err.row || '?'}: ${err.error || 'Validation error'}`)
      });
      showToast('success', 'Import Completed', 'Inventory import processed successfully.');
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
    } catch (err: any) {
      showToast('error', 'Import Failed', err?.response?.data?.error || err?.message || 'Failed to import records.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', width: 500, background: 'var(--bg-primary)',
        borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'scaleIn 200ms ease-out'
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>📥 Bulk Import Raw Materials</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!summary ? (
            <>
              {/* Drop Zone */}
              <div
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  height: 160, border: '2px dashed var(--border)', borderRadius: 10,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: 'rgba(0,0,0,0.2)', gap: 10, transition: 'all 200ms',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#7c3aed'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".csv,.xlsx,.xls" style={{ display: 'none' }} />
                <Upload size={32} style={{ color: '#a78bfa' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {file ? file.name : 'Drag & drop Excel or CSV file here'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Supports .xlsx, .xls, .csv up to 10MB'}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {uploading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>Processing file...</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: '#7c3aed', transition: 'width 200ms' }} />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={onClose} disabled={uploading}
                  style={{ flex: 1, height: 36, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="button" onClick={handleUpload} disabled={!file || uploading}
                  style={{
                    flex: 1, height: 36, background: file && !uploading ? '#7c3aed' : 'rgba(255,255,255,0.03)',
                    border: 'none', borderRadius: 8, color: file && !uploading ? '#fff' : 'var(--text-disabled)',
                    cursor: file && !uploading ? 'pointer' : 'default', fontSize: 11, fontWeight: 600
                  }}>
                  Analyze & Upload
                </button>
              </div>
            </>
          ) : (
            /* Results Summary */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: 13, fontWeight: 700 }}>
                <CheckCircle2 size={18} />
                <span>Import Analysis Complete</span>
              </div>

              {/* Counts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
                <div style={{ padding: '10px 6px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#10b981' }}>{summary.created}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>CREATED ITEMS</div>
                </div>
                <div style={{ padding: '10px 6px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#3b82f6' }}>{summary.updated}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>UPDATED STOCK</div>
                </div>
                <div style={{ padding: '10px 6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#ef4444' }}>{summary.failed}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>FAILED ROWS</div>
                </div>
              </div>

              {/* Errors List */}
              {summary.errors.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={12} style={{ color: '#ef4444' }} />
                    <span>Encountered Errors ({summary.errors.length})</span>
                  </div>
                  <div style={{
                    maxHeight: 120, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
                    display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#ef4444', fontFamily: 'monospace'
                  }}>
                    {summary.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                </div>
              )}

              <button type="button" onClick={onClose}
                style={{ width: '100%', height: 38, background: '#7c3aed', border: 'none', borderRadius: 8, color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                Dismiss Summary
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
