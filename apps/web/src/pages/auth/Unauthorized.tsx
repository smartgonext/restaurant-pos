import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 bg-danger/10 text-danger rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="text-text-muted">
          You don't have permission to access this page. Please contact your administrator if you believe this is a mistake.
        </p>
        <div className="pt-4">
          <Button className="w-full" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
