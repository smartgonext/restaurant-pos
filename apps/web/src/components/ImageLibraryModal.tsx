import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Modal } from '@/components/ui/Modal';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  defaultQuery?: string;
  selectedUrl?: string;
  inline?: boolean;
}

export default function ImageLibraryModal({ open, onClose, onSelect, defaultQuery = '', selectedUrl, inline = false }: Props) {
  const [query, setQuery] = useState(defaultQuery || 'food');
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const PEXELS_KEY = String(import.meta.env.VITE_PEXELS_API_KEY || '').trim();

  useEffect(() => {
    setQuery(defaultQuery || 'food');
    if (open && (defaultQuery || 'food')) {
      void doSearch(defaultQuery || 'food');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultQuery]);

  async function doSearch(q: string) {
    if (!q || !q.trim()) return setImages([]);
    if (!PEXELS_KEY) {
      toast.error('Pexels API key is not configured. Set VITE_PEXELS_API_KEY in your .env');
      return;
    }
    setLoading(true);
    try {
      const resp = await axios.get('https://api.pexels.com/v1/search', {
        headers: { Authorization: PEXELS_KEY },
        params: { query: q, per_page: 24 }
      });
      const photos = resp.data?.photos || [];
      setImages(photos.map((p: any) => ({ id: p.id, thumb: p.src.small, src: p.src.large, alt: p.alt || '' })));
    } catch (err: any) {
      console.error('Pexels search failed', err);
      toast.error('Failed to fetch images from Pexels');
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search images (e.g. samosa, pizza)" />
        <Button onClick={() => void doSearch(query)} loading={loading} variant="secondary">Search</Button>
        <Button onClick={() => { setQuery('food'); void doSearch('food'); }} variant="ghost">Food</Button>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60vh] overflow-auto">
        {images.length === 0 && !loading && (
          <div className="col-span-4 text-sm text-text-muted">No images — try another search term.</div>
        )}
        {images.map((img) => {
          const isSelected = selectedUrl === img.src;
          return (
            <div key={img.id} className={"rounded overflow-hidden p-1 " + (isSelected ? 'ring-2 ring-blue-500' : 'bg-[#0f1014] border border-gray-800') }>
              <button onClick={() => { onSelect(img.src); onClose(); }} className="w-full h-36 block relative" aria-pressed={isSelected}>
                <img src={img.thumb} alt={img.alt} className="w-full h-full object-cover rounded" />
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
                    ✓
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (inline) {
    // Render embedded content (no separate modal/overlay) so it appears inside the
    // existing Menu Items dialog instead of opening a separate dialog. Provide a
    // small header with a close control so users can collapse the embedded panel.
    return open ? (
      <div className="mt-4 bg-bg-secondary border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Image Library</div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-hover transition-colors"><X className="w-4 h-4 text-text-muted" /></button>
        </div>
        {content}
      </div>
    ) : null;
  }

  return (
    <Modal open={open} onClose={onClose} title="Image Library" size="lg">
      {content}
    </Modal>
  );
}
 
