import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { User } from 'lucide-react';

export default function Profile() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('/restaurant/profile').then(r => r.data.data),
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setEmail(profile.email || '');
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (payload: any) => api.put('/restaurant/profile', payload),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Update failed'),
  });

  return (
    <div className="space-y-4 animate-in">
      <div className="flex items-center gap-3">
        <User className="w-6 h-6 text-blue-400" />
        <h1 className="text-xl font-bold">My Profile</h1>
      </div>

      <Card>
        {isLoading ? (
          <p className="p-4 text-text-muted">Loading profile...</p>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-text-muted">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-text-muted">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => mutation.mutate({ name, email })} disabled={mutation.status === 'pending'}>Save Profile</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
