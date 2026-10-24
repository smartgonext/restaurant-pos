# Hotel Module - API Implementation Status

## Overview
This document tracks the implementation status of the Hotel Module API endpoints. The hotel module is integrated into the restaurant routes and accessible at `/api/restaurant/hotel/`.

---

## 1. Room Types Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/room-types` | ✅ Implemented | Supports pagination, filtering by status and search |
| POST | `/room-types` | ✅ Implemented | Creates new room type with images and amenities |
| PUT | `/room-types/:id` | ✅ Implemented | Updates room type details |
| DELETE | `/room-types/:id` | ✅ Implemented | Prevents deletion if rooms are linked |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L53-L157)

---

## 2. Rooms Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/rooms` | ✅ Implemented | Filters by roomTypeId, floor, status, search |
| GET | `/rooms/availability` | ✅ Implemented | **NOTE: THIS MUST COME BEFORE `/rooms/:id`** |
| POST | `/rooms` | ✅ Implemented | Creates new room with validation |
| PUT | `/rooms/:id` | ✅ Implemented | Updates room details and status |
| DELETE | `/rooms/:id` | ✅ Implemented | Prevents deletion if active stays exist |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L159-L288)

**CRITICAL NOTE:** The `/rooms/availability` endpoint MUST be registered BEFORE `/rooms/:id` to prevent route conflicts.

---

## 3. Room Status Board ✅ IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/room-status-board` | ✅ Implemented | Shows current room status with active stays |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L290-L308)

---

## 4. Guests Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/guests` | ✅ Implemented | Full-text search across name, email, phone, idNumber |
| POST | `/guests` | ✅ Implemented | Creates guest with detailed info (ID, passport, etc.) |
| PUT | `/guests/:id` | ✅ Implemented | Updates guest information |
| DELETE | `/guests/:id` | ✅ Implemented | Prevents deletion if active stays exist |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L310-L416)

---

## 5. Rate Plans Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/rate-plans` | ✅ Implemented | Supports filtering and search |
| POST | `/rate-plans` | ✅ Implemented | Creates rate plan with cancellation policy |
| PUT | `/rate-plans/:id` | ✅ Implemented | Updates rate plan details |
| DELETE | `/rate-plans/:id` | ✅ Implemented | Prevents deletion if active reservations use it |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L418-L484)

---

## 6. Reservations Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/reservations` | ✅ Implemented | Advanced filtering: status, date range, search |
| POST | `/reservations` | ✅ Implemented | Multi-room reservations with auto-assignment |
| PUT | `/reservations/:id` | ✅ Implemented | Updates reservation details |
| PATCH | `/reservations/:id/cancel` | ✅ Implemented | Cancels reservation (prevents cancellation of checked-in) |
| DELETE | `/reservations/:id` | ✅ Implemented | Soft-deletes by setting status to 'cancelled' |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L486-L615)

---

## 7. Check-In Flow ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/check-in/pending` | ✅ Implemented | Gets pending check-ins for date |
| POST | `/check-in/:reservationId` | ✅ Implemented | Complex: Creates stay, posts charges, records payments |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L617-L702)

**Features:**
- Auto-assigns rooms from reservation
- Creates folio charge for room nights
- Records advance payments
- Updates room status to occupied
- Updates reservation status to checked_in

---

## 8. Check-Out Flow ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/check-out/pending` | ✅ Implemented | Gets pending check-outs for date |
| GET | `/check-out/:stayId/folio` | ✅ Implemented | **MUST COME BEFORE POST /check-out/:stayId** |
| POST | `/check-out/:stayId` | ✅ Implemented | Complex: Updates stay, creates tasks, calculates balance |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L704-L779)

**CRITICAL NOTE:** The `/check-out/:stayId/folio` endpoint MUST be registered BEFORE the POST handler.

**Features:**
- Accepts final payment  
- Updates room status to vacant_dirty
- Creates housekeeping task
- Calculates balance due

---

## 9. Dashboard Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/dashboard/stats` | ✅ Implemented | Gets occupancy metrics |
| GET | `/dashboard/arrivals` | ✅ Implemented | Today's arrivals list |
| GET | `/dashboard/departures` | ✅ Implemented | Today's departures list |
| GET | `/dashboard/in-house` | ✅ Implemented | Current in-house guests |
| GET | `/dashboard` | ✅ Implemented | Unified endpoint (all data combined) |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L781-L861)

---

## 10. Housekeeping Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/housekeeping` | ✅ Implemented | Supports filtering by status, date range, room |
| POST | `/housekeeping` | ✅ Implemented | Creates housekeeping task |
| PUT | `/housekeeping/:id` | ✅ Implemented | Updates task status and assignment |
| DELETE | `/housekeeping/:id` | ✅ Implemented | Removes task |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L863-L906)

---

## 11. Stays & Folio (Guest Billing) ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/stays` | ✅ Implemented | Advanced filtering: status, date range, search |
| GET | `/stays/:id` | ✅ Implemented | Single stay details with charges & payments |
| GET | `/stays/:id/folio` | ✅ Implemented | **MUST COME BEFORE GET /stays/:id** |
| POST | `/stays/:id/charges` | ✅ Implemented | Adds extra charges to folio |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L908-L976)

**CRITICAL NOTE:** The `/stays/:id/folio` endpoint MUST be registered BEFORE the generic `/stays/:id` endpoint.

---

## 12. Room Service Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/room-service` | ✅ Implemented | Supports status filter and search |
| POST | `/room-service` | ✅ Implemented | Creates room service order |
| PUT | `/room-service/:id` | ✅ Implemented | Updates status, auto-posts charges to folio |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L978-L1043)

**Features:**
- Auto-posts to guest folio when status = 'delivered'
- Supports multiple billing options (folio, cash, credit)

---

## 13. Event Venues Endpoints ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/venues` | ✅ Implemented | Search and status filtering |
| POST | `/venues` | ✅ Implemented | Creates event venue |
| PUT | `/venues/:id` | ✅ Implemented | Updates venue details |
| DELETE | `/venues/:id` | ✅ Implemented | Prevents deletion if active events exist |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L1045-L1090)

---

## 14. Events (Banquets/Meetings) ✅ FULLY IMPLEMENTED

| Method | Endpoint | Status | Notes |
|--------|----------|--------|-------|
| GET | `/events` | ✅ Implemented | Filtering: status, venue, date range, search |
| POST | `/events` | ✅ Implemented | Creates event with conflict detection |
| PUT | `/events/:id` | ✅ Implemented | Updates event, validates venue availability |
| DELETE | `/events/:id` | ✅ Implemented | Sets status to 'cancelled' |

**Handler Location:** [apps/api/src/routes/restaurant/hotel.ts](apps/api/src/routes/restaurant/hotel.ts#L1092-L1200)

**Features:**
- Automatic event numbering (EVT-{restaurantId}-{sequence})
- Venue conflict detection by date/time
- Reservation numbering (RES-{restaurantId}-{sequence})

---

## Implementation Summary

### ✅ Completed Sections
- Room Types Management
- Rooms Management  
- Room Status Board
- Guest Management
- Rate Plans
- Reservations (with multi-room support)
- Check-In Flow (with folio creation)
- Check-Out Flow (with task creation)
- Dashboard (unified + individual endpoints)
- Housekeeping Tasks
- Stays & Folio Management
- Room Service Orders
- Event Venues
- Events/Banquets

### Frontend Implementation Status
All hotel pages are implemented:
- ✅ [RoomTypes.tsx](apps/web/src/pages/hotel/RoomTypes.tsx)
- ✅ [Rooms.tsx](apps/web/src/pages/hotel/Rooms.tsx)
- ✅ [StatusBoard.tsx](apps/web/src/pages/hotel/StatusBoard.tsx)
- ✅ [Guests.tsx](apps/web/src/pages/hotel/Guests.tsx)
- ✅ [RatePlans.tsx](apps/web/src/pages/hotel/RatePlans.tsx)
- ✅ [Reservations.tsx](apps/web/src/pages/hotel/Reservations.tsx)
- ✅ [CheckIn.tsx](apps/web/src/pages/hotel/CheckIn.tsx)
- ✅ [CheckOut.tsx](apps/web/src/pages/hotel/CheckOut.tsx)
- ✅ [FrontDesk.tsx](apps/web/src/pages/hotel/FrontDesk.tsx)
- ✅ [Stays.tsx](apps/web/src/pages/hotel/Stays.tsx)
- ✅ [Housekeeping.tsx](apps/web/src/pages/hotel/Housekeeping.tsx)
- ✅ [RoomService.tsx](apps/web/src/pages/hotel/RoomService.tsx)
- ✅ [Banquets.tsx](apps/web/src/pages/hotel/Banquets.tsx)

---

## Route Registration

All hotel routes are registered in [apps/api/src/routes/restaurant/index.ts](apps/api/src/routes/restaurant/index.ts#L169):

```typescript
await app.register(hotelRoutes, { prefix: '/hotel' });
```

This makes all endpoints accessible at:
```
BASE_URL/api/restaurant/hotel/<endpoint>
```

---

## Authentication & Authorization

All hotel endpoints require:
1. **JWT Token** in Authorization header
2. **Restaurant ID** extraction via tenant scope middleware
3. **Middleware Chain:**
   - `authenticate` - Validates JWT token
   - `tenantScope` - Extracts and validates restaurant context

---

## Database Models

Hotel module uses the following Prisma models:
- `HotelRoomType` - Room type definitions
- `HotelRoom` - Physical rooms
- `HotelGuest` - Guest information
- `HotelReservation` - Bookings
- `HotelReservationRoom` - Link rooms to reservations
- `HotelStay` - Active guest stays
- `HotelFolioCharge` - Guest billing charges
- `HotelFolioPayment` - Guest payments
- `HotelRatePlan` - Pricing plans
- `HotelHousekeepingTask` - Cleaning tasks
- `HotelVenue` - Event venues
- `HotelEvent` - Events/Banquets

---

## Testing Endpoints

### Quick Test Sequence:
```bash
# 1. Login to get JWT token
POST /api/auth/login

# 2. Create room type
POST /api/restaurant/hotel/room-types

# 3. Create rooms
POST /api/restaurant/hotel/rooms

# 4. Create guest
POST /api/restaurant/hotel/guests

# 5. Create reservation
POST /api/restaurant/hotel/reservations

# 6. Get pending check-ins
GET /api/restaurant/hotel/check-in/pending

# 7. Check-in guest
POST /api/restaurant/hotel/check-in/:reservationId

# 8. View dashboard
GET /api/restaurant/hotel/dashboard
```

---

## Notes & Warnings

1. **Route Order Matters**: Some endpoints must be registered before their base path:
   - `/rooms/availability` before `/rooms/:id`
   - `/check-out/:stayId/folio` before `POST /check-out/:stayId`
   - `/stays/:id/folio` before `/stays/:id`

2. **Data Validation**:
   - Check-in/out dates are validated
   - Room availability is checked at reservation and check-in
   - Venue conflicts are detected by date/time
   - Cascading delete protection is enforced

3. **Status Transitions**:
   - Reservations: tentative → confirmed → checked_in → checked_out/cancelled
   - Rooms: vacant_clean ↔ vacant_dirty ↔ occupied → maintenance
   - Stays: active → checked_out
   - Events: tentative → confirmed → cancelled

4. **Auto-Generated IDs**:
   - Reservation Number: `RES-{restaurantId}-{padded_count}`
   - Event Number: `EVT-{restaurantId}-{padded_count}`

---

## Integration Points

The hotel module integrates with other restaurant modules:
- **Socket.io** for real-time updates (via `emitToRestaurant`)
- **Prisma** for database operations
- **Authentication** system for JWT validation
- **Multi-tenancy** system for restaurant scoping

---

Last Updated: 2024-12-19
Status: ✅ All Endpoints Implemented
