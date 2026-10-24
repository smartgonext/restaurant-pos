# Hotel Module API - Quick Reference Guide

## Base URL
```
{BASE_URL}/api/restaurant/hotel
```

All endpoints require JWT token in `Authorization: Bearer {token}` header.

---

## 📋 Complete Endpoint List

### Room Types Management
```
GET     /room-types                              Get all room types (paginated)
POST    /room-types                              Create new room type
PUT     /room-types/:id                          Update room type
DELETE  /room-types/:id                          Delete room type
```

### Rooms Management
```
GET     /rooms                                   Get all rooms (filtered)
GET     /rooms/availability                      Check room availability by date ⚠️
POST    /rooms                                   Create new room
PUT     /rooms/:id                               Update room
DELETE  /rooms/:id                               Delete room
GET     /room-status-board                       Get room status board
```

### Guest Management
```
GET     /guests                                  Get all guests
POST    /guests                                  Create new guest
PUT     /guests/:id                              Update guest
DELETE  /guests/:id                              Delete guest
```

### Rate Plans
```
GET     /rate-plans                              Get all rate plans
POST    /rate-plans                              Create rate plan
PUT     /rate-plans/:id                          Update rate plan
DELETE  /rate-plans/:id                          Delete rate plan
```

### Reservations
```
GET     /reservations                            Get all reservations
POST    /reservations                            Create reservation
PUT     /reservations/:id                        Update reservation
PATCH   /reservations/:id/cancel                 Cancel reservation
DELETE  /reservations/:id                        Delete reservation
```

### Check-In Management
```
GET     /check-in/pending                        Get pending check-ins
POST    /check-in/:reservationId                 Check-in guest
```

### Check-Out Management
```
GET     /check-out/pending                       Get pending check-outs
GET     /check-out/:stayId/folio                 Get folio before checkout ⚠️
POST    /check-out/:stayId                       Complete checkout
```

### Dashboard
```
GET     /dashboard                               Get all dashboard data (unified)
GET     /dashboard/stats                         Get occupancy stats only
GET     /dashboard/arrivals                      Get today's arrivals
GET     /dashboard/departures                    Get today's departures
GET     /dashboard/in-house                      Get in-house guests
```

### Stays & Billing (Folio)
```
GET     /stays                                   Get all stays
GET     /stays/:id                               Get stay details
GET     /stays/:id/folio                         Get folio details ⚠️
POST    /stays/:id/charges                       Add charge to folio
```

### Housekeeping
```
GET     /housekeeping                            Get housekeeping tasks
POST    /housekeeping                            Create task
PUT     /housekeeping/:id                        Update task
DELETE  /housekeeping/:id                        Delete task
```

### Room Service
```
GET     /room-service                            Get room service orders
POST    /room-service                            Create order
PUT     /room-service/:id                        Update order (auto-posts to folio)
```

### Event Venues
```
GET     /venues                                  Get venues
POST    /venues                                  Create venue
PUT     /venues/:id                              Update venue
DELETE  /venues/:id                              Delete venue
```

### Events (Banquets/Meetings)
```
GET     /events                                  Get events
POST    /events                                  Create event (with conflict detection)
PUT     /events/:id                              Update event
DELETE  /events/:id                              Cancel event
```

---

## ⚠️ Route Order Critical Notes

The following endpoints **MUST** be registered in this exact order to avoid route conflicts:

1. **Room availability check before room fetch:**
   ```
   app.get('/rooms/availability', ...)  ← BEFORE
   app.get('/rooms/:id', ...)
   ```

2. **Folio retrieval before stay checkout:**
   ```
   app.get('/check-out/:stayId/folio', ...)  ← BEFORE
   app.post('/check-out/:stayId', ...)
   ```

3. **Folio retrieval before stay details:**
   ```
   app.get('/stays/:id/folio', ...)  ← BEFORE
   app.get('/stays/:id', ...)
   ```

---

## 📊 Request/Response Examples

### 1. Create Room Type
```bash
POST /api/restaurant/hotel/room-types
Content-Type: application/json

{
  "name": "Deluxe Double",
  "description": "Spacious double bed room",
  "basePricePerNight": 150.00,
  "maxOccupancy": 2,
  "amenities": ["WiFi", "AC", "TV"],
  "photos": ["https://..."],
  "status": "active"
}

Response: 201
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Deluxe Double",
    "basePricePerNight": 150,
    "maxOccupancy": 2,
    "roomsCount": 0,
    ...
  }
}
```

### 2. Create Guest
```bash
POST /api/restaurant/hotel/guests
Content-Type: application/json

{
  "name": "John Doe",
  "phone": "+1-555-0123",
  "email": "john@example.com",
  "address": "123 Main St",
  "city": "New York",
  "country": "USA",
  "idType": "passport",
  "idNumber": "ABC123456"
}

Response: 201
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1-555-0123",
    ...
  }
}
```

### 3. Create Reservation
```bash
POST /api/restaurant/hotel/reservations
Content-Type: application/json

{
  "guestId": 1,
  "checkInDate": "2024-12-25",
  "checkOutDate": "2024-12-30",
  "numberOfGuests": 2,
  "roomSelections": [
    {"roomTypeId": 1, "qty": 1, "rate": 150.00}
  ],
  "status": "confirmed"
}

Response: 201
{
  "success": true,
  "data": {
    "id": 1,
    "reservationNumber": "RES-{id}-0001",
    "guestId": 1,
    "checkInDate": "2024-12-25T00:00:00Z",
    ...
  }
}
```

### 4. Check-In Guest
```bash
POST /api/restaurant/hotel/check-in/1
Content-Type: application/json

{
  "assignedRooms": [
    {"roomId": 5}
  ],
  "notes": "Guest arrived early"
}

Response: 200
{
  "success": true,
  "data": {
    "id": 1,
    "guestId": 1,
    "roomId": 5,
    "checkInDatetime": "2024-12-25T14:30:00Z",
    "status": "active"
  }
}
```

### 5. Get Dashboard
```bash
GET /api/restaurant/hotel/dashboard

Response: 200
{
  "success": true,
  "data": {
    "arrivals_today": 3,
    "departures_today": 2,
    "in_house_count": 12,
    "occupancy_rate": 75,
    "total_rooms": 16,
    "arrivals_list": [...],
    "departures_list": [...],
    "in_house_list": [...]
  }
}
```

### 6. Get Room Availability
```bash
GET /api/restaurant/hotel/rooms/availability?checkInDate=2024-12-25&checkOutDate=2024-12-30&roomTypeId=1

Response: 200
{
  "success": true,
  "data": [
    {
      "id": 5,
      "roomNumber": "101",
      "roomTypeId": 1,
      "status": "vacant_clean",
      "floor": 1
    },
    {
      "id": 6,
      "roomNumber": "102",
      "roomTypeId": 1,
      "status": "vacant_clean",
      "floor": 1
    }
  ]
}
```

### 7. Get Stay Folio
```bash
GET /api/restaurant/hotel/stays/1/folio

Response: 200
{
  "success": true,
  "data": {
    "stay": {
      "id": 1,
      "guestId": 1,
      "roomId": 5,
      "status": "active",
      ...
    },
    "charges": [
      {
        "id": 1,
        "description": "Room 101 × 5 nights",
        "amount": 750.00,
        "chargeType": "room"
      }
    ],
    "payments": [
      {
        "id": 1,
        "amount": 200.00,
        "paymentMethod": "card"
      }
    ],
    "summary": {
      "subtotal": 750.00,
      "total_paid": 200.00,
      "balance_due": 550.00
    }
  }
}
```

---

## 🔍 Common Query Parameters

### Room Filtering
```
GET /rooms?roomTypeId=1&floor=2&status=occupied&search=101
```

### Reservation Filtering
```
GET /reservations?status=confirmed&dateFrom=2024-12-01&dateTo=2024-12-31&search=John
```

### Housekeeping Filtering
```
GET /housekeeping?status=pending&date=2024-12-25
```

### Event Filtering
```
GET /events?status=confirmed&venueId=1&dateFrom=2024-12-01
```

---

## 📝 Status Values

### Room Status
- `vacant_clean` - Available & cleaned
- `vacant_dirty` - Available but needs cleaning
- `occupied` - Guest checked in
- `maintenance` - Under maintenance

### Reservation Status
- `pending` - Initial state
- `tentative` - Under consideration
- `confirmed` - Definite booking
- `checked_in` - Guest arrived
- `checked_out` - Guest departed
- `cancelled` - Cancelled reservation

### Stay Status
- `active` - Guest currently in room
- `checked_out` - Guest has departed

### Housekeeping Status
- `pending` - Not started
- `in_progress` - Currently being done
- `completed` - Finished

### Event Status
- `tentative` - Pending approval
- `confirmed` - Approved
- `cancelled` - Cancelled

---

## 🔐 Authentication

All requests must include:
```bash
Authorization: Bearer {JWT_TOKEN}
```

Obtain token via:
```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password"
}
```

---

## 🐛 Error Responses

All error responses follow this format:
```json
{
  "success": false,
  "error": "Descriptive error message"
}
```

Common status codes:
- `200` - Success (GET, POST, PUT, PATCH)
- `201` - Created (POST)
- `400` - Bad request (missing required fields)
- `401` - Unauthorized (invalid/missing token)
- `404` - Not found (resource doesn't exist)
- `409` - Conflict (e.g., room already booked, duplicate room number)
- `500` - Server error

---

## 💡 Tips & Best Practices

1. **Check Availability First**: Always verify room availability before creating reservations
2. **Use Pagination**: Add `page` and `pageSize` parameters to large list queries
3. **Filter Early**: Use available filters to reduce response size
4. **Multi-Room Handling**: Use `roomSelections` array for multi-room reservations
5. **Folio Management**: Always fetch folio before checkout to confirm balance
6. **Conflict Detection**: Events automatically check for venue conflicts
7. **Task Automation**: Check-out automatically creates housekeeping tasks
8. **Room Service Billing**: Mark as 'delivered' to auto-post charges to folio

---

## 📚 Related Documentation

- [API Endpoints Reference](API_ENDPOINTS_REFERENCE.md)
- [Client-Server Communication](CLIENT_SERVER_COMMUNICATION.md)
- [Database Schema](apps/api/prisma/schema.prisma)
- [Hotel Route Implementation](apps/api/src/routes/restaurant/hotel.ts)

---

Generated: 2024-12-19
Last Updated: 2024-12-19
