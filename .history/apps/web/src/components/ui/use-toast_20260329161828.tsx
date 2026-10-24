import { toast as hotToast, ToastOptions } from 'react-hot-toast';

type ToastVariant = 'default' | 'destructive' | 'success' | 'error' | 'warning' | 'info';

interface UseToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export function useToast() {
  const toast = ({ title, description, variant = 'default', duration = 4000 }: UseToastOptions) => {
    const message = description ? `${title}${description ? ` - ${description}` : ''}` : title;

    if (variant === 'destructive' || variant === 'error') {
      hotToast.error(message, { duration });
      return;
    }

    if (variant === 'warning' || variant === 'info') {
      hotToast(message, { duration });
      return;
    }

    hotToast.success(message, { duration });
  };

  return { toast };
}

export default useToast;
