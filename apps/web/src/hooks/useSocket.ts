import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/authStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

let socketInstance: Socket | null = null;

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(socketInstance);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    if (!socketInstance) {
      socketInstance = io(SOCKET_URL, {
        transports: ['websocket'],
      });

      socketInstance.on('connect', () => {
        console.log('Frontend connected to Socket.IO', socketInstance?.id);
        if (user.restaurant?.id) {
          socketInstance?.emit('join_restaurant', user.restaurant.id);
          if (user.role === 'chef') {
             socketInstance?.emit('join_kitchen', user.restaurant.id);
          }
        }
      });

      socketInstance.on('disconnect', () => {
        console.log('Frontend disconnected from Socket.IO');
      });
    }

    setSocket(socketInstance);

    return () => {
      // Intentionally not closing the socket on component unmount
      // as it should be alive across the application
    };
  }, [user]);

  return { socket };
};
