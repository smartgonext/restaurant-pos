# Hotel Module - Database Schema Reference

## Database Models Overview

The hotel module uses 10 main Prisma models to manage all hotel operations:

```
HotelRoomType
    ↓
HotelRoom ← HotelReservationRoom ← HotelReservation
    ↓                                    ↓
HotelStay ← Guest (HotelGuest)         RatePlan
    ├─→ HotelFolioCharge
    └─→ HotelFolioPayment

HotelVenue
    ↓
HotelEvent
```

---

## 1. HotelRoomType

**Purpose:** Define room categories and pricing

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key (multi-tenancy) |
| name | String | Room type name (e.g., "Deluxe Double") |
| description | Text | Room description |
| baseOccupancy | Int | Standard occupancy (default: 1) |
| maxOccupancy | Int | Maximum occupancy allowed |
| basePricePerNight | Decimal | Base rate per night |
| amenities | Json | Array of amenities |
| photos | Json | Array of photo URLs |
| image | String | Primary image URL |
| status | String | "active" or "inactive" |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `rooms` ← HotelRoom[]

**Unique Constraints:** None

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "name": "Deluxe Double",
  "description": "Spacious double room with city view",
  "baseOccupancy": 2,
  "maxOccupancy": 3,
  "basePricePerNight": 150.00,
  "amenities": ["WiFi", "AC", "Smart TV", "Mini Bar"],
  "photos": ["url1.jpg", "url2.jpg"],
  "image": "primary.jpg",
  "status": "active"
}
```

---

## 2. HotelRoom

**Purpose:** Individual room inventory

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| roomTypeId | Int | Foreign key to HotelRoomType |
| roomNumber | String | Room identifier (e.g., "101") |
| floor | Int | Floor number |
| status | String | vacant_clean, vacant_dirty, occupied, maintenance |
| notes | Text | Additional notes |
| image | String | Room image URL |
| isActive | Boolean | Active/inactive flag |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `roomType` → HotelRoomType (cascade delete)
- `stays` ← HotelStay[]
- `housekeepingTasks` ← HotelHousekeepingTask[]
- `reservationRooms` ← HotelReservationRoom[]

**Unique Constraints:**
```
@@unique([restaurantId, roomNumber])
```
Each restaurant can have only one room with same number.

**Status Values:**
- `vacant_clean` - Available and cleaned
- `vacant_dirty` - Available but needs cleaning
- `occupied` - Guest currently staying
- `maintenance` - Under maintenance

**Example:**
```json
{
  "id": 5,
  "restaurantId": 1,
  "roomTypeId": 1,
  "roomNumber": "101",
  "floor": 1,
  "status": "vacant_clean",
  "notes": "Recently renovated",
  "isActive": true
}
```

---

## 3. HotelGuest

**Purpose:** Guest/customer information

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| name | String | Full name |
| firstName | String | First name |
| lastName | String | Last name |
| email | String | Email address |
| phone | String | Phone number |
| idType | String | ID type (passport, driver's license, etc.) |
| idNumber | String | ID number |
| address | Text | Street address |
| city | String | City |
| state | String | State/Province |
| country | String | Country |
| postalCode | String | Postal code |
| dateOfBirth | String | Date of birth (YYYY-MM-DD) |
| nationality | String | Nationality |
| notes | Text | Additional notes |
| image | String | Guest photo URL |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `reservations` ← HotelReservation[]
- `stays` ← HotelStay[]

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "name": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "+1-555-0123",
  "idType": "passport",
  "idNumber": "AB123456",
  "address": "123 Main Street",
  "city": "New York",
  "country": "USA",
  "postalCode": "10001"
}
```

---

## 4. HotelRatePlan

**Purpose:** Pricing and cancellation policies

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| name | String | Plan name (e.g., "Early Bird", "Peak Season") |
| planType | String | Type of plan |
| cancellationHours | Int | Hours before check-in for free cancellation |
| cancellationFeePercent | Decimal | Cancellation fee as percentage |
| description | Text | Plan description |
| image | String | Plan image URL |
| isActive | Boolean | Active/inactive |
| status | String | "active" or "inactive" |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `reservations` ← HotelReservation[]

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "name": "Standard Plan",
  "planType": "standard",
  "cancellationHours": 24,
  "cancellationFeePercent": 10.00,
  "description": "Cancel free if 24 hours before check-in",
  "status": "active"
}
```

---

## 5. HotelReservation

**Purpose:** Booking records

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| reservationNumber | String | Unique reservation ID (e.g., RES-1-0001) |
| guestId | Int | Foreign key to HotelGuest |
| checkInDate | DateTime | Check-in date |
| checkOutDate | DateTime | Check-out date |
| ratePlanId | Int | Foreign key to HotelRatePlan |
| numberOfGuests | Int | Number of guests |
| status | String | pending, tentative, confirmed, checked_in, checked_out, cancelled |
| specialRequests | Text | Special requirements |
| advancePayment | Decimal | Advance payment received |
| paymentMethod | String | Payment method used |
| createdById | Int | Staff member who created |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `guest` → HotelGuest (cascade delete)
- `ratePlan` → HotelRatePlan (optional)
- `rooms` ← HotelReservationRoom[] (multi-room support)
- `stays` ← HotelStay[]

**Unique Constraints:**
```
@@unique([restaurantId, reservationNumber])
```

**Status Values:**
- `pending` - Just created
- `tentative` - Under consideration
- `confirmed` - Confirmed booking
- `checked_in` - Guest is in-house
- `checked_out` - Guest has departed
- `cancelled` - Cancelled booking

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "reservationNumber": "RES-1-0001",
  "guestId": 1,
  "checkInDate": "2024-12-25T00:00:00Z",
  "checkOutDate": "2024-12-30T00:00:00Z",
  "ratePlanId": 1,
  "numberOfGuests": 2,
  "status": "confirmed",
  "advancePayment": 300.00,
  "paymentMethod": "card"
}
```

---

## 6. HotelReservationRoom

**Purpose:** Link multiple rooms to a single reservation (junction table)

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| reservationId | Int | Foreign key to HotelReservation |
| roomId | Int | Foreign key to HotelRoom |

**Relationships:**
- `reservation` → HotelReservation (cascade delete)
- `room` → HotelRoom (cascade delete)

**Purpose:**
Supports multi-room reservations. One reservation can be linked to multiple rooms.

**Example:**
```json
{
  "id": 1,
  "reservationId": 1,
  "roomId": 5
}
```

---

## 7. HotelStay

**Purpose:** Active guest stay records (created at check-in)

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| reservationId | Int | Foreign key to HotelReservation (optional) |
| guestId | Int | Foreign key to HotelGuest |
| roomId | Int | Foreign key to HotelRoom |
| checkInDatetime | DateTime | Check-in timestamp |
| checkOutDatetime | DateTime | Check-out timestamp |
| status | String | "active" or "checked_out" |
| notes | Text | Stay notes |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `reservation` → HotelReservation (set null on delete)
- `guest` → HotelGuest (cascade delete)
- `room` → HotelRoom (cascade delete)
- `folioCharges` ← HotelFolioCharge[]
- `folioPayments` ← HotelFolioPayment[]

**Status Values:**
- `active` - Guest currently in room
- `checked_out` - Guest has departed

**Note:** 
A stay is created during check-in. It links a guest to a room for a specific period. It also provides the container for folio (billing) records.

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "reservationId": 1,
  "guestId": 1,
  "roomId": 5,
  "checkInDatetime": "2024-12-25T14:30:00Z",
  "checkOutDatetime": null,
  "status": "active"
}
```

---

## 8. HotelFolioCharge

**Purpose:** Billing charges for a stay

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| stayId | Int | Foreign key to HotelStay |
| chargeDate | DateTime | Date of charge |
| description | String | What was charged (e.g., "Room 101 × 5 nights") |
| chargeType | String | Type of charge (room, room_service, extra, minibar, etc.) |
| amount | Decimal | Amount charged |
| createdAt | DateTime | Timestamp |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `stay` → HotelStay (cascade delete)

**Charge Types:**
- `room` - Room rate charges
- `room_service` - Room service orders
- `extra` - Extra/incidental charges
- `minibar` - Minibar charges
- `laundry` - Laundry service
- `parking` - Parking charges
- etc.

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "stayId": 1,
  "chargeDate": "2024-12-25T14:30:00Z",
  "description": "Room 101 × 5 nights",
  "chargeType": "room",
  "amount": 750.00
}
```

---

## 9. HotelFolioPayment

**Purpose:** Payments applied against a stay/folio

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| stayId | Int | Foreign key to HotelStay |
| paymentDate | DateTime | Payment timestamp |
| amount | Decimal | Amount paid |
| paymentMethod | String | cash, card, check, transfer, etc. |
| notes | Text | Payment notes |
| createdById | Int | Staff member who recorded |
| createdAt | DateTime | Timestamp |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `stay` → HotelStay (cascade delete)

**Payment Methods:**
- `cash` - Cash payment
- `card` - Credit/debit card
- `check` - Check
- `transfer` - Bank transfer
- `advance` - Advance payment at reservation

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "stayId": 1,
  "paymentDate": "2024-12-26T10:00:00Z",
  "amount": 200.00,
  "paymentMethod": "card",
  "notes": "Final payment at checkout"
}
```

---

## 10. HotelHousekeepingTask

**Purpose:** Room cleaning and maintenance tasks

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| roomId | Int | Foreign key to HotelRoom |
| taskType | String | clean, inspect, maintain, repair |
| assignedTo | String | Staff member assigned |
| taskDate | DateTime | Scheduled date |
| priority | String | low, medium, high, urgent |
| status | String | pending, in_progress, completed |
| notes | Text | Task details |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `room` → HotelRoom (cascade delete)

**Task Types:**
- `clean` - Room cleaning
- `inspect` - Quality inspection
- `maintain` - Maintenance
- `repair` - Repair work

**Status Values:**
- `pending` - Not started
- `in_progress` - Currently being done
- `completed` - Finished

**Priority Values:**
- `low` - Can wait
- `medium` - Normal priority
- `high` - Urgent
- `urgent` - Immediate

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "roomId": 5,
  "taskType": "clean",
  "assignedTo": "John (Housekeeper)",
  "taskDate": "2024-12-25T16:00:00Z",
  "priority": "high",
  "status": "pending",
  "notes": "Post-checkout cleaning"
}
```

---

## 11. HotelVenue

**Purpose:** Event venues (banquet halls, meeting rooms)

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| name | String | Venue name |
| capacity | Int | Guest capacity |
| baseRate | Decimal | Base rental rate |
| description | Text | Venue description |
| amenities | Json | Array of amenities |
| photos | Json | Array of photo URLs |
| image | String | Primary image URL |
| isActive | Boolean | Active/inactive |
| status | String | "active" or "inactive" |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `events` ← HotelEvent[]

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "name": "Grand Ballroom",
  "capacity": 500,
  "baseRate": 5000.00,
  "description": "Stunning ballroom with grand chandelier",
  "amenities": ["Stage", "Sound System", "AC", "Catering Kitchen"],
  "status": "active"
}
```

---

## 12. HotelEvent

**Purpose:** Events/banquets at venues

| Column | Type | Notes |
|--------|------|-------|
| id | Int | Primary key |
| restaurantId | Int | Foreign key |
| eventNumber | String | Unique event ID (e.g., EVT-1-0001) |
| eventName | String | Event name |
| venueId | Int | Foreign key to HotelVenue |
| customerName | String | Customer/organizer name |
| customerPhone | String | Contact phone |
| eventDate | DateTime | Event date |
| eventTime | String | Start time (HH:MM) |
| endTime | String | End time (HH:MM) |
| guestsCount | Int | Expected guest count |
| eventType | String | wedding, conference, party, etc. |
| specialRequirements | Text | Special requests |
| cateringRequired | Boolean | Catering needed? |
| depositAmount | Decimal | Deposit received |
| totalAmount | Decimal | Total package price |
| status | String | tentative, confirmed, cancelled |
| createdAt | DateTime | Timestamp |
| updatedAt | DateTime | Last modified |

**Relationships:**
- `restaurant` → Restaurant (cascade delete)
- `venue` → HotelVenue (cascade delete)

**Unique Constraints:**
```
@@unique([restaurantId, eventNumber])
```

**Status Values:**
- `tentative` - Pending confirmation
- `confirmed` - Confirmed event
- `cancelled` - Cancelled event

**Example:**
```json
{
  "id": 1,
  "restaurantId": 1,
  "eventNumber": "EVT-1-0001",
  "eventName": "Smith-Johnson Wedding",
  "venueId": 1,
  "customerName": "Jane Smith",
  "customerPhone": "+1-555-0123",
  "eventDate": "2025-06-15T18:00:00Z",
  "eventTime": "18:00",
  "endTime": "23:00",
  "guestsCount": 200,
  "eventType": "wedding",
  "cateringRequired": true,
  "depositAmount": 2500.00,
  "totalAmount": 10000.00,
  "status": "confirmed"
}
```

---

## Data Flow Diagrams

### Reservation to Stay Flow
```
1. Create HotelGuest
   ↓
2. Create HotelReservation (status: tentative)
   ├─ Link HotelReservationRoom (room assignments)
   └─ Set status: confirmed
   ↓
3. Check-in: Create HotelStay
   ├─ Create HotelFolioCharge (room charges)
   ├─ Create HotelFolioPayment (advance payment)
   └─ Update HotelRoom (status: occupied)
   └─ Update HotelReservation (status: checked_in)
   ↓
4. During Stay: Add charges
   └─ Create HotelFolioCharge (room service, extras)
   ↓
5. Check-out: Update HotelStay
   ├─ Create HotelFolioPayment (final payment)
   ├─ Create HotelHousekeepingTask
   └─ Update HotelRoom (status: vacant_dirty)
   └─ Update HotelReservation (status: checked_out)
```

### Event Planning Flow
```
1. Create HotelVenue
   ↓
2. Create HotelEvent
   ├─ System checks for venue conflicts
   └─ Set status: tentative
   ↓
3. Confirm: Update HotelEvent
   └─ Set status: confirmed
   ↓
4. Cancel (if needed): Update HotelEvent
   └─ Set status: cancelled
```

---

## Indexing Strategy

**Implicit Indexes (Fastify/Prisma):**
- All primary keys (`id`)
- All foreign keys (`restaurantId`, `guestId`, etc.)
- Unique constraints automatically indexed

**Recommended Additional Indexes:**
```sql
CREATE INDEX idx_hotel_reservation_guest_id ON HotelReservation(guestId);
CREATE INDEX idx_hotel_reservation_checkin_date ON HotelReservation(checkInDate);
CREATE INDEX idx_hotel_stay_guest_id ON HotelStay(guestId);
CREATE INDEX idx_hotel_stay_status ON HotelStay(status);
CREATE INDEX idx_hotel_room_status ON HotelRoom(status);
CREATE INDEX idx_hotel_room_floor ON HotelRoom(floor);
CREATE INDEX idx_hotel_event_venue_date ON HotelEvent(venueId, eventDate);
```

---

## Multi-Tenancy

All hotel tables include `restaurantId` to support multi-tenancy:
- Each restaurant has isolated data
- Cascade deletes ensure referential integrity
- JWT token contains `restaurantId` for query filtering

---

## Decimal Precision

Financial amounts use:
```
Decimal @db.Decimal(10, 2)
```

This allows:
- Up to 10 total digits
- Up to 2 decimal places
- Range: -99999999.99 to 99999999.99
- Perfect for monetary values

---

## Timestamp Management

All models include:
```typescript
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

These are automatically managed by Prisma:
- `createdAt` set once at creation
- `updatedAt` updated on every modification

---

## Performance Queries

### Get Guest with All Data
```typescript
const guest = await prisma.hotelGuest.findUnique({
  where: { id: guestId },
  include: {
    reservations: {
      include: { rooms: { include: { room: true } } },
    },
    stays: {
      include: {
        folioCharges: true,
        folioPayments: true,
      },
    },
  },
});
```

### Get Occupancy Report
```typescript
const occupancy = await prisma.hotelRoom.groupBy({
  by: ['status'],
  where: { restaurantId },
  _count: { id: true },
});
```

### Get Revenue Report
```typescript
const revenue = await prisma.hotelFolioCharge.groupBy({
  by: ['chargeType'],
  where: { restaurantId, chargeDate: { gte: startDate } },
  _sum: { amount: true },
});
```

---

## Constraints Summary

| Model | Constraint | Rule |
|-------|-----------|------|
| HotelRoom | Unique | One room per roomNumber per restaurant |
| HotelReservation | Unique | One reservation per reservationNumber per restaurant |
| HotelEvent | Unique | One event per eventNumber per restaurant |

---

## Cascade Rules

When a record is deleted:

| Parent | Child | Action |
|--------|-------|--------|
| Restaurant | All Hotel tables | Delete all |
| HotelRoomType | HotelRoom | Delete |
| HotelRoom | HotelStay, Tasks | Delete |
| HotelGuest | HotelReservation, HotelStay | Delete |
| HotelReservation | HotelReservationRoom, HotelStay | Delete |
| HotelStay | HotelFolioCharge, HotelFolioPayment | Delete |
| HotelVenue | HotelEvent | Delete |

---

Last Updated: 2024-12-19
