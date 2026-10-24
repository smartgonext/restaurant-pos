# Hotel Module - Implementation Details & Code Structure

## Architecture Overview

The hotel module follows a **Feature-Based Routing** pattern:

```
├── apps/api/src/
│   ├── routes/restaurant/
│   │   ├── index.ts                    (Main router - registers hotel routes)
│   │   └── hotel.ts                   (Hotel module implementation - 1800+ lines)
│   └── prisma/
│       └── schema.prisma              (Database models)
├── apps/web/src/
│   └── pages/hotel/                   (Frontend pages)
│       ├── RoomTypes.tsx
│       ├── Rooms.tsx
│       ├── Guests.tsx
│       ├── Reservations.tsx
│       ├── CheckIn.tsx
│       ├── CheckOut.tsx
│       ├── StatusBoard.tsx
│       ├── Housekeeping.tsx
│       ├── RoomService.tsx
│       ├── Stays.tsx
│       ├── RatePlans.tsx
│       ├── FrontDesk.tsx
│       └── Banquets.tsx
```

---

## File Structure & Line References

### Main File: hotels.ts
**Location:** `apps/api/src/routes/restaurant/hotel.ts`

**Total Lines:** ~1800

**Structure:**
```typescript
// Helper functions (Lines 22-50)
- extractPrimaryImage()
- normalizeRoomType()
- getDaysBetween()
- formatDateString()

// ─── ROOM TYPES (Lines 53-157)
- app.get('/room-types')
- app.post('/room-types')
- app.put('/room-types/:id')
- app.delete('/room-types/:id')

// ─── ROOMS (Lines 159-308)
- app.get('/rooms')
- app.get('/rooms/availability')
- app.post('/rooms')
- app.put('/rooms/:id')
- app.delete('/rooms/:id')
- app.get('/room-status-board')

// ─── GUESTS (Lines 310-416)
- app.get('/guests')
- app.post('/guests')
- app.put('/guests/:id')
- app.delete('/guests/:id')

// ─── RATE PLANS (Lines 418-484)
- app.get('/rate-plans')
- app.post('/rate-plans')
- app.put('/rate-plans/:id')
- app.delete('/rate-plans/:id')

// ─── RESERVATIONS (Lines 486-615)
- app.get('/reservations')
- app.post('/reservations')
- app.put('/reservations/:id')
- app.patch('/reservations/:id/cancel')
- app.delete('/reservations/:id')

// ─── CHECK-IN (Lines 617-702)
- app.get('/check-in/pending')
- app.post('/check-in/:reservationId')

// ─── CHECK-OUT (Lines 704-779)
- app.get('/check-out/pending')
- app.get('/check-out/:stayId/folio')
- app.post('/check-out/:stayId')

// ─── DASHBOARD (Lines 781-861)
- app.get('/dashboard/stats')
- app.get('/dashboard/arrivals')
- app.get('/dashboard/departures')
- app.get('/dashboard/in-house')
- app.get('/dashboard')

// ─── HOUSEKEEPING (Lines 863-906)
- app.get('/housekeeping')
- app.post('/housekeeping')
- app.put('/housekeeping/:id')
- app.delete('/housekeeping/:id')

// ─── STAYS & FOLIO (Lines 908-976)
- app.get('/stays')
- app.get('/stays/:id')
- app.get('/stays/:id/folio')
- app.post('/stays/:id/charges')

// ─── ROOM SERVICE (Lines 978-1043)
- app.get('/room-service')
- app.post('/room-service')
- app.put('/room-service/:id')

// ─── VENUES (Lines 1045-1090)
- app.get('/venues')
- app.post('/venues')
- app.put('/venues/:id')
- app.delete('/venues/:id')

// ─── EVENTS (Lines 1092-1200+)
- app.get('/events')
- app.post('/events')
- app.put('/events/:id')
- app.delete('/events/:id')
```

---

## Registration Flow

### Step 1: Route Registration in Main App
**File:** `apps/api/src/app.ts`
```typescript
// Line 89-97
import { restaurantRoutes } from './routes/restaurant/index.js';

// In buildApp()
await app.register(restaurantRoutes, { prefix: '/api/restaurant' });
```

### Step 2: Sub-route Registration
**File:** `apps/api/src/routes/restaurant/index.ts`
```typescript
// Line 16
import { hotelRoutes } from './hotel.js';

// Line 169
await app.register(hotelRoutes, { prefix: '/hotel' });
```

### Step 3: Final URL
```
/api/restaurant/hotel/{endpoint}
```

---

## Core Implementation Patterns

### Pattern 1: Simple GET List with Pagination
```typescript
app.get('/room-types', async (request: any) => {
  const restaurantId = request.restaurantId;  // From tenantScope middleware
  const { page = 1, pageSize = 50 } = request.query as any;

  const [items, total] = await Promise.all([
    prisma.hotelRoomType.findMany({
      where: { restaurantId },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    }),
    prisma.hotelRoomType.count({ where: { restaurantId } }),
  ]);

  return { success: true, data: items, total };
});
```

### Pattern 2: CREATE with Validation
```typescript
app.post('/room-types', async (request: any) => {
  const restaurantId = request.restaurantId;
  const body = request.body as any;

  // Validation
  if (!body.name || Number.isNaN(body.maxOccupancy)) {
    return { success: false, error: 'name and maxOccupancy required' };
  }

  // Creation
  const item = await prisma.hotelRoomType.create({
    data: {
      restaurantId,
      name: body.name,
      maxOccupancy: Number(body.maxOccupancy),
      // ... other fields
    },
  });

  return { success: true, data: item };
});
```

### Pattern 3: UPDATE with Conditional Updates
```typescript
app.put('/rooms/:id', async (request: any) => {
  const roomId = parseInt((request.params as any).id);
  const body = request.body as any;

  const data: any = {};
  if (body.roomNumber !== undefined) data.roomNumber = body.roomNumber;
  if (body.status !== undefined) data.status = body.status;
  // ... only update provided fields

  const room = await prisma.hotelRoom.update({
    where: { id: roomId },
    data,
  });

  return { success: true, data: room };
});
```

### Pattern 4: DELETE with Cascade Check
```typescript
app.delete('/room-types/:id', async (request: any) => {
  const restaurantId = request.restaurantId;
  const roomTypeId = parseInt((request.params as any).id);

  // Check for linked resources
  const linked = await prisma.hotelRoom.count({
    where: { restaurantId, roomTypeId },
  });

  if (linked > 0) {
    return { success: false, error: `Cannot delete: ${linked} rooms use this type` };
  }

  await prisma.hotelRoomType.delete({ where: { id: roomTypeId } });
  return { success: true };
});
```

### Pattern 5: Complex Business Logic (Check-In)
```typescript
app.post('/check-in/:reservationId', async (request: any) => {
  const resId = parseInt((request.params as any).reservationId);
  const body = request.body as any;

  // 1. Fetch & validate reservation
  const reservation = await prisma.hotelReservation.findFirst({
    where: { id: resId },
  });
  if (!reservation) return { success: false, error: 'Not found' };

  // 2. Create stay record
  const stay = await prisma.hotelStay.create({
    data: {
      reservationId: resId,
      guestId: reservation.guestId,
      status: 'active',
    },
  });

  // 3. Create folio charges
  await prisma.hotelFolioCharge.create({
    data: {
      stayId: stay.id,
      description: `Room charges`,
      amount: nights * nightlyRate,
    },
  });

  // 4. Update related records
  await Promise.all([
    prisma.hotelRoom.update({
      where: { id: roomId },
      data: { status: 'occupied' },
    }),
    prisma.hotelReservation.update({
      where: { id: resId },
      data: { status: 'checked_in' },
    }),
  ]);

  return { success: true, data: stay };
});
```

---

## Middleware Chain

Each hotel route goes through:

```typescript
app.addHook('onRequest', authenticate);      // Validates JWT
app.addHook('onRequest', tenantScope);       // Extracts restaurantId
```

### authenticate Middleware
**File:** `apps/api/src/middleware/authenticate.ts`
- Validates JWT token from Authorization header
- Decodes and attaches user info to request
- Returns 401 if invalid/missing

### tenantScope Middleware
**File:** `apps/api/src/middleware/tenantScope.ts`
- Extracts restaurantId from user context
- Attaches to request object: `request.restaurantId`
- All queries filtered by restaurantId (multi-tenancy)

---

## Error Handling Pattern

All endpoints follow standardized error responses:

```typescript
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": "Descriptive error message"
}

// With pagination
{
  "success": true,
  "data": [ ... ],
  "total": 42
}
```

---

## Database Query Patterns

### 1. Filtered Search
```typescript
const where: any = { restaurantId };
if (search) {
  where.name = { contains: search };
}
const items = await prisma.hotelRoomType.findMany({ where });
```

### 2. Relationship Includes
```typescript
const guest = await prisma.hotelGuest.findMany({
  where: { restaurantId },
  include: {
    stays: true,                        // Related stays
    reservations: true,                 // Related reservations
  },
});
```

### 3. Grouped Aggregations
```typescript
const roomCounts = await prisma.hotelRoom.groupBy({
  by: ['roomTypeId'],
  where: { restaurantId },
  _count: { id: true },
});
const countMap = Object.fromEntries(
  roomCounts.map((r) => [r.roomTypeId, r._count.id])
);
```

### 4. Complex Filtering with OR
```typescript
const reservations = await prisma.hotelReservation.findMany({
  where: {
    restaurantId,
    OR: [
      { reservationNumber: { contains: search } },
      { guest: { name: { contains: search } } },
      { guest: { phone: { contains: search } } },
    ],
  },
});
```

### 5. Date Range Filtering
```typescript
const where: any = { restaurantId };
if (dateFrom || dateTo) {
  where.checkInDate = {};
  if (dateFrom) where.checkInDate.gte = new Date(dateFrom);
  if (dateTo) where.checkInDate.lte = new Date(dateTo);
}
```

---

## Utility Functions

All hotel routes use shared helpers:

### extractPrimaryImage()
```typescript
const extractPrimaryImage = (value: any): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value.find((v) => typeof v === 'string');
    return first || null;
  }
  return null;
};
```

### getDaysBetween()
```typescript
const getDaysBetween = (checkIn: Date, checkOut: Date): number => {
  const diff = checkOut.getTime() - checkIn.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};
```

### formatDateString()
```typescript
const formatDateString = (value: any): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
};
```

---

## Advanced Features

### 1. Room Availability Check
```typescript
// Get vacant rooms for date range
const allRooms = await prisma.hotelRoom.findMany({
  where: { 
    restaurantId, 
    status: { in: ['vacant_clean', 'vacant_dirty'] }
  },
});

// Find booked rooms
const bookedRooms = await prisma.hotelReservation.findMany({
  where: {
    checkInDate: { lt: checkOut },
    checkOutDate: { gt: checkIn },
    status: { in: ['confirmed', 'tentative'] },
  },
  include: { rooms: true },
});

// Filter booked ones out
const bookedRoomIds = new Set(
  bookedRooms.flatMap(r => r.rooms.map(rr => rr.roomId))
);
const availableRooms = allRooms.filter(r => !bookedRoomIds.has(r.id));
```

### 2. Multi-Room Reservation
```typescript
// Support multiple roomSelections
const roomSelections: Array<{roomTypeId, qty, rate}> = 
  Array.isArray(body.roomSelections) ? body.roomSelections : [];

for (const sel of roomSelections) {
  const availableRooms = await prisma.hotelRoom.findMany({
    where: {
      restaurantId,
      roomTypeId: sel.roomTypeId,
      id: { notIn: Array.from(bookedRoomIds) },
    },
    take: sel.qty,
  });
  
  assignedRoomIds.push(...availableRooms.map(r => r.id));
}

// Create reservation with rooms
await prisma.hotelReservation.create({
  data: {
    // ...
    rooms: {
      create: assignedRoomIds.map(roomId => ({ roomId })),
    },
  },
});
```

### 3. Auto-Increment ID Generation
```typescript
// For reservations
const count = await prisma.hotelReservation.count({ 
  where: { restaurantId } 
});
const reservationNumber = `RES-${restaurantId}-${String(count + 1).padStart(4, '0')}`;

// For events
const eventNumber = `EVT-${restaurantId}-${String(count + 1).padStart(4, '0')}`;
```

### 4. Folio Management
```typescript
// Get folio with summary
const stay = await prisma.hotelStay.findFirst({
  where: { id: stayId },
  include: {
    folioCharges: { orderBy: { chargeDate: 'asc' } },
    folioPayments: { orderBy: { paymentDate: 'asc' } },
  },
});

const subtotal = stay.folioCharges.reduce((s, c) => s + Number(c.amount), 0);
const paid = stay.folioPayments.reduce((s, p) => s + Number(p.amount), 0);

return {
  charges: stay.folioCharges,
  payments: stay.folioPayments,
  summary: {
    subtotal,
    total_paid: paid,
    balance_due: Math.max(subtotal - paid, 0),
  },
};
```

---

## Performance Considerations

1. **Parallel Database Calls:**
   ```typescript
   const [items, total] = await Promise.all([
     prisma.hotelRoomType.findMany({ ... }),
     prisma.hotelRoomType.count({ where }),
   ]);
   ```

2. **Selective Includes:**
   Only include related data when needed:
   ```typescript
   include: {
     guest: true,           // Include guest details
     rooms: {               // Include rooms but only take 1
       include: { roomType: true },
       take: 1,
     },
   }
   ```

3. **Pagination:**
   Always use pagination for large datasets:
   ```typescript
   skip: (page - 1) * pageSize,
   take: pageSize,
   ```

---

## Testing Checklist

Each endpoint should be tested for:

- ✅ Valid request with valid data
- ✅ Missing required fields (400)
- ✅ Invalid ID/resource not found (404)
- ✅ Authorization failure (401)
- ✅ Business rule violations (e.g., room already booked)
- ✅ Cascade protection (e.g., can't delete if linked)
- ✅ Concurrent operations (race conditions)
- ✅ Pagination edge cases (page > total)

---

## Common Issues & Solutions

### Issue: Route Not Found
**Solution:** Check route registration order. Some endpoints must come before others:
```typescript
app.get('/rooms/availability', ...)  // BEFORE
app.put('/rooms/:id', ...)
```

### Issue: Wrong restaurantId
**Solution:** Verify tenantScope middleware is registered before routes

### Issue: Date Parsing Errors
**Solution:** Use provided `formatDateString()` helper:
```typescript
dateOfBirth: body.dateOfBirth ? formatDateString(body.dateOfBirth) : null
```

### Issue: Decimal/Money Accuracy
**Solution:** Use database DECIMAL type, cast properly:
```typescript
basePricePerNight: Number(body.basePricePerNight ?? 0)
```

### Issue: N+1 Query Problem
**Solution:** Use `include` for relationships, not multiple queries:
```typescript
const room = await prisma.hotelRoom.findMany({
  include: { roomType: true },  // Include in single query
});
// NOT: for each room, fetch roomType separately
```

---

## To Add New Feature

1. **Add Prisma Model** (if needed):
   ```typescript
   // apps/api/prisma/schema.prisma
   model HotelNewFeature {
     id  Int  @id @default(autoincrement())
     // ... fields
   }
   ```

2. **Create Migration:**
   ```bash
   npx prisma migrate dev --name add_new_feature
   ```

3. **Add Route Handler:**
   ```typescript
   // In apps/api/src/routes/restaurant/hotel.ts
   app.get('/new-feature', async (request: any) => {
     // ... implementation
   });
   ```

4. **Create Frontend Page:**
   ```typescript
   // apps/web/src/pages/hotel/NewFeature.tsx
   export function NewFeature() {
     // ... component
   }
   ```

5. **Register in Router:**
   ```typescript
   // apps/web/src/router/index.tsx
   import { NewFeature } from '../pages/hotel/NewFeature';
   // ... add route
   ```

---

Last Updated: 2024-12-19
