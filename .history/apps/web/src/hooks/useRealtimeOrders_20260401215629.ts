import { useEffect } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';
import { soundManager } from '@/lib/sounds';

export function useRealtimeOrders() {
  const { socket } = useSocket();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const setActiveWaiterRequest = useNotificationStore((state) => state.setActiveWaiterRequest);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (data: any) => {
      const order = data?.order || data;
      const orderNumber = order?.orderNumber || order?.id || 'Unknown';

      soundManager.playOrderBell();
      toast.success(`New Order Received: #${orderNumber}`, { duration: 6000 });
      addNotification({ message: `New Order: #${orderNumber}`, type: 'order' });
      
      // Invalidate query to refresh orders automatically
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleOrderUpdated = (data: { orderId: number, status: string }) => {
      addNotification({ message: `Order #${data.orderId} status changed to ${data.status}`, type: 'system' });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleNewWaiterReq = (data: any) => {
      const req = data?.request || data;
      const tableName = req?.table?.name || req?.tableId || 'Unknown';
      soundManager.playWaiterRequest();
      toast(`Waiter requested at Table ${tableName}`, { icon: '🔔', duration: 6000 });
      addNotification({ message: `Waiter requested at Table ${tableName}`, type: 'waiter' });
      setActiveWaiterRequest(req);
      queryClient.invalidateQueries({ queryKey: ['waiter-requests'] });
    };

    const handleKotUpdated = (data: { kotId: number, status: string }) => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-kots'] });
    };

    const handleKotItemUpdated = (data: any) => {
      // Backend emits detailed kot item updates (kot item or kot + item)
      // Ensure kitchen lists refresh and show a subtle notification
      addNotification({ message: `KOT item updated`, type: 'kitchen' });
      queryClient.invalidateQueries({ queryKey: ['kitchen-kots'] });
    };

    const handleNewKot = (data: { kot: any }) => {
      soundManager.playOrderBell();
      toast.success(`New Kitchen Order: #${data.kot.kotNumber}`);
      addNotification({ message: `New KOT: #${data.kot.kotNumber}`, type: 'kitchen' });
      queryClient.invalidateQueries({ queryKey: ['kitchen-kots'] });
    };

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    socket.on('new_waiter_request', handleNewWaiterReq);
    socket.on('kot_updated', handleKotUpdated);
    socket.on('kot_item_updated', handleKotItemUpdated);
    socket.on('new_kot', handleNewKot);

    const handleTokenCreated = (data: any) => {
      const tokenNumber = data?.tokenNumber || data?.token?.tokenNumber || data?.tokenId;
      toast.success(`New Token created ${tokenNumber ? `#${tokenNumber}` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      try {
        window.dispatchEvent(new CustomEvent('token_created', { detail: data }));
      } catch (e) {
        // ignore in non-browser environments
      }
    };

    const handleTokenUpdated = (data: any) => {
      const tokenNumber = data?.tokenNumber || data?.token?.tokenNumber || data?.id;
      toast(`Token updated ${tokenNumber ? `#${tokenNumber}` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      try {
        window.dispatchEvent(new CustomEvent('token_updated', { detail: data }));
      } catch (e) {
        // ignore in non-browser environments
      }
    };

    const handleTokenPaid = (data: any) => {
      const tokenNumber = data?.tokenNumber || data?.token?.tokenNumber || data?.tokenId;
      toast.success(`Token paid ${tokenNumber ? `#${tokenNumber}` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['waiter-tables'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      try {
        window.dispatchEvent(new CustomEvent('token_paid', { detail: data }));
      } catch (e) {
        // ignore in non-browser environments
      }
    };

    socket.on('token_created', handleTokenCreated);
    socket.on('token_updated', handleTokenUpdated);
    socket.on('token_paid', handleTokenPaid);

    return () => {
      socket.off('new_order', handleNewOrder);
      socket.off('order_updated', handleOrderUpdated);
      socket.off('new_waiter_request', handleNewWaiterReq);
      socket.off('kot_updated', handleKotUpdated);
      socket.off('kot_item_updated', handleKotItemUpdated);
      socket.off('new_kot', handleNewKot);
      socket.off('token_created', handleTokenCreated);
      socket.off('token_updated', handleTokenUpdated);
      socket.off('token_paid', handleTokenPaid);
    };
  }, [socket, addNotification, queryClient, setActiveWaiterRequest]);
}
