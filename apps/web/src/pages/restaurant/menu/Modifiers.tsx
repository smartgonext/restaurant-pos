import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Plus, Edit2, Trash2, ListTree } from 'lucide-react';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import toast from 'react-hot-toast';


export default function Modifiers() {
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newOptions, setNewOptions] = useState([{ name: '', price: 0 }]);
  const [creating, setCreating] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);

  // Fetch modifier groups from backend
  const fetchModifiers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/restaurant/modifier-groups');
      setModifiers(res.data.data || []);
    } catch (e) {
      toast.error('Failed to load modifier groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModifiers();
  }, []);

  // Handle create or update modifier group
  const handleSave = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const payload = {
        name: newName,
        options: newOptions.filter(opt => opt.name.trim()),
      };
      if (editingGroup) {
        await api.put(`/restaurant/modifier-groups/${editingGroup.id}`, payload);
        toast.success('Modifier group updated!');
      } else {
        await api.post('/restaurant/modifier-groups', payload);
        toast.success('Modifier group created!');
      }
      setModalOpen(false);
      setNewName('');
      setNewOptions([{ name: '', price: 0 }]);
      setEditingGroup(null);
      fetchModifiers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setCreating(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this modifier group?')) return;
    try {
      await api.delete(`/restaurant/modifier-groups/${id}`);
      toast.success('Modifier group deleted!');
      fetchModifiers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleEditClick = (mod: any) => {
    setEditingGroup(mod);
    setNewName(mod.name || '');
    setNewOptions(Array.isArray(mod.options) ? mod.options : [{ name: '', price: 0 }]);
    setModalOpen(true);
  };

  // Add/remove option fields
  const addOption = () => setNewOptions([...newOptions, { name: '', price: 0 }]);
  const removeOption = (idx: number) => setNewOptions(newOptions.filter((_, i) => i !== idx));
  const updateOption = (idx: number, key: 'name' | 'price', value: any) => {
    setNewOptions(newOptions.map((opt, i) => i === idx ? { ...opt, [key]: value } : opt));
  };

  return (
    <div className="space-y-6 animate-in">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Menu Modifiers</h1>
          <p className="text-sm text-text-muted mt-1">Manage add-ons, variations, and required choices</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setModalOpen(true)}>
          Create Modifier Group
        </Button>
      </div>

      <Modal 
        open={modalOpen} 
        onClose={() => {
          setModalOpen(false);
          setEditingGroup(null);
          setNewName('');
          setNewOptions([{ name: '', price: 0 }]);
        }} 
        title={editingGroup ? "Edit Modifier Group" : "Create Modifier Group"}
      >
        <div className="space-y-4">
          <Input label="Group Name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-text-muted uppercase">Options</span>
              <Button size="sm" variant="secondary" onClick={addOption} type="button">Add Option</Button>
            </div>
            <div className="space-y-2">
              {newOptions.map((opt, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="Option name"
                    value={opt.name}
                    onChange={e => updateOption(i, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Price"
                    type="number"
                    value={opt.price}
                    onChange={e => updateOption(i, 'price', parseFloat(e.target.value) || 0)}
                    className="w-24"
                  />
                  <Button size="icon" variant="danger" onClick={() => removeOption(i)} type="button">&times;</Button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button 
              variant="secondary" 
              onClick={() => {
                setModalOpen(false);
                setEditingGroup(null);
                setNewName('');
                setNewOptions([{ name: '', price: 0 }]);
              }} 
              type="button"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} loading={creating} type="button">
              {editingGroup ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-text-muted">Loading...</div>
        ) : modifiers.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-text-muted">No modifier groups found.</div>
        ) : modifiers.map((mod: any) => (
          <Card key={mod.id} className="flex flex-col h-full hover:border-blue-500/30 transition-all border-border/50">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg text-text-primary mb-1">{mod.name}</h3>
                {/* You can add badges for required/multi-select if you store those at group level */}
              </div>
              <div className="flex gap-1 bg-bg-tertiary p-1 rounded-lg border border-border">
                <button 
                  onClick={() => handleEditClick(mod)}
                  className="p-1.5 text-blue-400 hover:bg-bg-hover rounded-md transition-colors"
                  title="Edit Group"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDelete(mod.id)}
                  className="p-1.5 text-danger hover:bg-danger/20 rounded-md transition-colors"
                  title="Delete Group"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-bg-tertiary/50 rounded-xl p-4 border border-border/50 flex-1 mb-4">
              <h4 className="text-xs font-semibold text-text-muted uppercase mb-3">Options ({mod.options?.length || 0}+)</h4>
              <div className="space-y-2">
                {mod.options?.map((opt: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm bg-bg-secondary p-2 rounded-md">
                    <span className="text-text-primary">{opt.name}</span>
                    <span className="text-success font-medium">{opt.price === 0 ? 'Free' : `+${formatCurrency(opt.price)}`}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-border/50 flex items-center gap-2 text-sm text-text-muted">
              <ListTree className="w-4 h-4 text-blue-400" />
              {/* You can fetch and show linked items count if needed */}
              Linked to <strong className="text-text-primary">-</strong> Menu Items
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
