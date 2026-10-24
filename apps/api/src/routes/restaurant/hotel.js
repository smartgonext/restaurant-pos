/**
 * hotel.ts  —  Hotel module backend routes
 *
 * Register this file in your main router as:
 *   app.register(hotelRoutes, { prefix: '/restaurant/hotel' })
 *
 * All frontend pages call   /restaurant/hotel/<path>
 * All routes here are relative, e.g.  app.get('/dashboard', ...)
 */
import { prisma } from '../../app.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantScope } from '../../middleware/tenantScope.js';
export async function hotelRoutes(app) {
    app.addHook('onRequest', authenticate);
    app.addHook('onRequest', tenantScope);
    // ─── HELPERS ────────────────────────────────────────────────────────────────
    const extractPrimaryImage = (value) => {
        if (!value)
            return null;
        if (typeof value === 'string')
            return value;
        if (Array.isArray(value)) {
            const first = value.find((v) => typeof v === 'string' && v.trim().length > 0);
            return first || null;
        }
        return null;
    };
    const normalizeRoomType = (item) => ({
        ...item,
        image: item.image || extractPrimaryImage(item.photos),
        basePrice: Number(item.basePricePerNight || 0),
        baseOccupancy: Number(item.baseOccupancy || 1),
        maxOccupancy: Number(item.maxOccupancy || 1),
    });
    const getDaysBetween = (checkIn, checkOut) => {
        const diff = checkOut.getTime() - checkIn.getTime();
        return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    };
    const formatDateString = (value) => {
        if (!value)
            return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime()))
            return null;
        return d.toISOString().split('T')[0];
    };
    // ─── ROOM TYPES ─────────────────────────────────────────────────────────────
    app.get('/room-types', async (request) => {
        const restaurantId = request.restaurantId;
        const { page = 1, pageSize = 50, status, search } = request.query;
        const where = { restaurantId };
        if (status)
            where.status = status;
        if (search)
            where.name = { contains: search };
        const [items, total] = await Promise.all([
            prisma.hotelRoomType.findMany({
                where,
                orderBy: { id: 'desc' },
                skip: (Number(page) - 1) * Number(pageSize),
                take: Number(pageSize),
            }),
            prisma.hotelRoomType.count({ where }),
        ]);
        const roomCounts = await prisma.hotelRoom.groupBy({
            by: ['roomTypeId'],
            where: { restaurantId },
            _count: { id: true },
        });
        const countMap = Object.fromEntries(roomCounts.map((r) => [r.roomTypeId, r._count.id]));
        return {
            success: true,
            data: items.map((i) => ({ ...normalizeRoomType(i), roomsCount: countMap[i.id] || 0 })),
            total,
        };
    });
    app.post('/room-types', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        const maxOccupancy = Number(body.maxOccupancy || 1);
        const basePricePerNight = Number(body.basePricePerNight ?? body.basePrice ?? 0);
        if (!body.name || Number.isNaN(maxOccupancy) || Number.isNaN(basePricePerNight)) {
            return { success: false, error: 'name, maxOccupancy and basePricePerNight are required' };
        }
        const primaryImage = extractPrimaryImage(body.image) || extractPrimaryImage(body.photos);
        const item = await prisma.hotelRoomType.create({
            data: {
                restaurantId,
                name: body.name,
                description: body.description || null,
                baseOccupancy: Number(body.baseOccupancy || 1),
                maxOccupancy,
                basePricePerNight,
                amenities: body.amenities ?? [],
                photos: body.photos ?? (primaryImage ? [primaryImage] : []),
                image: primaryImage && !primaryImage.startsWith('data:') ? primaryImage : null,
                status: body.status || 'active',
            },
        });
        return { success: true, data: { ...normalizeRoomType(item), roomsCount: 0 } };
    });
    app.put('/room-types/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const roomTypeId = parseInt(request.params.id);
        const body = request.body;
        const existing = await prisma.hotelRoomType.findFirst({ where: { id: roomTypeId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Room type not found' };
        const updateData = {};
        if (body.name !== undefined)
            updateData.name = body.name;
        if (body.description !== undefined)
            updateData.description = body.description;
        if (body.baseOccupancy !== undefined)
            updateData.baseOccupancy = Number(body.baseOccupancy);
        if (body.maxOccupancy !== undefined)
            updateData.maxOccupancy = Number(body.maxOccupancy);
        if (body.basePricePerNight !== undefined || body.basePrice !== undefined)
            updateData.basePricePerNight = Number(body.basePricePerNight ?? body.basePrice);
        if (body.amenities !== undefined)
            updateData.amenities = body.amenities;
        if (body.photos !== undefined)
            updateData.photos = body.photos;
        if (body.image !== undefined) {
            const p = extractPrimaryImage(body.image);
            if (p?.startsWith('data:')) {
                updateData.photos = [p];
                updateData.image = null;
            }
            else {
                updateData.image = p;
            }
        }
        if (body.status !== undefined)
            updateData.status = body.status;
        const item = await prisma.hotelRoomType.update({ where: { id: roomTypeId }, data: updateData });
        // Re-fetch rooms count
        const roomsCount = await prisma.hotelRoom.count({ where: { restaurantId, roomTypeId } });
        return { success: true, data: { ...normalizeRoomType(item), roomsCount } };
    });
    app.delete('/room-types/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const roomTypeId = parseInt(request.params.id);
        const linked = await prisma.hotelRoom.count({ where: { restaurantId, roomTypeId } });
        if (linked > 0)
            return { success: false, error: `Cannot delete: ${linked} room(s) use this type` };
        await prisma.hotelRoomType.delete({ where: { id: roomTypeId } });
        return { success: true };
    });
    // ─── ROOMS ───────────────────────────────────────────────────────────────────
    app.get('/rooms', async (request) => {
        const restaurantId = request.restaurantId;
        const { roomTypeId, floor, status, search } = request.query;
        const where = { restaurantId };
        if (roomTypeId)
            where.roomTypeId = parseInt(roomTypeId);
        if (floor)
            where.floor = parseInt(floor);
        if (status)
            where.status = status;
        if (search) {
            const floorNum = parseInt(search);
            where.OR = Number.isNaN(floorNum)
                ? [{ roomNumber: { contains: search } }]
                : [{ roomNumber: { contains: search } }, { floor: floorNum }];
        }
        const rooms = await prisma.hotelRoom.findMany({
            where,
            include: { roomType: true },
            orderBy: { roomNumber: 'asc' },
        });
        return { success: true, data: rooms };
    });
    // IMPORTANT: /rooms/availability must be registered BEFORE /rooms/:id
    app.get('/rooms/availability', async (request) => {
        const restaurantId = request.restaurantId;
        const { checkInDate, checkOutDate, roomTypeId } = request.query;
        if (!checkInDate || !checkOutDate) {
            return { success: false, error: 'checkInDate and checkOutDate are required' };
        }
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const where = { restaurantId, status: { in: ['vacant_clean', 'vacant_dirty'] } };
        if (roomTypeId)
            where.roomTypeId = parseInt(roomTypeId);
        const allRooms = await prisma.hotelRoom.findMany({ where, include: { roomType: true } });
        const bookedRooms = await prisma.hotelReservation.findMany({
            where: {
                restaurantId,
                status: { in: ['confirmed', 'tentative', 'checked_in'] },
                checkInDate: { lt: checkOut },
                checkOutDate: { gt: checkIn },
            },
            include: { rooms: true },
        });
        const bookedRoomIds = new Set(bookedRooms.flatMap((r) => r.rooms.map((rr) => rr.roomId)));
        const availableRooms = allRooms.filter((r) => !bookedRoomIds.has(r.id));
        return { success: true, data: availableRooms };
    });
    app.post('/rooms', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.roomNumber || !body.roomTypeId) {
            return { success: false, error: 'roomNumber and roomTypeId are required' };
        }
        const existing = await prisma.hotelRoom.findFirst({
            where: { restaurantId, roomNumber: body.roomNumber },
        });
        if (existing)
            return { success: false, error: `Room ${body.roomNumber} already exists` };
        const room = await prisma.hotelRoom.create({
            data: {
                restaurantId,
                roomNumber: body.roomNumber,
                roomTypeId: Number(body.roomTypeId),
                floor: body.floor ? Number(body.floor) : null,
                status: body.status || 'vacant_clean',
                notes: body.notes || null,
                isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
            },
            include: { roomType: true },
        });
        return { success: true, data: room };
    });
    app.put('/rooms/:id', async (request) => {
        const roomId = parseInt(request.params.id);
        const body = request.body;
        const data = {};
        if (body.roomNumber !== undefined)
            data.roomNumber = body.roomNumber;
        if (body.roomTypeId !== undefined)
            data.roomTypeId = Number(body.roomTypeId);
        if (body.floor !== undefined)
            data.floor = body.floor ? Number(body.floor) : null;
        if (body.status !== undefined)
            data.status = body.status;
        if (body.notes !== undefined)
            data.notes = body.notes;
        if (body.isActive !== undefined)
            data.isActive = Boolean(body.isActive);
        const room = await prisma.hotelRoom.update({ where: { id: roomId }, data, include: { roomType: true } });
        return { success: true, data: room };
    });
    app.delete('/rooms/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const roomId = parseInt(request.params.id);
        const activeStays = await prisma.hotelStay.count({ where: { restaurantId, roomId, status: 'active' } });
        if (activeStays > 0)
            return { success: false, error: 'Cannot delete room with active stays' };
        await prisma.hotelRoom.delete({ where: { id: roomId } });
        return { success: true };
    });
    // ─── ROOM STATUS BOARD ───────────────────────────────────────────────────────
    app.get('/room-status-board', async (request) => {
        const restaurantId = request.restaurantId;
        const { floor, status } = request.query;
        const where = { restaurantId };
        if (floor)
            where.floor = parseInt(floor);
        if (status)
            where.status = status;
        const rooms = await prisma.hotelRoom.findMany({
            where,
            include: {
                roomType: true,
                stays: {
                    where: { status: 'active' },
                    include: { guest: true },
                    take: 1,
                    orderBy: { checkInDatetime: 'desc' },
                },
            },
            orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
        });
        return { success: true, data: rooms };
    });
    // ─── GUESTS ──────────────────────────────────────────────────────────────────
    app.get('/guests', async (request) => {
        const restaurantId = request.restaurantId;
        const { search } = request.query;
        const where = { restaurantId };
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
                { idNumber: { contains: search } },
            ];
        }
        const guests = await prisma.hotelGuest.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: guests };
    });
    app.post('/guests', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.phone)
            return { success: false, error: 'phone is required' };
        const fullName = body.name || `${body.firstName || ''} ${body.lastName || ''}`.trim();
        if (!fullName)
            return { success: false, error: 'name or firstName is required' };
        const guest = await prisma.hotelGuest.create({
            data: {
                restaurantId,
                name: fullName,
                firstName: body.firstName || null,
                lastName: body.lastName || null,
                email: body.email || null,
                phone: body.phone,
                address: body.address || null,
                city: body.city || null,
                state: body.state || null,
                country: body.country || null,
                postalCode: body.postalCode || null,
                idType: body.idType || null,
                idNumber: body.idNumber || null,
                dateOfBirth: body.dateOfBirth ? formatDateString(body.dateOfBirth) : null,
                nationality: body.nationality || null,
                notes: body.notes || null,
            },
        });
        return { success: true, data: guest };
    });
    app.put('/guests/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const guestId = parseInt(request.params.id);
        const body = request.body;
        const existing = await prisma.hotelGuest.findFirst({ where: { id: guestId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Guest not found' };
        const fullName = body.name || `${body.firstName || ''} ${body.lastName || ''}`.trim() || existing.name;
        const guest = await prisma.hotelGuest.update({
            where: { id: guestId },
            data: {
                name: fullName,
                firstName: body.firstName ?? existing.firstName,
                lastName: body.lastName ?? existing.lastName,
                email: body.email !== undefined ? body.email : existing.email,
                phone: body.phone || existing.phone,
                address: body.address !== undefined ? body.address : existing.address,
                city: body.city !== undefined ? body.city : existing.city,
                state: body.state !== undefined ? body.state : existing.state,
                country: body.country !== undefined ? body.country : existing.country,
                postalCode: body.postalCode !== undefined ? body.postalCode : existing.postalCode,
                idType: body.idType !== undefined ? body.idType : existing.idType,
                idNumber: body.idNumber !== undefined ? body.idNumber : existing.idNumber,
                dateOfBirth: body.dateOfBirth ? formatDateString(body.dateOfBirth) : existing.dateOfBirth,
                nationality: body.nationality !== undefined ? body.nationality : existing.nationality,
                notes: body.notes !== undefined ? body.notes : existing.notes,
            },
        });
        return { success: true, data: guest };
    });
    app.delete('/guests/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const guestId = parseInt(request.params.id);
        const activeStays = await prisma.hotelStay.count({ where: { restaurantId, guestId, status: 'active' } });
        if (activeStays > 0)
            return { success: false, error: 'Cannot delete guest with active stays' };
        await prisma.hotelGuest.delete({ where: { id: guestId } });
        return { success: true };
    });
    // ─── RATE PLANS ──────────────────────────────────────────────────────────────
    app.get('/rate-plans', async (request) => {
        const restaurantId = request.restaurantId;
        const { status, search } = request.query;
        const where = { restaurantId };
        if (status)
            where.status = status;
        if (search)
            where.name = { contains: search };
        const plans = await prisma.hotelRatePlan.findMany({ where, orderBy: { createdAt: 'desc' } });
        return { success: true, data: plans };
    });
    app.post('/rate-plans', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.name || !body.planType) {
            return { success: false, error: 'name and planType are required' };
        }
        const plan = await prisma.hotelRatePlan.create({
            data: {
                restaurantId,
                name: body.name,
                description: body.description || null,
                planType: body.planType,
                freeCancellationHours: body.freeCancellationHours ? Number(body.freeCancellationHours) : null,
                cancellationChargePercent: Number(body.cancellationChargePercent || 0),
                status: body.status || 'active',
            },
        });
        return { success: true, data: plan };
    });
    app.put('/rate-plans/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const planId = parseInt(request.params.id);
        const body = request.body;
        const existing = await prisma.hotelRatePlan.findFirst({ where: { id: planId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Rate plan not found' };
        const data = {};
        if (body.name !== undefined)
            data.name = body.name;
        if (body.description !== undefined)
            data.description = body.description;
        if (body.planType !== undefined)
            data.planType = body.planType;
        if (body.freeCancellationHours !== undefined)
            data.freeCancellationHours = body.freeCancellationHours ? Number(body.freeCancellationHours) : null;
        if (body.cancellationChargePercent !== undefined)
            data.cancellationChargePercent = Number(body.cancellationChargePercent);
        if (body.status !== undefined)
            data.status = body.status;
        const plan = await prisma.hotelRatePlan.update({ where: { id: planId }, data });
        return { success: true, data: plan };
    });
    app.delete('/rate-plans/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const planId = parseInt(request.params.id);
        const linked = await prisma.hotelReservation.count({
            where: { restaurantId, ratePlanId: planId, status: { in: ['tentative', 'confirmed', 'checked_in'] } },
        });
        if (linked > 0)
            return { success: false, error: 'Cannot delete rate plan linked to active reservations' };
        await prisma.hotelRatePlan.delete({ where: { id: planId } });
        return { success: true };
    });
    // ─── RESERVATIONS ────────────────────────────────────────────────────────────
    app.get('/reservations', async (request) => {
        const restaurantId = request.restaurantId;
        const { status, dateFrom, dateTo, search } = request.query;
        const where = { restaurantId };
        if (status && status !== 'all')
            where.status = status;
        if (dateFrom || dateTo) {
            where.checkInDate = {};
            if (dateFrom)
                where.checkInDate.gte = new Date(dateFrom);
            if (dateTo)
                where.checkInDate.lte = new Date(dateTo);
        }
        if (search) {
            where.OR = [
                { reservationNumber: { contains: search } },
                { guest: { name: { contains: search } } },
                { guest: { phone: { contains: search } } },
            ];
        }
        const reservations = await prisma.hotelReservation.findMany({
            where,
            include: {
                guest: true,
                ratePlan: true,
                rooms: { include: { room: { include: { roomType: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: reservations };
    });
    app.post('/reservations', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.guestId || !body.checkInDate || !body.checkOutDate) {
            return { success: false, error: 'guestId, checkInDate, and checkOutDate are required' };
        }
        const checkIn = new Date(body.checkInDate);
        const checkOut = new Date(body.checkOutDate);
        if (checkOut <= checkIn) {
            return { success: false, error: 'Check-out date must be after check-in date' };
        }
        const count = await prisma.hotelReservation.count({ where: { restaurantId } });
        const reservationNumber = `RES-${restaurantId}-${String(count + 1).padStart(4, '0')}`;
        const roomSelections = Array.isArray(body.roomSelections) ? body.roomSelections : [];
        const bookedRooms = await prisma.hotelReservation.findMany({
            where: {
                restaurantId,
                status: { in: ['tentative', 'confirmed', 'checked_in'] },
                checkInDate: { lt: checkOut },
                checkOutDate: { gt: checkIn },
            },
            include: { rooms: true },
        });
        const bookedRoomIds = new Set(bookedRooms.flatMap((r) => r.rooms.map((rr) => rr.roomId)));
        const assignedRoomIds = [];
        let totalAmount = 0;
        const nights = getDaysBetween(checkIn, checkOut);
        for (const sel of roomSelections) {
            if (!sel.qty || sel.qty < 1)
                continue;
            const availableForType = await prisma.hotelRoom.findMany({
                where: {
                    restaurantId,
                    roomTypeId: sel.roomTypeId,
                    status: { in: ['vacant_clean', 'vacant_dirty'] },
                    id: { notIn: Array.from(bookedRoomIds) },
                },
                take: sel.qty,
            });
            if (availableForType.length < sel.qty) {
                const rt = await prisma.hotelRoomType.findUnique({ where: { id: sel.roomTypeId } });
                return { success: false, error: `Not enough rooms available for ${rt?.name || 'selected type'}` };
            }
            availableForType.forEach((r) => {
                assignedRoomIds.push(r.id);
                bookedRoomIds.add(r.id);
            });
            totalAmount += sel.rate * sel.qty * nights;
        }
        // Legacy roomIds support
        const legacyRoomIds = Array.isArray(body.roomIds) ? body.roomIds.map(Number) : [];
        if (legacyRoomIds.length > 0) {
            const conflicts = legacyRoomIds.filter((id) => bookedRoomIds.has(id));
            if (conflicts.length > 0) {
                const room = await prisma.hotelRoom.findUnique({ where: { id: conflicts[0] } });
                return { success: false, error: `Room ${room?.roomNumber || conflicts[0]} is not available for selected dates` };
            }
            assignedRoomIds.push(...legacyRoomIds);
        }
        const reservation = await prisma.hotelReservation.create({
            data: {
                restaurantId,
                reservationNumber,
                guestId: Number(body.guestId),
                checkInDate: checkIn,
                checkOutDate: checkOut,
                checkInTime: body.checkInTime || '14:00',
                checkOutTime: body.checkOutTime || '11:00',
                numberOfGuests: Number(body.numberOfGuests || body.adults || 1),
                ratePlanId: body.ratePlanId ? Number(body.ratePlanId) : null,
                status: body.status || 'tentative',
                specialRequests: body.specialRequests || null,
                advancePayment: body.advancePaid !== undefined ? Number(body.advancePaid) : null,
                paymentMethod: body.paymentMethod || null,
                totalAmount: totalAmount || Number(body.totalAmount || 0),
                rooms: assignedRoomIds.length > 0
                    ? { create: assignedRoomIds.map((roomId) => ({ roomId })) }
                    : undefined,
            },
            include: {
                guest: true,
                ratePlan: true,
                rooms: { include: { room: { include: { roomType: true } } } },
            },
        });
        return { success: true, data: reservation };
    });
    app.put('/reservations/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const resId = parseInt(request.params.id);
        const body = request.body;
        const existing = await prisma.hotelReservation.findFirst({ where: { id: resId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Reservation not found' };
        const data = {};
        if (body.guestId !== undefined)
            data.guestId = Number(body.guestId);
        if (body.checkInDate !== undefined)
            data.checkInDate = new Date(body.checkInDate);
        if (body.checkOutDate !== undefined)
            data.checkOutDate = new Date(body.checkOutDate);
        if (body.checkInTime !== undefined)
            data.checkInTime = body.checkInTime;
        if (body.checkOutTime !== undefined)
            data.checkOutTime = body.checkOutTime;
        if (body.numberOfGuests !== undefined)
            data.numberOfGuests = Number(body.numberOfGuests);
        if (body.ratePlanId !== undefined)
            data.ratePlanId = body.ratePlanId ? Number(body.ratePlanId) : null;
        if (body.status !== undefined)
            data.status = body.status;
        if (body.specialRequests !== undefined)
            data.specialRequests = body.specialRequests;
        if (body.advancePaid !== undefined)
            data.advancePayment = Number(body.advancePaid);
        if (body.paymentMethod !== undefined)
            data.paymentMethod = body.paymentMethod;
        if (body.totalAmount !== undefined)
            data.totalAmount = Number(body.totalAmount);
        const reservation = await prisma.hotelReservation.update({
            where: { id: resId },
            data,
            include: {
                guest: true,
                ratePlan: true,
                rooms: { include: { room: { include: { roomType: true } } } },
            },
        });
        return { success: true, data: reservation };
    });
    app.patch('/reservations/:id/cancel', async (request) => {
        const restaurantId = request.restaurantId;
        const resId = parseInt(request.params.id);
        const existing = await prisma.hotelReservation.findFirst({ where: { id: resId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Reservation not found' };
        if (existing.status === 'checked_in')
            return { success: false, error: 'Cannot cancel a checked-in reservation' };
        const reservation = await prisma.hotelReservation.update({
            where: { id: resId },
            data: { status: 'cancelled' },
            include: { guest: true, rooms: true },
        });
        return { success: true, data: reservation };
    });
    app.delete('/reservations/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const resId = parseInt(request.params.id);
        const existing = await prisma.hotelReservation.findFirst({ where: { id: resId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Reservation not found' };
        await prisma.hotelReservation.update({ where: { id: resId }, data: { status: 'cancelled' } });
        return { success: true };
    });
    // ─── CHECK-IN ────────────────────────────────────────────────────────────────
    app.get('/check-in/pending', async (request) => {
        const restaurantId = request.restaurantId;
        const { date } = request.query;
        const targetDate = date ? new Date(date) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
        const reservations = await prisma.hotelReservation.findMany({
            where: {
                restaurantId,
                status: { in: ['confirmed', 'tentative'] },
                checkInDate: { gte: targetDate, lt: nextDay },
            },
            include: {
                guest: true,
                rooms: { include: { room: { include: { roomType: true } } } },
            },
            orderBy: { checkInDate: 'asc' },
        });
        return { success: true, data: reservations };
    });
    app.post('/check-in/:reservationId', async (request) => {
        const restaurantId = request.restaurantId;
        const resId = parseInt(request.params.reservationId);
        const body = request.body;
        const reservation = await prisma.hotelReservation.findFirst({
            where: { id: resId, restaurantId },
            include: { guest: true, rooms: { include: { room: { include: { roomType: true } } } } },
        });
        if (!reservation)
            return { success: false, error: 'Reservation not found' };
        if (!['tentative', 'confirmed'].includes(reservation.status)) {
            return { success: false, error: 'Reservation is not in a valid state for check-in' };
        }
        // Determine room(s) to check into — support multi-room via assignedRooms array
        const assignedRooms = Array.isArray(body.assignedRooms) && body.assignedRooms.length > 0
            ? body.assignedRooms
            : body.roomId
                ? [{ roomId: Number(body.roomId) }]
                : reservation.rooms.map((r) => ({ roomId: r.roomId }));
        if (assignedRooms.length === 0) {
            return { success: false, error: 'No room assigned to this reservation' };
        }
        // Validate each room
        for (const ar of assignedRooms) {
            const room = await prisma.hotelRoom.findFirst({ where: { id: ar.roomId, restaurantId } });
            if (!room)
                return { success: false, error: `Room ID ${ar.roomId} not found` };
            if (!['vacant_clean', 'vacant_dirty'].includes(room.status)) {
                return { success: false, error: `Room ${room.roomNumber} is not available (status: ${room.status})` };
            }
        }
        // Use first room for primary stay record (legacy single-room stay model)
        const primaryRoomId = assignedRooms[0].roomId;
        const primaryRoom = await prisma.hotelRoom.findFirst({
            where: { id: primaryRoomId },
            include: { roomType: true },
        });
        const stay = await prisma.hotelStay.create({
            data: {
                restaurantId,
                reservationId: resId,
                guestId: reservation.guestId,
                roomId: primaryRoomId,
                checkInDatetime: new Date(),
                checkOutDatetime: reservation.checkOutDate,
                status: 'active',
                notes: body.notes || null,
            },
            include: { guest: true, room: { include: { roomType: true } } },
        });
        // Create folio charge for room per night
        const nights = getDaysBetween(reservation.checkInDate, reservation.checkOutDate);
        const nightlyRate = Number(primaryRoom?.roomType?.basePricePerNight || 0);
        if (nights > 0 && nightlyRate > 0) {
            await prisma.hotelFolioCharge.create({
                data: {
                    restaurantId,
                    stayId: stay.id,
                    chargeDate: new Date(),
                    description: `Room ${primaryRoom?.roomNumber} × ${nights} night${nights > 1 ? 's' : ''}`,
                    chargeType: 'room',
                    amount: nightlyRate * nights,
                },
            });
        }
        // Record advance payment if any
        if (reservation.advancePayment && Number(reservation.advancePayment) > 0) {
            await prisma.hotelFolioPayment.create({
                data: {
                    restaurantId,
                    stayId: stay.id,
                    paymentDate: new Date(),
                    amount: Number(reservation.advancePayment),
                    paymentMethod: reservation.paymentMethod || 'cash',
                    notes: 'Advance payment from reservation',
                },
            });
        }
        // Update all assigned rooms to occupied + update reservation status
        await Promise.all([
            ...assignedRooms.map((ar) => prisma.hotelRoom.update({ where: { id: ar.roomId }, data: { status: 'occupied' } })),
            prisma.hotelReservation.update({ where: { id: resId }, data: { status: 'checked_in' } }),
        ]);
        return { success: true, data: stay };
    });
    // ─── CHECK-OUT ───────────────────────────────────────────────────────────────
    app.get('/check-out/pending', async (request) => {
        const restaurantId = request.restaurantId;
        const { date } = request.query;
        const targetDate = date ? new Date(date) : new Date();
        targetDate.setHours(23, 59, 59, 999);
        const stays = await prisma.hotelStay.findMany({
            where: {
                restaurantId,
                status: 'active',
                checkOutDatetime: { lte: targetDate },
            },
            include: {
                guest: true,
                room: { include: { roomType: true } },
                folioCharges: true,
                folioPayments: true,
            },
            orderBy: { checkOutDatetime: 'asc' },
        });
        return { success: true, data: stays };
    });
    // NOTE: /check-out/:stayId/folio must come before /check-out/:stayId  (POST)
    app.get('/check-out/:stayId/folio', async (request) => {
        const restaurantId = request.restaurantId;
        const stayId = parseInt(request.params.stayId);
        const stay = await prisma.hotelStay.findFirst({
            where: { id: stayId, restaurantId },
            include: {
                guest: true,
                room: { include: { roomType: true } },
                folioCharges: { orderBy: { chargeDate: 'asc' } },
                folioPayments: { orderBy: { paymentDate: 'asc' } },
            },
        });
        if (!stay)
            return { success: false, error: 'Stay not found' };
        const subtotal = stay.folioCharges.reduce((s, c) => s + Number(c.amount || 0), 0);
        const paid = stay.folioPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        return {
            success: true,
            data: {
                stay,
                charges: stay.folioCharges,
                payments: stay.folioPayments,
                summary: { subtotal, total_paid: paid, balance_due: Math.max(subtotal - paid, 0) },
            },
        };
    });
    app.post('/check-out/:stayId', async (request) => {
        const restaurantId = request.restaurantId;
        const stayId = parseInt(request.params.stayId);
        const body = request.body;
        const stay = await prisma.hotelStay.findFirst({
            where: { id: stayId, restaurantId },
            include: { folioCharges: true, folioPayments: true },
        });
        if (!stay)
            return { success: false, error: 'Stay not found' };
        if (stay.status !== 'active')
            return { success: false, error: 'Stay is not active' };
        if (body.paymentAmount && Number(body.paymentAmount) > 0) {
            await prisma.hotelFolioPayment.create({
                data: {
                    restaurantId,
                    stayId,
                    paymentDate: new Date(),
                    amount: Number(body.paymentAmount),
                    paymentMethod: body.paymentMethod || 'cash',
                    notes: body.notes || null,
                },
            });
        }
        const [updatedStay] = await Promise.all([
            prisma.hotelStay.update({
                where: { id: stayId },
                data: { status: 'checked_out', checkOutDatetime: new Date() },
                include: {
                    guest: true,
                    room: { include: { roomType: true } },
                    folioCharges: true,
                    folioPayments: true,
                },
            }),
            prisma.hotelRoom.update({ where: { id: stay.roomId }, data: { status: 'vacant_dirty' } }),
            stay.reservationId
                ? prisma.hotelReservation.update({
                    where: { id: stay.reservationId },
                    data: { status: 'checked_out' },
                })
                : Promise.resolve(),
            prisma.hotelHousekeepingTask.create({
                data: {
                    restaurantId,
                    roomId: stay.roomId,
                    taskType: 'clean',
                    assignedTo: null,
                    taskDate: new Date(),
                    status: 'pending',
                    notes: 'Auto-created on check-out',
                },
            }),
        ]);
        return { success: true, data: updatedStay };
    });
    // ─── DASHBOARD ───────────────────────────────────────────────────────────────
    app.get('/dashboard/stats', async (request) => {
        const restaurantId = request.restaurantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const [arrivalsCount, departuresCount, inHouseCount, totalRooms] = await Promise.all([
            prisma.hotelReservation.count({
                where: {
                    restaurantId,
                    checkInDate: { gte: today, lt: tomorrow },
                    status: { in: ['confirmed', 'tentative'] },
                },
            }),
            prisma.hotelStay.count({
                where: {
                    restaurantId,
                    status: 'active',
                    checkOutDatetime: { gte: today, lt: tomorrow },
                },
            }),
            prisma.hotelStay.count({ where: { restaurantId, status: 'active' } }),
            prisma.hotelRoom.count({ where: { restaurantId } }),
        ]);
        const occupancyRate = totalRooms > 0 ? Math.round((inHouseCount / totalRooms) * 100) : 0;
        return {
            success: true,
            data: {
                arrivals_today: arrivalsCount,
                departures_today: departuresCount,
                in_house_count: inHouseCount,
                occupancy_rate: occupancyRate,
                total_rooms: totalRooms,
            },
        };
    });
    app.get('/dashboard/arrivals', async (request) => {
        const restaurantId = request.restaurantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const arrivals = await prisma.hotelReservation.findMany({
            where: {
                restaurantId,
                checkInDate: { gte: today, lt: tomorrow },
                status: { in: ['confirmed', 'tentative'] },
            },
            include: {
                guest: true,
                rooms: { include: { room: { include: { roomType: true } } } },
            },
            orderBy: { checkInDate: 'asc' },
        });
        return { success: true, data: arrivals };
    });
    app.get('/dashboard/departures', async (request) => {
        const restaurantId = request.restaurantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const departures = await prisma.hotelStay.findMany({
            where: {
                restaurantId,
                status: 'active',
                checkOutDatetime: { gte: today, lt: tomorrow },
            },
            include: {
                guest: true,
                room: { include: { roomType: true } },
                folioCharges: true,
                folioPayments: true,
            },
            orderBy: { checkOutDatetime: 'asc' },
        });
        return { success: true, data: departures };
    });
    app.get('/dashboard/in-house', async (request) => {
        const restaurantId = request.restaurantId;
        const inHouse = await prisma.hotelStay.findMany({
            where: { restaurantId, status: 'active' },
            include: { guest: true, room: { include: { roomType: true } } },
            orderBy: { checkInDatetime: 'asc' },
        });
        return { success: true, data: inHouse };
    });
    // Unified dashboard (all-in-one)
    app.get('/dashboard', async (request) => {
        const restaurantId = request.restaurantId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const [arrivalsList, departuresList, inHouseList, totalRooms] = await Promise.all([
            prisma.hotelReservation.findMany({
                where: {
                    restaurantId,
                    checkInDate: { gte: today, lt: tomorrow },
                    status: { in: ['confirmed', 'tentative'] },
                },
                include: { guest: true, rooms: { include: { room: { include: { roomType: true } } } } },
                orderBy: { checkInDate: 'asc' },
            }),
            prisma.hotelStay.findMany({
                where: { restaurantId, status: 'active', checkOutDatetime: { gte: today, lt: tomorrow } },
                include: { guest: true, room: { include: { roomType: true } } },
                orderBy: { checkOutDatetime: 'asc' },
            }),
            prisma.hotelStay.findMany({
                where: { restaurantId, status: 'active' },
                include: { guest: true, room: { include: { roomType: true } } },
                orderBy: { checkInDatetime: 'asc' },
            }),
            prisma.hotelRoom.count({ where: { restaurantId } }),
        ]);
        const inHouseCount = inHouseList.length;
        const occupancyRate = totalRooms > 0 ? Math.round((inHouseCount / totalRooms) * 100) : 0;
        return {
            success: true,
            data: {
                arrivals_today: arrivalsList.length,
                departures_today: departuresList.length,
                in_house_count: inHouseCount,
                occupancy_rate: occupancyRate,
                total_rooms: totalRooms,
                arrivals_list: arrivalsList,
                departures_list: departuresList,
                in_house_list: inHouseList,
            },
        };
    });
    // ─── HOUSEKEEPING ────────────────────────────────────────────────────────────
    app.get('/housekeeping', async (request) => {
        const restaurantId = request.restaurantId;
        const { status, dateFrom, dateTo, roomId, date } = request.query;
        const where = { restaurantId };
        if (status && status !== 'all')
            where.status = status;
        if (roomId)
            where.roomId = parseInt(roomId);
        if (date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            where.taskDate = { gte: d, lt: new Date(d.getTime() + 24 * 60 * 60 * 1000) };
        }
        else if (dateFrom || dateTo) {
            where.taskDate = {};
            if (dateFrom)
                where.taskDate.gte = new Date(dateFrom);
            if (dateTo)
                where.taskDate.lte = new Date(dateTo);
        }
        const tasks = await prisma.hotelHousekeepingTask.findMany({
            where,
            include: { room: { include: { roomType: true } } },
            orderBy: [{ taskDate: 'asc' }, { id: 'desc' }],
        });
        return { success: true, data: tasks };
    });
    app.post('/housekeeping', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.roomId || !body.taskType) {
            return { success: false, error: 'roomId and taskType are required' };
        }
        const task = await prisma.hotelHousekeepingTask.create({
            data: {
                restaurantId,
                roomId: Number(body.roomId),
                taskType: body.taskType,
                assignedTo: body.assignedTo || null,
                taskDate: body.taskDate ? new Date(body.taskDate) : new Date(),
                status: body.status || 'pending',
                notes: body.notes || null,
            },
            include: { room: { include: { roomType: true } } },
        });
        return { success: true, data: task };
    });
    app.put('/housekeeping/:id', async (request) => {
        const taskId = parseInt(request.params.id);
        const body = request.body;
        const data = {};
        if (body.roomId !== undefined)
            data.roomId = Number(body.roomId);
        if (body.taskType !== undefined)
            data.taskType = body.taskType;
        if (body.assignedTo !== undefined)
            data.assignedTo = body.assignedTo || null;
        if (body.taskDate !== undefined)
            data.taskDate = new Date(body.taskDate);
        if (body.status !== undefined)
            data.status = body.status;
        if (body.notes !== undefined)
            data.notes = body.notes;
        const task = await prisma.hotelHousekeepingTask.update({
            where: { id: taskId },
            data,
            include: { room: { include: { roomType: true } } },
        });
        return { success: true, data: task };
    });
    app.delete('/housekeeping/:id', async (request) => {
        const taskId = parseInt(request.params.id);
        await prisma.hotelHousekeepingTask.delete({ where: { id: taskId } });
        return { success: true };
    });
    // ─── STAYS / FOLIO ───────────────────────────────────────────────────────────
    app.get('/stays', async (request) => {
        const restaurantId = request.restaurantId;
        const { status, dateFrom, dateTo, search } = request.query;
        const where = { restaurantId };
        if (status && status !== 'all')
            where.status = status;
        if (dateFrom || dateTo) {
            where.checkInDatetime = {};
            if (dateFrom)
                where.checkInDatetime.gte = new Date(dateFrom);
            if (dateTo)
                where.checkInDatetime.lte = new Date(dateTo);
        }
        if (search) {
            where.OR = [
                { guest: { name: { contains: search } } },
                { guest: { phone: { contains: search } } },
                { room: { roomNumber: { contains: search } } },
            ];
        }
        const stays = await prisma.hotelStay.findMany({
            where,
            include: {
                guest: true,
                room: { include: { roomType: true } },
                folioCharges: true,
                folioPayments: true,
            },
            orderBy: { checkInDatetime: 'desc' },
        });
        return { success: true, data: stays };
    });
    app.get('/stays/:id/folio', async (request) => {
        const restaurantId = request.restaurantId;
        const stayId = parseInt(request.params.id);
        const stay = await prisma.hotelStay.findFirst({
            where: { id: stayId, restaurantId },
            include: {
                guest: true,
                room: { include: { roomType: true } },
                folioCharges: { orderBy: { chargeDate: 'asc' } },
                folioPayments: { orderBy: { paymentDate: 'asc' } },
            },
        });
        if (!stay)
            return { success: false, error: 'Stay not found' };
        const subtotal = stay.folioCharges.reduce((s, c) => s + Number(c.amount || 0), 0);
        const paid = stay.folioPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
        return {
            success: true,
            data: {
                stay,
                charges: stay.folioCharges,
                payments: stay.folioPayments,
                summary: { subtotal, total_paid: paid, balance_due: Math.max(subtotal - paid, 0) },
            },
        };
    });
    app.get('/stays/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const stayId = parseInt(request.params.id);
        const stay = await prisma.hotelStay.findFirst({
            where: { id: stayId, restaurantId },
            include: {
                guest: true,
                room: { include: { roomType: true } },
                folioCharges: { orderBy: { chargeDate: 'asc' } },
                folioPayments: { orderBy: { paymentDate: 'asc' } },
            },
        });
        if (!stay)
            return { success: false, error: 'Stay not found' };
        return { success: true, data: stay };
    });
    app.post('/stays/:id/charges', async (request) => {
        const restaurantId = request.restaurantId;
        const stayId = parseInt(request.params.id);
        const body = request.body;
        const stay = await prisma.hotelStay.findFirst({ where: { id: stayId, restaurantId } });
        if (!stay)
            return { success: false, error: 'Stay not found' };
        const charge = await prisma.hotelFolioCharge.create({
            data: {
                restaurantId,
                stayId,
                chargeDate: new Date(),
                description: body.description || 'Extra charge',
                chargeType: body.chargeType || 'extra',
                amount: Number(body.amount || 0),
            },
        });
        return { success: true, data: charge };
    });
    // ─── ROOM SERVICE ─────────────────────────────────────────────────────────────
    // NOTE: The frontend calls GET /restaurant/hotel/room-service (NOT /restaurant/orders)
    // This unified endpoint returns hotel room service orders.
    app.get('/room-service', async (request) => {
        const restaurantId = request.restaurantId;
        const { search, status } = request.query;
        // Try to query hotel-specific room service orders table first
        // Falls back to restaurant orders with type=room_service if model unavailable
        try {
            const where = { restaurantId };
            if (status && status !== 'all')
                where.status = status;
            const orders = await prisma.hotelRoomServiceOrder.findMany({
                where,
                include: {
                    stay: true,
                    room: true,
                    guest: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            let filtered = orders;
            if (search) {
                const q = search.toLowerCase();
                filtered = orders.filter((o) => {
                    const text = [
                        String(o.id),
                        o.room?.roomNumber,
                        o.guest?.name,
                        String(o.stay?.id || ''),
                    ]
                        .join(' ')
                        .toLowerCase();
                    return text.includes(q);
                });
            }
            return { success: true, data: filtered };
        }
        catch {
            // Fallback: query restaurant orders with room_service type
            const orders = await prisma.order.findMany({
                where: {
                    restaurantId,
                    type: 'room_service',
                },
                include: {
                    customer: true,
                    table: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            return { success: true, data: orders };
        }
    });
    app.post('/room-service', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.stayId || !body.roomId) {
            return { success: false, error: 'stayId and roomId are required' };
        }
        const order = await prisma.hotelRoomServiceOrder.create({
            data: {
                restaurantId,
                orderId: body.orderId ? Number(body.orderId) : null,
                stayId: Number(body.stayId),
                roomId: Number(body.roomId),
                guestId: body.guestId ? Number(body.guestId) : null,
                amount: Number(body.amount || 0),
                billTo: body.billTo || 'folio',
                status: body.status || 'pending',
            },
            include: { stay: true, room: true, guest: true },
        });
        return { success: true, data: order };
    });
    app.put('/room-service/:id', async (request) => {
        const orderId = parseInt(request.params.id);
        const body = request.body;
        const data = {};
        if (body.status !== undefined)
            data.status = body.status;
        if (body.billTo !== undefined)
            data.billTo = body.billTo;
        if (body.amount !== undefined)
            data.amount = Number(body.amount);
        // Auto-post to folio when delivered
        if (body.status === 'delivered') {
            const order = await prisma.hotelRoomServiceOrder.findUnique({ where: { id: orderId } });
            if (order?.billTo === 'folio' && order?.stayId) {
                await prisma.hotelFolioCharge.create({
                    data: {
                        restaurantId: order.restaurantId,
                        stayId: order.stayId,
                        chargeDate: new Date(),
                        description: `Room Service Order #${orderId}`,
                        chargeType: 'room_service',
                        amount: Number(order.amount || 0),
                    },
                }).catch(() => { }); // Silently ignore if already posted
            }
        }
        const updated = await prisma.hotelRoomServiceOrder.update({
            where: { id: orderId },
            data,
            include: { stay: true, room: true, guest: true },
        });
        return { success: true, data: updated };
    });
    // ─── VENUES ──────────────────────────────────────────────────────────────────
    app.get('/venues', async (request) => {
        const restaurantId = request.restaurantId;
        const { search, status } = request.query;
        const where = { restaurantId };
        if (search)
            where.name = { contains: search };
        if (status)
            where.status = status;
        const venues = await prisma.hotelVenue.findMany({ where, orderBy: { createdAt: 'desc' } });
        return { success: true, data: venues };
    });
    app.post('/venues', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.name || body.capacity === undefined || body.baseRate === undefined) {
            return { success: false, error: 'name, capacity, and baseRate are required' };
        }
        const venue = await prisma.hotelVenue.create({
            data: {
                restaurantId,
                name: body.name,
                description: body.description || null,
                capacity: Number(body.capacity),
                baseRate: Number(body.baseRate),
                amenities: body.amenities ?? [],
                status: body.status || 'active',
            },
        });
        return { success: true, data: venue };
    });
    app.put('/venues/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const venueId = parseInt(request.params.id);
        const body = request.body;
        const existing = await prisma.hotelVenue.findFirst({ where: { id: venueId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Venue not found' };
        const data = {};
        if (body.name !== undefined)
            data.name = body.name;
        if (body.description !== undefined)
            data.description = body.description;
        if (body.capacity !== undefined)
            data.capacity = Number(body.capacity);
        if (body.baseRate !== undefined)
            data.baseRate = Number(body.baseRate);
        if (body.amenities !== undefined)
            data.amenities = body.amenities;
        if (body.status !== undefined)
            data.status = body.status;
        const venue = await prisma.hotelVenue.update({ where: { id: venueId }, data });
        return { success: true, data: venue };
    });
    app.delete('/venues/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const venueId = parseInt(request.params.id);
        const linked = await prisma.hotelEvent.count({
            where: { restaurantId, venueId, status: { notIn: ['cancelled'] } },
        });
        if (linked > 0)
            return { success: false, error: `Cannot delete venue with ${linked} active event(s)` };
        await prisma.hotelVenue.delete({ where: { id: venueId } });
        return { success: true };
    });
    // ─── EVENTS ──────────────────────────────────────────────────────────────────
    app.get('/events', async (request) => {
        const restaurantId = request.restaurantId;
        const { status, venueId, dateFrom, dateTo, search } = request.query;
        const where = { restaurantId };
        if (status && status !== 'all')
            where.status = status;
        if (venueId)
            where.venueId = parseInt(venueId);
        if (dateFrom || dateTo) {
            where.eventDate = {};
            if (dateFrom)
                where.eventDate.gte = new Date(dateFrom);
            if (dateTo)
                where.eventDate.lte = new Date(dateTo);
        }
        if (search) {
            where.OR = [
                { eventNumber: { contains: search } },
                { eventName: { contains: search } },
                { customerName: { contains: search } },
            ];
        }
        const events = await prisma.hotelEvent.findMany({
            where,
            include: { venue: true },
            orderBy: { eventDate: 'desc' },
        });
        return { success: true, data: events };
    });
    app.post('/events', async (request) => {
        const restaurantId = request.restaurantId;
        const body = request.body;
        if (!body.eventName || !body.venueId || !body.startTime) {
            return { success: false, error: 'eventName, venueId, and startTime are required' };
        }
        const startDt = new Date(body.startTime);
        const endDt = body.endTime ? new Date(body.endTime) : new Date(startDt.getTime() + 4 * 60 * 60 * 1000);
        const startDateOnly = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate());
        const nextDay = new Date(startDateOnly.getTime() + 24 * 60 * 60 * 1000);
        const startTimeStr = startDt.toTimeString().slice(0, 5);
        const endTimeStr = endDt.toTimeString().slice(0, 5);
        const conflict = await prisma.hotelEvent.findFirst({
            where: {
                restaurantId,
                venueId: Number(body.venueId),
                status: { notIn: ['cancelled'] },
                eventDate: { gte: startDateOnly, lt: nextDay },
                AND: [
                    { eventTime: { lt: endTimeStr } },
                    { OR: [{ endTime: { gt: startTimeStr } }, { endTime: null }] },
                ],
            },
        });
        if (conflict)
            return {
                success: false,
                error: `Venue is already booked for the selected time (${conflict.eventName})`,
            };
        const count = await prisma.hotelEvent.count({ where: { restaurantId } });
        const eventNumber = `EVT-${restaurantId}-${String(count + 1).padStart(4, '0')}`;
        const event = await prisma.hotelEvent.create({
            data: {
                restaurantId,
                eventNumber,
                eventName: body.eventName,
                venueId: Number(body.venueId),
                customerName: body.customerName || null,
                customerPhone: body.customerPhone || null,
                eventDate: startDt,
                eventTime: startTimeStr,
                endTime: endTimeStr,
                guestsCount: Number(body.expectedGuests || 0),
                status: body.status || 'tentative',
                totalAmount: Number(body.packageAmount || 0),
                depositAmount: Number(body.advancePaid || 0),
                specialRequirements: body.specialRequests || body.description || null,
            },
            include: { venue: true },
        });
        return { success: true, data: event };
    });
    app.put('/events/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const eventId = parseInt(request.params.id);
        const body = request.body;
        const existing = await prisma.hotelEvent.findFirst({ where: { id: eventId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Event not found' };
        const venueId = body.venueId ? Number(body.venueId) : existing.venueId;
        const startDt = body.startTime ? new Date(body.startTime) : new Date(existing.eventDate);
        const endDt = body.endTime ? new Date(body.endTime) : (body.startTime ? new Date(body.startTime) : new Date(startDt.getTime() + 4 * 60 * 60 * 1000));
        const startDateOnly = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate());
        const nextDay = new Date(startDateOnly.getTime() + 24 * 60 * 60 * 1000);
        const startTimeStr = startDt.toTimeString().slice(0, 5);
        const endTimeStr = endDt.toTimeString().slice(0, 5);
        if (body.startTime || body.endTime || body.venueId) {
            const conflict = await prisma.hotelEvent.findFirst({
                where: {
                    id: { not: eventId },
                    restaurantId,
                    venueId,
                    status: { notIn: ['cancelled'] },
                    eventDate: { gte: startDateOnly, lt: nextDay },
                    AND: [
                        { eventTime: { lt: endTimeStr } },
                        { OR: [{ endTime: { gt: startTimeStr } }, { endTime: null }] },
                    ],
                },
            });
            if (conflict)
                return {
                    success: false,
                    error: `Venue is already booked for the selected time (${conflict.eventName})`,
                };
        }
        const data = {};
        if (body.eventName !== undefined)
            data.eventName = body.eventName;
        if (body.venueId !== undefined)
            data.venueId = venueId;
        if (body.customerName !== undefined)
            data.customerName = body.customerName;
        if (body.customerPhone !== undefined)
            data.customerPhone = body.customerPhone;
        if (body.startTime !== undefined)
            data.eventDate = body.startTime ? new Date(body.startTime) : existing.eventDate;
        if (body.startTime !== undefined)
            data.eventTime = startTimeStr;
        if (body.endTime !== undefined)
            data.endTime = endTimeStr;
        if (body.expectedGuests !== undefined)
            data.guestsCount = Number(body.expectedGuests);
        if (body.status !== undefined)
            data.status = body.status;
        if (body.packageAmount !== undefined)
            data.totalAmount = Number(body.packageAmount);
        if (body.advancePaid !== undefined)
            data.depositAmount = Number(body.advancePaid);
        if (body.description !== undefined)
            data.specialRequirements = body.description;
        if (body.specialRequests !== undefined)
            data.specialRequirements = body.specialRequests;
        const event = await prisma.hotelEvent.update({
            where: { id: eventId },
            data,
            include: { venue: true },
        });
        return { success: true, data: event };
    });
    app.delete('/events/:id', async (request) => {
        const restaurantId = request.restaurantId;
        const eventId = parseInt(request.params.id);
        const existing = await prisma.hotelEvent.findFirst({ where: { id: eventId, restaurantId } });
        if (!existing)
            return { success: false, error: 'Event not found' };
        await prisma.hotelEvent.update({ where: { id: eventId }, data: { status: 'cancelled' } });
        return { success: true };
    });
}
