import { useEffect } from 'react';
import { useSocket } from './useSocket';
import toast from 'react-hot-toast';
import { useNotificationStore } from '@/stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';
import { soundManager } from '@/lib/sounds';

export function useRealtimeOrders() {
  const { socket } = useSocket();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (data: { order: any }) => {
      soundManager.playOrderBell();
      toast.success(`New Order Received: #${data.order.orderNumber}`, { duration: 6000 });
      addNotification({ message: `New Order: #${data.order.orderNumber}`, type: 'order' });
      
      // Invalidate query to refresh orders automatically
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleOrderUpdated = (data: { orderId: number, status: string }) => {
      addNotification({ message: `Order #${data.orderId} status changed to ${data.status}`, type: 'system' });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    };

    const handleNewWaiterReq = (data: { request: any }) => {
      soundManager.playWaiterRequest();
      toast(`Waiter requested at Table ${data.request.tableId}`, { icon: '🔔', duration: Infinity });
      addNotification({ message: `Waiter requested at Table ${data.request.tableId}`, type: 'waiter' });
      queryClient.invalidateQueries({ queryKey: ['waiter-requests'] });
    };

    const handleKotUpdated = (data: { kotId: number, status: string }) => {
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
    socket.on('new_kot', handleNewKot);

    return () => {
      socket.off('new_order', handleNewOrder);
      socket.off('order_updated', handleOrderUpdated);
      socket.off('new_waiter_request', handleNewWaiterReq);
      socket.off('kot_updated', handleKotUpdated);
      socket.off('new_kot', handleNewKot);
    };
  }, [socket, addNotification, queryClient]);
}
