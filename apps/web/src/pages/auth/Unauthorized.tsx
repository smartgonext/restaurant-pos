import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  useEffect(() => {
    // Clear auth state and redirect to login automatically
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  // Render nothing while redirecting
  return null;
}
