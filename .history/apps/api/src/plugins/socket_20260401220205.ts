import { Server, Socket } from 'socket.io';

let ioInstance: Server | null = null;

export function setupSocketIO(io: Server) {
  ioInstance = io;

  io.on('connection', (socket: Socket) => {
    console.log(`⚡ Socket connected: ${socket.id}`);

    // Join restaurant room
    socket.on('join_restaurant', (restaurantId: number) => {
      socket.join(`restaurant:${restaurantId}`);
      console.log(`Socket ${socket.id} joined restaurant:${restaurantId}`);
    });

    // Join kitchen room
    socket.on('join_kitchen', (restaurantId: number) => {
      socket.join(`restaurant:${restaurantId}:kitchen`);
      console.log(`Socket ${socket.id} joined kitchen room`);
    });

    // Join POS room
    socket.on('join_pos', (restaurantId: number) => {
      socket.join(`restaurant:${restaurantId}:pos`);
    });

    // Join table room (customer)
    socket.on('join_table', (tableToken: string) => {
      socket.join(`table:${tableToken}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

export function getIO(): Server {
  if (!ioInstance) throw new Error('Socket.IO not initialized');
  return ioInstance;
}

// ── Emit Helpers ─────────────────────────
export function emitToRestaurant(restaurantId: number, event: string, data: unknown) {
  try {
    const payload = sanitizeForSocket(data);
    getIO().to(`restaurant:${restaurantId}`).emit(event, payload);
  } catch (e) {
    // Fallback to raw emit if serialization fails
    getIO().to(`restaurant:${restaurantId}`).emit(event, data);
  }
}

export function emitToKitchen(restaurantId: number, event: string, data: unknown) {
  try {
    const payload = sanitizeForSocket(data);
    getIO().to(`restaurant:${restaurantId}:kitchen`).emit(event, payload);
  } catch (e) {
    getIO().to(`restaurant:${restaurantId}:kitchen`).emit(event, data);
  }
}

export function emitToTable(tableToken: string, event: string, data: unknown) {
  try {
    const payload = sanitizeForSocket(data);
    getIO().to(`table:${tableToken}`).emit(event, payload);
  } catch (e) {
    getIO().to(`table:${tableToken}`).emit(event, data);
  }
}

function sanitizeForSocket(obj: unknown) {
  // Convert Prisma Decimal-like objects and Dates into plain JSON-safe values.
  // If an object has a `toNumber` method (Prisma Decimal), call it.
  return JSON.parse(JSON.stringify(obj, (_k, v) => {
    if (v && typeof v === 'object') {
      try {
        if (typeof (v as any).toNumber === 'function') return (v as any).toNumber();
        if (typeof (v as any).toString === 'function' && (v as any)._isBigNumber) return (v as any).toString();
      } catch (e) {
        return v;
      }
    }
    return v;
  }));
}
