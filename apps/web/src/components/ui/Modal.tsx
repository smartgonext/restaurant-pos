import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  mode?: 'dialog' | 'slide';
}

export function Modal({ open, isOpen, onClose, title, children, size = 'md', mode = 'dialog' }: ModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-5xl' };
  const isSlide = mode === 'slide';

  return (
    <Transition appear show={isModalOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-300" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className={cn('flex min-h-full', isSlide ? 'items-stretch justify-end p-0' : 'items-center justify-center p-4')}>
            <Transition.Child
              as={Fragment}
              enter="ease-in-out duration-300"
              enterFrom={isSlide ? 'translate-x-full opacity-95' : 'opacity-0 scale-95'}
              enterTo={isSlide ? 'translate-x-0 opacity-100' : 'opacity-100 scale-100'}
              leave="ease-in-out duration-300"
              leaveFrom={isSlide ? 'translate-x-0 opacity-100' : 'opacity-100 scale-100'}
              leaveTo={isSlide ? 'translate-x-full opacity-95' : 'opacity-0 scale-95'}
            >
              <Dialog.Panel className={cn(
                'transform bg-bg-secondary border border-border shadow-card transition-all',
                isSlide
                  ? 'h-screen w-full max-w-[420px] rounded-none border-l border-y-0 border-r-0 overflow-y-auto'
                  : cn('w-full rounded-xl', sizes[size])
              )}>
                {/* Focus sentinel: headlessui warns when there are no focusable elements. */}
                <button type="button" tabIndex={0} className="sr-only" />
                {title && (
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <Dialog.Title className="text-lg font-semibold text-text-primary">{title}</Dialog.Title>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-bg-hover transition-colors"><X className="w-5 h-5 text-text-muted" /></button>
                  </div>
                )}
                <div className="p-6">{children}</div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
