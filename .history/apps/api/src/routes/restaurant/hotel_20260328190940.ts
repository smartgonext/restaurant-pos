import { FastifyInstance } from 'fastify';
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';

export async function hotelRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate);
  app.addHook('onRequest', tenantScope);

  const normalizeRoomType = (item: any) => ({
    ...item,
    basePrice: Number(item.basePricePerNight || 0),
    category: item.category || 'standard',
  });

  // ─────────────────────────────────────────
  // ROOM TYPES
  // ─────────────────────────────────────────

  app.get('/room-types', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const items = await prisma.hotelRoomType.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: items.map(normalizeRoomType) };
  });

  app.post('/room-types', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;

    const maxOccupancy = Number(body.maxOccupancy || 1);
    const basePricePerNight = Number(body.basePricePerNight ?? body.basePrice ?? 0);

    if (!body.name || Number.isNaN(maxOccupancy) || Number.isNaN(basePricePerNight)) {
      return { success: false, error: 'Invalid room type payload' };
    }

    const item = await prisma.hotelRoomType.create({
      data: {
        restaurantId,
        name: body.name,
        description: body.description,
        maxOccupancy,
        basePricePerNight,
        amenities: body.amenities,
        photos: body.photos,
        status: body.status || 'active',
      }
    });
    return { success: true, data: normalizeRoomType(item) };
  });

  app.put('/room-types/:id', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { id } = request.params as any;
    const roomTypeId = parseInt(id);
    const body = request.body as any;

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.maxOccupancy !== undefined) updateData.maxOccupancy = Number(body.maxOccupancy);
    if (body.basePricePerNight !== undefined || body.basePrice !== undefined) {
      updateData.basePricePerNight = Number(body.basePricePerNight ?? body.basePrice);
    }
    if (body.amenities !== undefined) updateData.amenities = body.amenities;
    if (body.photos !== undefined) updateData.photos = body.photos;
    if (body.status !== undefined) updateData.status = body.status;

    if (
      (updateData.maxOccupancy !== undefined && Number.isNaN(updateData.maxOccupancy)) ||
      (updateData.basePricePerNight !== undefined && Number.isNaN(updateData.basePricePerNight))
    ) {
      return { success: false, error: 'Invalid room type payload' };
    }

    const existing = await prisma.hotelRoomType.findFirst({
      where: { id: roomTypeId, restaurantId }
    });

    if (!existing) {
      return { success: false, error: 'Room type not found' };
    }

    const item = await prisma.hotelRoomType.update({
      where: { id: roomTypeId },
      data: updateData
    });
    return { success: true, data: normalizeRoomType(item) };
  });

  app.delete('/room-types/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelRoomType.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  // ─────────────────────────────────────────
  // ROOMS
  // ─────────────────────────────────────────

  app.get('/rooms', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { roomTypeId, floor, status } = request.query;
    const where: any = { restaurantId };
    if (roomTypeId) where.roomTypeId = parseInt(roomTypeId);
    if (floor) where.floor = parseInt(floor);
    if (status) where.status = status;

    const rooms = await prisma.hotelRoom.findMany({
      where,
      include: { roomType: true },
      orderBy: { roomNumber: 'asc' }
    });
    return { success: true, data: rooms };
  });

  app.post('/rooms', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const room = await prisma.hotelRoom.create({
      data: { ...body, restaurantId },
      include: { roomType: true }
    });
    return { success: true, data: room };
  });

  app.put('/rooms/:id', async (request: any) => {
    const { id } = request.params;
    const body = request.body as any;
    const room = await prisma.hotelRoom.update({
      where: { id: parseInt(id) },
      data: body,
      include: { roomType: true }
    });
    return { success: true, data: room };
  });

  app.delete('/rooms/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelRoom.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  // ─────────────────────────────────────────
  // GUESTS
  // ─────────────────────────────────────────

  app.get('/guests', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { search } = request.query;
    const where: any = { restaurantId };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } }
      ];
    }

    const guests = await prisma.hotelGuest.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: guests };
  });

  app.post('/guests', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;

    const guestData: any = {
      restaurantId,
      name: body.name || `${body.firstName || ''} ${body.lastName || ''}`.trim(),
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      idType: body.idType || null,
      idNumber: body.idNumber || null,
      dateOfBirth: body.dateOfBirth || null,
      nationality: body.nationality || null,
      notes: body.notes || null,
    };

    const guest = await prisma.hotelGuest.create({
      data: guestData,
    });

    return { success: true, data: guest };
  });

  app.put('/guests/:id', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { id } = request.params;
    const body = request.body as any;

    const guestData: any = {
      name: body.name || `${body.firstName || ''} ${body.lastName || ''}`.trim(),
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      idType: body.idType || null,
      idNumber: body.idNumber || null,
      dateOfBirth: body.dateOfBirth || null,
      nationality: body.nationality || null,
      notes: body.notes || null,
    };

    const guest = await prisma.hotelGuest.update({
      where: { id: parseInt(id) },
      data: guestData,
    });

    return { success: true, data: guest };
  });

  app.delete('/guests/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelGuest.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  // ─────────────────────────────────────────
  // RATE PLANS
  // ─────────────────────────────────────────

  app.get('/rate-plans', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const plans = await prisma.hotelRatePlan.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: plans };
  });

  app.post('/rate-plans', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    const plan = await prisma.hotelRatePlan.create({
      data: { ...body, restaurantId }
    });
    return { success: true, data: plan };
  });

  app.put('/rate-plans/:id', async (request: any) => {
    const { id } = request.params;
    const body = request.body as any;
    const plan = await prisma.hotelRatePlan.update({
      where: { id: parseInt(id) },
      data: body
    });
    return { success: true, data: plan };
  });

  app.delete('/rate-plans/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelRatePlan.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  // ─────────────────────────────────────────
  // RESERVATIONS
  // ─────────────────────────────────────────

  app.get('/reservations', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { status, dateFrom, dateTo, search } = request.query;
    const where: any = { restaurantId };
    
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.checkInDate = {};
      if (dateFrom) where.checkInDate.gte = new Date(dateFrom);
      if (dateTo) where.checkInDate.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { reservationNumber: { contains: search } },
        { guest: { name: { contains: search } } }
      ];
    }

    const reservations = await prisma.hotelReservation.findMany({
      where,
      include: { guest: true, ratePlan: true, rooms: { include: { room: { include: { roomType: true } } } } },
      orderBy: { createdAt: 'desc' }
    });
    return { success: true, data: reservations };
  });

  app.post('/reservations', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    
    const reservationNumber = `RES-${restaurantId}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    const reservation = await prisma.hotelReservation.create({
      data: {
        ...body,
        restaurantId,
        reservationNumber,
        rooms: body.roomIds ? {
          create: body.roomIds.map((roomId: number) => ({ roomId }))
        } : undefined
      },
      include: { guest: true, ratePlan: true, rooms: { include: { room: { include: { roomType: true } } } } }
    });
    return { success: true, data: reservation };
  });

  app.put('/reservations/:id', async (request: any) => {
    const { id } = request.params;
    const body = request.body as any;
    
    const reservation = await prisma.hotelReservation.update({
      where: { id: parseInt(id) },
      data: body,
      include: { guest: true, ratePlan: true, rooms: { include: { room: { include: { roomType: true } } } } }
    });
    return { success: true, data: reservation };
  });

  app.delete('/reservations/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelReservation.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  app.get('/reservations/availability', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { checkInDate, checkOutDate, roomTypeId, numberOfRooms } = request.query;
    
    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    const where: any = { restaurantId };
    if (roomTypeId) where.roomTypeId = parseInt(roomTypeId);

    const allRooms = await prisma.hotelRoom.findMany({ where });
    const bookedRooms = await prisma.hotelReservation.findMany({
      where: {
        restaurantId,
        status: { in: ['confirmed', 'tentative'] },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn }
      },
      include: { rooms: true }
    });

    const bookedRoomIds = new Set(bookedRooms.flatMap(r => r.rooms.map(rr => rr.roomId)));
    const availableRooms = allRooms.filter(r => !bookedRoomIds.has(r.id));

    return { success: true, data: availableRooms };
  });

  // ─────────────────────────────────────────
  // CHECK-IN PENDING
  // ─────────────────────────────────────────

  app.get('/check-in/pending', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const reservations = await prisma.hotelReservation.findMany({
      where: {
        restaurantId,
        status: { in: ['confirmed', 'tentative'] },
        checkInDate: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
      },
      include: { guest: true, rooms: { include: { room: { include: { roomType: true } } } } },
      orderBy: { checkInDate: 'asc' }
    });

    return { success: true, data: reservations };
  });

  app.post('/check-in/:reservationId', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { reservationId } = request.params;
    const body = request.body as any;

    const reservation = await prisma.hotelReservation.findUnique({
      where: { id: parseInt(reservationId) },
      include: { guest: true, rooms: true }
    });

    if (!reservation) {
      return { success: false, error: 'Reservation not found' };
    }

    const stay = await prisma.hotelStay.create({
      data: {
        restaurantId,
        reservationId: parseInt(reservationId),
        guestId: reservation.guestId,
        roomId: reservation.rooms[0].roomId,
        checkInDatetime: new Date(),
        status: 'active',
        notes: body.notes
      },
      include: { guest: true, room: { include: { roomType: true } } }
    });

    await prisma.hotelReservation.update({
      where: { id: parseInt(reservationId) },
      data: { status: 'checked_in' }
    });

    await prisma.hotelRoom.update({
      where: { id: reservation.rooms[0].roomId },
      data: { status: 'occupied' }
    });

    return { success: true, data: stay };
  });

  // ─────────────────────────────────────────
  // CHECK-OUT PENDING
  // ─────────────────────────────────────────

  app.get('/check-out/pending', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stays = await prisma.hotelStay.findMany({
      where: {
        restaurantId,
        status: 'active',
        checkOutDatetime: {
          lte: new Date()
        }
      },
      include: { guest: true, room: { include: { roomType: true } }, folioCharges: true, folioPayments: true },
      orderBy: { checkOutDatetime: 'asc' }
    });

    return { success: true, data: stays };
  });

  app.post('/check-out/:stayId', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { stayId } = request.params;
    const body = request.body as any;

    const stay = await prisma.hotelStay.findUnique({
      where: { id: parseInt(stayId) },
      include: { folioCharges: true }
    });

    if (!stay) {
      return { success: false, error: 'Stay not found' };
    }

    if (body.paymentAmount) {
      await prisma.hotelFolioPayment.create({
        data: {
          restaurantId,
          stayId: parseInt(stayId),
          paymentDate: new Date(),
          amount: body.paymentAmount,
          paymentMethod: body.paymentMethod,
          notes: body.notes
        }
      });
    }

    const updatedStay = await prisma.hotelStay.update({
      where: { id: parseInt(stayId) },
      data: {
        status: 'checked_out',
        checkOutDatetime: new Date()
      },
      include: { guest: true, room: { include: { roomType: true } }, folioCharges: true, folioPayments: true }
    });

    await prisma.hotelRoom.update({
      where: { id: stay.roomId },
      data: { status: 'vacant_dirty' }
    });

    return { success: true, data: updatedStay };
  });

  // ─────────────────────────────────────────
  // DASHBOARD STATS
  // ─────────────────────────────────────────

  app.get('/dashboard/stats', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const [arrivalsCount, departuresCount, inHouseCount, totalRooms] = await Promise.all([
      prisma.hotelReservation.count({
        where: {
          restaurantId,
          checkInDate: { gte: today, lt: tomorrow },
          status: { in: ['confirmed', 'tentative'] }
        }
      }),
      prisma.hotelStay.count({
        where: {
          restaurantId,
          status: 'active',
          checkOutDatetime: { gte: today, lt: tomorrow }
        }
      }),
      prisma.hotelStay.count({
        where: { restaurantId, status: 'active' }
      }),
      prisma.hotelRoom.count({
        where: { restaurantId }
      })
    ]);

    const occupancyRate = totalRooms > 0 ? Math.round((inHouseCount / totalRooms) * 100) : 0;

    return {
      success: true,
      data: {
        arrivals_today: arrivalsCount,
        departures_today: departuresCount,
        in_house_count: inHouseCount,
        occupancy_rate: occupancyRate
      }
    };
  });

  app.get('/dashboard/arrivals', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const arrivals = await prisma.hotelReservation.findMany({
      where: {
        restaurantId,
        checkInDate: { gte: today, lt: tomorrow },
        status: { in: ['confirmed', 'tentative'] }
      },
      include: { guest: true },
      orderBy: { checkInDate: 'asc' }
    });

    return { success: true, data: arrivals };
  });

  app.get('/dashboard/departures', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const departures = await prisma.hotelStay.findMany({
      where: {
        restaurantId,
        status: 'active',
        checkOutDatetime: { gte: today, lt: tomorrow }
      },
      include: { guest: true, room: { include: { roomType: true } } },
      orderBy: { checkOutDatetime: 'asc' }
    });

    return { success: true, data: departures };
  });

  app.get('/dashboard/in-house', async (request: any) => {
    const restaurantId = (request as any).restaurantId;

    const inHouse = await prisma.hotelStay.findMany({
      where: { restaurantId, status: 'active' },
      include: { guest: true, room: { include: { roomType: true } } },
      orderBy: { checkInDatetime: 'asc' }
    });

    return { success: true, data: inHouse };
  });

  // ─────────────────────────────────────────
  // ROOM STATUS BOARD
  // ─────────────────────────────────────────

  app.get('/room-status-board', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { floor, status } = request.query;
    
    const where: any = { restaurantId };
    if (floor) where.floor = parseInt(floor);
    if (status) where.status = status;

    const rooms = await prisma.hotelRoom.findMany({
      where,
      include: {
        roomType: true,
        stays: { where: { status: 'active' }, include: { guest: true } }
      },
      orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }]
    });

    return { success: true, data: rooms };
  });

  // ─────────────────────────────────────────
  // HOUSEKEEPING TASKS
  // ─────────────────────────────────────────

  app.get('/housekeeping', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { status, dateFrom, dateTo, roomId } = request.query;
    
    const where: any = { restaurantId };
    if (status) where.status = status;
    if (roomId) where.roomId = parseInt(roomId);
    if (dateFrom || dateTo) {
      where.taskDate = {};
      if (dateFrom) where.taskDate.gte = new Date(dateFrom);
      if (dateTo) where.taskDate.lte = new Date(dateTo);
    }

    const tasks = await prisma.hotelHousekeepingTask.findMany({
      where,
      include: { room: { include: { roomType: true } } },
      orderBy: { taskDate: 'asc' }
    });

    return { success: true, data: tasks };
  });

  app.post('/housekeeping', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    
    const task = await prisma.hotelHousekeepingTask.create({
      data: { ...body, restaurantId },
      include: { room: { include: { roomType: true } } }
    });

    return { success: true, data: task };
  });

  app.put('/housekeeping/:id', async (request: any) => {
    const { id } = request.params;
    const body = request.body as any;
    
    const task = await prisma.hotelHousekeepingTask.update({
      where: { id: parseInt(id) },
      data: body,
      include: { room: { include: { roomType: true } } }
    });

    return { success: true, data: task };
  });

  app.delete('/housekeeping/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelHousekeepingTask.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  // ─────────────────────────────────────────
  // STAYS / FOLIO
  // ─────────────────────────────────────────

  app.get('/stays', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { status, dateFrom, dateTo, search } = request.query;
    
    const where: any = { restaurantId };
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.checkInDatetime = {};
      if (dateFrom) where.checkInDatetime.gte = new Date(dateFrom);
      if (dateTo) where.checkInDatetime.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { guest: { name: { contains: search } } },
        { guest: { phone: { contains: search } } }
      ];
    }

    const stays = await prisma.hotelStay.findMany({
      where,
      include: { guest: true, room: { include: { roomType: true } }, folioCharges: true, folioPayments: true },
      orderBy: { checkInDatetime: 'desc' }
    });

    return { success: true, data: stays };
  });

  app.get('/stays/:id', async (request: any) => {
    const { id } = request.params;
    
    const stay = await prisma.hotelStay.findUnique({
      where: { id: parseInt(id) },
      include: { guest: true, room: { include: { roomType: true } }, folioCharges: true, folioPayments: true }
    });

    return { success: true, data: stay };
  });

  // ─────────────────────────────────────────
  // VENUES
  // ─────────────────────────────────────────

  app.get('/venues', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { search } = request.query;
    
    const where: any = { restaurantId };
    if (search) where.name = { contains: search };

    const venues = await prisma.hotelVenue.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return { success: true, data: venues };
  });

  app.post('/venues', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    
    const venue = await prisma.hotelVenue.create({
      data: { ...body, restaurantId }
    });

    return { success: true, data: venue };
  });

  app.put('/venues/:id', async (request: any) => {
    const { id } = request.params;
    const body = request.body as any;
    
    const venue = await prisma.hotelVenue.update({
      where: { id: parseInt(id) },
      data: body
    });

    return { success: true, data: venue };
  });

  app.delete('/venues/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelVenue.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });

  // ─────────────────────────────────────────
  // EVENTS
  // ─────────────────────────────────────────

  app.get('/events', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const { status, venueId, dateFrom, dateTo, search } = request.query;
    
    const where: any = { restaurantId };
    if (status) where.status = status;
    if (venueId) where.venueId = parseInt(venueId);
    if (dateFrom || dateTo) {
      where.eventDate = {};
      if (dateFrom) where.eventDate.gte = new Date(dateFrom);
      if (dateTo) where.eventDate.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { eventNumber: { contains: search } },
        { eventName: { contains: search } },
        { customerName: { contains: search } }
      ];
    }

    const events = await prisma.hotelEvent.findMany({
      where,
      include: { venue: true },
      orderBy: { eventDate: 'desc' }
    });

    return { success: true, data: events };
  });

  app.post('/events', async (request: any) => {
    const restaurantId = (request as any).restaurantId;
    const body = request.body as any;
    
    const eventNumber = `EVT-${restaurantId}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    
    const event = await prisma.hotelEvent.create({
      data: { ...body, restaurantId, eventNumber },
      include: { venue: true }
    });

    return { success: true, data: event };
  });

  app.put('/events/:id', async (request: any) => {
    const { id } = request.params;
    const body = request.body as any;
    
    const event = await prisma.hotelEvent.update({
      where: { id: parseInt(id) },
      data: body,
      include: { venue: true }
    });

    return { success: true, data: event };
  });

  app.delete('/events/:id', async (request: any) => {
    const { id } = request.params;
    await prisma.hotelEvent.delete({
      where: { id: parseInt(id) }
    });
    return { success: true };
  });
}
