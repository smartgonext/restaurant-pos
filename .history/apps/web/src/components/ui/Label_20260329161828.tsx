import { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends ComponentPropsWithoutRef<'label'> {}

export function Label({ className, ...props }: LabelProps) {
  return <label className={cn('block text-sm font-medium', className)} {...props} />;
}

export default Label;
