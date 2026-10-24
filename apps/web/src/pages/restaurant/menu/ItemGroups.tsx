import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Edit, Trash2, FolderOpen, Layers } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import ImageLibraryModal from '@/components/ImageLibraryModal';

export default function ItemGroups() {
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showGroupImageLib, setShowGroupImageLib] = useState(false);
  const groupFileRef = useRef<HTMLInputElement | null>(null);

  const [groupFormData, setGroupFormData] = useState({
    name: '',
    description: '',
    image: '',
    isKOTEnabled: true,
  });

  const { data: groups = [], isLoading: groupsLoading, refetch: refetchGroups } = useQuery({
    queryKey: ['item-groups'],
    queryFn: () => api.get('/restaurant/item-groups').then((r) => r.data.data),
  });

  const handleOpenGroup = (group: any = null) => {
    if (group) {
      setEditingGroupId(group.id);
      setGroupFormData({
        name: group.name,
        description: group.description || '',
        image: group.image || '',
        isKOTEnabled: Boolean(group.isKOTEnabled),
      });
    } else {
      setEditingGroupId(null);
      setGroupFormData({ name: '', description: '', image: '', isKOTEnabled: true });
    }
    setNameError(null);
    setShowGroupModal(true);
  };

  const handleGroupSubmit = async () => {
    const name = String(groupFormData.name || '').trim();
    if (!name) {
      setNameError('Please enter a group name');
      return;
    }

    const duplicate = groups?.find((g: any) => g.name?.trim().toLowerCase() === name.toLowerCase() && g.id !== editingGroupId);
    if (duplicate) {
      setNameError('Group with this name already exists');
      return;
    }

    try {
      const payload = { ...groupFormData, name };
      if (editingGroupId) {
        await api.put(`/restaurant/item-groups/${editingGroupId}`, payload);
        toast.success('Group updated!');
      } else {
        await api.post('/restaurant/item-groups', payload);
        toast.success('Group created!');
      }
      setShowGroupModal(false);
      refetchGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const handleDeleteGroup = async (id: number) => {
    if (!confirm('Delete this group? All categories in this group will be unassigned.')) return;
    try {
      await api.delete(`/restaurant/item-groups/${id}`);
      toast.success('Group deleted');
      refetchGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const uploadImageFile = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post('/restaurant/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const url = res?.data?.url;
    if (!url) throw new Error('Upload did not return image url');
    setGroupFormData((prev) => ({ ...prev, image: url }));
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-text-primary uppercase tracking-tight italic">Item Groups</h1>
          <p className="text-sm text-text-muted mt-1 uppercase font-bold text-[10px]">Manage high-level menu groupings (KOT / Non-KOT)</p>
        </div>
        <Button icon={<Layers className="w-4 h-4" />} onClick={() => handleOpenGroup()}>Add Group</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groupsLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-bg-secondary animate-pulse" />)
        ) : groups.length === 0 ? (
          <Card className="col-span-full text-center py-12 border-dashed">
            <FolderOpen className="w-12 h-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted uppercase text-[10px] font-black italic">No groups yet. Create KOT / Non KOT groups first.</p>
          </Card>
        ) : (
          groups.map((group: any) => (
            <Card key={group.id} hover className="flex flex-col justify-between p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-black text-text-primary uppercase tracking-tighter text-base truncate">{group.name}</h3>
                  {group.description && <p className="text-[11px] text-text-muted mt-1 font-bold line-clamp-2">{group.description}</p>}
                </div>
                <Badge variant={group.isKOTEnabled ? 'success' : 'secondary'} className="text-[9px] uppercase font-black px-2 py-1">
                  {group.isKOTEnabled ? 'KOT' : 'NON KOT'}
                </Badge>
              </div>
              
              <div className="mt-6 flex items-center justify-between border-t border-border/30 pt-3">
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-muted uppercase font-black">Categories</span>
                  <span className="text-lg font-black text-text-primary">{group._count?.categories || 0}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleOpenGroup(group)} className="p-2 rounded-xl bg-bg-secondary hover:bg-bg-hover transition-all border border-border/50"><Edit className="w-4 h-4 text-text-muted" /></button>
                  <button onClick={() => handleDeleteGroup(group.id)} className="p-2 rounded-xl bg-danger/5 hover:bg-danger/10 transition-all border border-danger/20"><Trash2 className="w-4 h-4 text-danger" /></button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal open={showGroupModal} onClose={() => setShowGroupModal(false)} title={editingGroupId ? 'Edit Group' : 'New Group'}>
        <div className="space-y-5 py-2">
          <Input label="Group Name" value={groupFormData.name} onChange={(e) => { setGroupFormData({ ...groupFormData, name: e.target.value }); setNameError(null); }} error={nameError || undefined} placeholder="e.g. KOT, Non KOT" />
          <Input label="Description" value={groupFormData.description} onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })} placeholder="Optional description" />
          <Input label="Image URL" value={groupFormData.image} onChange={(e) => setGroupFormData({ ...groupFormData, image: e.target.value })} placeholder="Optional image URL" />
          
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="text-[10px] font-black uppercase" onClick={() => groupFileRef.current?.click()}>Upload Image</Button>
            <Button variant="ghost" className="text-[10px] font-black uppercase" onClick={() => setShowGroupImageLib(true)}>Choose from Library</Button>
            <input
              ref={groupFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await uploadImageFile(file);
                  toast.success('Group image uploaded');
                } catch (err: any) {
                  toast.error(err?.response?.data?.error || err?.message || 'Image upload failed');
                } finally {
                  e.target.value = '';
                }
              }}
            />
          </div>
          
          <label className="flex items-center gap-4 p-4 bg-bg-tertiary/10 rounded-2xl border border-border/30 cursor-pointer group hover:bg-bg-tertiary/20 transition-all">
             <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 transition-all ${groupFormData.isKOTEnabled ? 'bg-success border-success shadow-glow-sm' : 'border-border'}`}>
                {groupFormData.isKOTEnabled && <div className="w-2 h-2 rounded-full bg-white animate-in fade-in" />}
             </div>
             <input type="checkbox" className="hidden" checked={groupFormData.isKOTEnabled} onChange={(e) => setGroupFormData({ ...groupFormData, isKOTEnabled: e.target.checked })} />
             <div className="flex flex-col">
                <span className="text-xs font-black uppercase text-text-primary tracking-wide">KOT Group</span>
                <span className="text-[9px] text-text-muted font-bold uppercase mt-0.5">When ON, categories in this group route to KOT</span>
             </div>
          </label>

          <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border/30">
            <Button variant="ghost" className="uppercase font-black text-[10px]" onClick={() => setShowGroupModal(false)}>Cancel</Button>
            <Button className="px-8 uppercase font-black text-[10px]" onClick={handleGroupSubmit}>{editingGroupId ? 'Update Group' : 'Create Group'}</Button>
          </div>
        </div>
      </Modal>

      <ImageLibraryModal
        open={showGroupImageLib}
        onClose={() => setShowGroupImageLib(false)}
        selectedUrl={groupFormData.image}
        defaultQuery={groupFormData.name || 'food group'}
        onSelect={(url) => setGroupFormData((prev) => ({ ...prev, image: url }))}
      />
    </div>
  );
}
