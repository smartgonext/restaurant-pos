# Hotel Module API Endpoints Reference

## Backend API Endpoints (Already Implemented)

All endpoints require authentication via JWT token in Authorization header:
```
Authorization: Bearer {token}
```

---

## Hotel Routes Base Path
```
/api/restaurant/hotel/
```

---

## 1. Room Types Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/room-types` | RoomTypes.tsx | Get all room types |
| POST | `/room-types` | RoomTypes.tsx (Modal) | Create new room type |
| PUT | `/room-types/:id` | RoomTypes.tsx (Modal) | Update room type |
| DELETE | `/room-types/:id` | RoomTypes.tsx (Table) | Delete room type |

**Request Body (POST/PUT):**
```json
{
  "name": "Deluxe Double",
  "description": "Spacious room with...",
  "basePrice": 150.00,
  "maxOccupancy": 2,
  "category": "deluxe"
}
```

---

## 2. Rooms Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/rooms` | Rooms.tsx | Get all rooms |
| POST | `/rooms` | Rooms.tsx (Modal) | Create new room |
| PUT | `/rooms/:id` | Rooms.tsx (Modal) | Update room |
| DELETE | `/rooms/:id` | Rooms.tsx (Table) | Delete room |

**Request Body (POST/PUT):**
```json
{
  "roomNumber": "101",
  "roomTypeId": 1,
  "floor": 1,
  "status": "available"
}
```

**Status Options:** available, occupied, maintenance, reserved

---

## 3. Guests Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/guests` | Guests.tsx | Get all guests |
| POST | `/guests` | Guests.tsx (Modal) | Create new guest |
| PUT | `/guests/:id` | Guests.tsx (Modal) | Update guest |
| DELETE | `/guests/:id` | Guests.tsx (Table) | Delete guest |

**Request Body (POST/PUT):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1 555-0123",
  "address": "123 Main St",
  "city": "New York",
  "postalCode": "10001",
  "country": "USA"
}
```

---

## 4. Reservations Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/reservations` | Reservations.tsx | Get all reservations |
| POST | `/reservations` | Reservations.tsx (Modal) | Create new reservation |
| PUT | `/reservations/:id` | Reservations.tsx (Modal) | Update reservation |
| DELETE | `/reservations/:id` | Reservations.tsx (Table) | Delete reservation |
| GET | `/reservations/availability` | (Helpers) | Check room availability |

**Request Body (POST/PUT):**
```json
{
  "guestId": 1,
  "checkInDate": "2024-04-01",
  "checkOutDate": "2024-04-05",
  "numberOfRooms": 2,
  "totalPrice": 600.00,
  "status": "confirmed"
}
```

**Status Options:** pending, confirmed, cancelled

---

## 5. Rate Plans Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/rate-plans` | RatePlans.tsx | Get all rate plans |
| POST | `/rate-plans` | RatePlans.tsx (Modal) | Create new rate plan |
| PUT | `/rate-plans/:id` | RatePlans.tsx (Modal) | Update rate plan |
| DELETE | `/rate-plans/:id` | RatePlans.tsx (Table) | Delete rate plan |

**Request Body (POST/PUT):**
```json
{
  "name": "Summer Peak",
  "description": "High season pricing",
  "roomTypeId": 1,
  "basePrice": 200.00,
  "seasonType": "peak",
  "discount": 10,
  "isActive": true
}
```

**Season Types:** standard, peak, offpeak

---

## 6. Guest Check-In Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/check-in/pending` | CheckIn.tsx | Get pending check-ins |
| POST | `/check-in/:reservationId` | CheckIn.tsx | Check-in guest |

---

## 7. Guest Check-Out Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/check-out/pending` | CheckOut.tsx | Get pending check-outs |
| POST | `/check-out/:stayId` | CheckOut.tsx | Check-out guest |

---

## 8. Dashboard Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/dashboard/stats` | Dashboard.tsx | Get occupancy stats |
| GET | `/dashboard/arrivals` | Dashboard.tsx | Get today's arrivals |
| GET | `/dashboard/departures` | Dashboard.tsx | Get today's departures |
| GET | `/dashboard/in-house` | Dashboard.tsx | Get in-house guests |

---

## 9. Additional Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| GET | `/room-status-board` | StatusBoard.tsx | Get room status |
| GET | `/housekeeping` | Housekeeping.tsx | Get housekeeping tasks |
| GET | `/stays` | Stays.tsx | Get all stays |
| GET | `/venues` | Banquets.tsx | Get venues |
| GET | `/events` | Banquets.tsx | Get events |

---

## SuperAdmin Module Management Endpoints

| Method | Endpoint | Frontend | Purpose |
|--------|----------|----------|---------|
| PUT | `/superadmin/restaurants/:id/modules` | Restaurants.tsx | Update restaurant modules |

**Request Body:**
```json
{
  "modules": ["restaurant", "hotel", "cash_register"]
}
```

**Validation Rules:**
- At least one core module required (restaurant OR hotel)
- Addon modules (cash_register, inventory, kitchens) require restaurant module
- Valid module IDs: restaurant, hotel, cash_register, inventory, kitchens

---

## Error Handling

All endpoints return errors in this format:
```json
{
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- 200: Success
- 400: Bad Request (validation error)
- 401: Unauthorized (invalid/missing token)
- 403: Forbidden (no permission)
- 404: Not Found (resource doesn't exist)
- 500: Server Error

---

## Frontend API Integration Pattern

All pages use this pattern:

```typescript
import api from '@/lib/api';

// GET request
const { data } = useQuery({
  queryKey: ['entity'],
  queryFn: () => api.get('/restaurant/hotel/endpoint').then(r => r.data),
});

// POST request
await api.post('/restaurant/hotel/endpoint', {
  name: 'value',
  // ... other fields
});

// PUT request
await api.put(`/restaurant/hotel/endpoint/${id}`, {
  // updated fields
});

// DELETE request
await api.delete(`/restaurant/hotel/endpoint/${id}`);
```

---

## Testing with cURL

```bash
# Get all room types
curl -X GET http://localhost:3001/api/restaurant/hotel/room-types \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create room type
curl -X POST http://localhost:3001/api/restaurant/hotel/room-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Deluxe",
    "basePrice": 150,
    "maxOccupancy": 2,
    "category": "deluxe"
  }'

# Update room type
curl -X PUT http://localhost:3001/api/restaurant/hotel/room-types/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Deluxe",
    "basePrice": 200,
    "maxOccupancy": 2
  }'

# Delete room type
curl -X DELETE http://localhost:3001/api/restaurant/hotel/room-types/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Database Schema (Prisma Models)

```prisma
model HotelRoom {
  id Int @id @default(autoincrement())
  roomNumber String
  roomTypeId Int
  roomType HotelRoomType @relation(fields: [roomTypeId], references: [id])
  floor Int
  status String @default("available")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model HotelRoomType {
  id Int @id @default(autoincrement())
  name String
  description String?
  basePrice Decimal
  maxOccupancy Int
  category String?
  createdAt DateTime @default(now())
}

model HotelGuest {
  id Int @id @default(autoincrement())
  firstName String
  lastName String
  email String
  phone String
  address String?
  city String?
  postalCode String?
  country String?
  createdAt DateTime @default(now())
}

model HotelReservation {
  id Int @id @default(autoincrement())
  guestId Int
  guest HotelGuest @relation(fields: [guestId], references: [id])
  checkInDate DateTime
  checkOutDate DateTime
  numberOfRooms Int
  totalPrice Decimal
  status String
  createdAt DateTime @default(now())
}

model HotelRatePlan {
  id Int @id @default(autoincrement())
  name String
  description String?
  roomTypeId Int
  roomType HotelRoomType @relation(fields: [roomTypeId], references: [id])
  basePrice Decimal
  seasonType String
  discount Decimal?
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
}
```

---

## Notes

1. All date fields are ISO 8601 format: `YYYY-MM-DD`
2. Decimal fields (prices) should be passed as numbers
3. All list endpoints support query parameters for filtering (handled by frontend)
4. Pagination is handled client-side using JavaScript
5. Search is performed client-side after fetching all records
6. Export functionality is client-side using ExportDropdown component
7. All dates are stored in UTC in database
8. Soft delete not implemented - deletion is permanent

