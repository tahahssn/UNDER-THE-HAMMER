# Phase F - API Reference

## Overview

Complete API endpoints for subscription management, room operations, team allocation, and invitation code handling. All endpoints require Cognito JWT authentication (except public room listing).

**Base URL:** `https://api.example.com/v1`  
**Authentication:** `Authorization: Bearer <jwt-token>`

---

## Authentication

All endpoints except `/rooms/public` require a valid JWT token from Cognito.

**Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Claims:**
- `sub` (subject): User ID
- `email`: User email
- `email_verified`: Boolean

---

## Subscriptions API

### GET /subscriptions/current

**Description:** Get the current user's active subscription.

**Auth:** Required (JWT)

**Query Parameters:** None

**Response (200 OK):**
```json
{
  "subscription": {
    "id": "sub-abc123",
    "userId": "user-xyz789",
    "planId": "plan-starter",
    "plan": {
      "id": "plan-starter",
      "key": "STARTER",
      "name": "Starter Plan",
      "priceMinor": 50000,
      "currency": "PKR",
      "period": "MONTHLY",
      "active": true,
      "createdAt": "2024-01-01T00:00:00Z"
    },
    "status": "ACTIVE",
    "currentPeriodStart": "2024-11-01T00:00:00Z",
    "currentPeriodEnd": "2024-12-01T00:00:00Z",
    "cancelAtPeriodEnd": false,
    "createdAt": "2024-11-01T00:00:00Z",
    "updatedAt": "2024-11-24T10:30:00Z"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing JWT
- `404 Not Found`: User has no subscription

---

### GET /subscriptions/plans

**Description:** List all active subscription plans (public, no auth required).

**Auth:** Not required

**Query Parameters:**
- `active` (optional, boolean): Filter by active status

**Response (200 OK):**
```json
{
  "plans": [
    {
      "id": "plan-starter",
      "key": "STARTER",
      "name": "Starter Plan",
      "priceMinor": 50000,
      "currency": "PKR",
      "period": "MONTHLY",
      "active": true,
      "createdAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "plan-pro",
      "key": "PRO",
      "name": "Pro Plan",
      "priceMinor": 150000,
      "currency": "PKR",
      "period": "MONTHLY",
      "active": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 2
}
```

---

### GET /subscriptions/entitlements

**Description:** Check user's subscription entitlements (room capacity, features, etc.).

**Auth:** Required

**Response (200 OK):**
```json
{
  "hostCanCreate": true,
  "maxActiveRooms": 5,
  "maxTeamsPerRoom": 16,
  "maxSpectatorsPerRoom": 100,
  "maxRoomDurationMinutes": 480
}
```

**Error Response:**
- `403 Forbidden`: User not subscribed (all limits = 0, hostCanCreate = false)

---

## Rooms API

### POST /rooms

**Description:** Create a new auction room (subscription required).

**Auth:** Required

**Request Body:**
```json
{
  "name": "PSL 2026 Mock Auction",
  "description": "Practice auction for team owners",
  "visibility": "PUBLIC",
  "tournamentId": "tournament-123",
  "config": {
    "teamCount": 8,
    "teamPurseMinor": 10000000,
    "currency": "PKR",
    "format": "LIVE_COUNTDOWN",
    "controlMode": "HOST_CONTROLLED",
    "playerSelectionMode": "MANUAL",
    "hostParticipates": true,
    "countdownDurationSeconds": 60,
    "turnDurationSeconds": 90,
    "breakAfterBidCount": 5,
    "breakDurationSeconds": 120,
    "maxBreakAdjustments": 2,
    "bidIncrementBrackets": [
      {
        "fromMinor": 0,
        "toMinor": 100000000,
        "incrementMinor": 1000000
      },
      {
        "fromMinor": 100000000,
        "toMinor": 220000000,
        "incrementMinor": 1500000
      }
    ],
    "squadSizeMin": 11,
    "squadSizeMax": 15,
    "squadRules": []
  }
}
```

**Response (201 Created):**
```json
{
  "id": "room-xyz789",
  "hostId": "user-abc123",
  "name": "PSL 2026 Mock Auction",
  "status": "DRAFT",
  "visibility": "PUBLIC",
  "listed": true,
  "currentSettingsVersion": 1,
  "createdAt": "2024-11-24T10:30:00Z",
  "updatedAt": "2024-11-24T10:30:00Z"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid configuration (team count out of range, purse <= 0, etc.)
- `403 Forbidden`: User not subscribed or no active subscription
- `409 Conflict`: Team count exceeds subscription limit

---

### GET /rooms/public

**Description:** List public rooms (open for discovery).

**Auth:** Not required

**Query Parameters:**
- `skip` (optional, number, default=0): Pagination offset
- `take` (optional, number, default=10): Pagination limit
- `status` (optional, string): Filter by status (REGISTRATION, READY)

**Response (200 OK):**
```json
{
  "rooms": [
    {
      "id": "room-123",
      "hostId": "host-456",
      "name": "Public Auction - Live",
      "status": "REGISTRATION",
      "visibility": "PUBLIC",
      "listed": true,
      "currentSettingsVersion": 1,
      "createdAt": "2024-11-24T10:30:00Z",
      "updatedAt": "2024-11-24T10:30:00Z",
      "host": {
        "id": "host-456",
        "email": "host@example.com",
        "displayName": "Cricket Host"
      },
      "memberCount": 5
    }
  ],
  "total": 42,
  "hasMore": true
}
```

---

### GET /rooms/:roomId

**Description:** Get room detail (configuration, members, teams).

**Auth:** Required if room is private; optional for public

**Response (200 OK):**
```json
{
  "id": "room-xyz789",
  "hostId": "user-abc123",
  "name": "PSL 2026 Mock Auction",
  "status": "REGISTRATION",
  "visibility": "PRIVATE",
  "listed": false,
  "currentSettingsVersion": 1,
  "createdAt": "2024-11-24T10:30:00Z",
  "updatedAt": "2024-11-24T10:30:00Z",
  "host": {
    "id": "user-abc123",
    "email": "host@example.com",
    "displayName": "Host Name"
  },
  "settings": {
    "id": "settings-1",
    "roomId": "room-xyz789",
    "version": 1,
    "config": {
      "teamCount": 8,
      "teamPurseMinor": 10000000,
      "currency": "PKR",
      "format": "LIVE_COUNTDOWN",
      "controlMode": "HOST_CONTROLLED"
    },
    "createdAt": "2024-11-24T10:30:00Z"
  },
  "accessPolicy": {
    "roomId": "room-xyz789",
    "joinPolicy": "FIRST_COME_FIRST_SERVED",
    "spectatorPolicy": "RESTRICTED",
    "teamOwnerCapacity": 8,
    "spectatorCapacity": 100,
    "lateJoinPolicy": "DISALLOWED",
    "spectatorChatEnabled": false,
    "externalLinksEnabled": false
  },
  "members": [
    {
      "id": "member-1",
      "userId": "user-abc123",
      "role": "HOST",
      "status": "ACTIVE",
      "joinedAt": "2024-11-24T10:30:00Z",
      "leftAt": null,
      "user": {
        "id": "user-abc123",
        "email": "host@example.com",
        "displayName": "Host Name"
      }
    },
    {
      "id": "member-2",
      "userId": "user-def456",
      "role": "TEAM_OWNER",
      "status": "ACTIVE",
      "joinedAt": "2024-11-24T10:35:00Z",
      "leftAt": null,
      "user": {
        "id": "user-def456",
        "email": "owner@example.com",
        "displayName": "Team Owner"
      }
    }
  ],
  "teams": [
    {
      "id": "auction-team-1",
      "auctionId": "room-xyz789",
      "teamId": "team-karachi",
      "slotIndex": 0,
      "allocationMethod": "USER_SELECTED",
      "purseInitialMinor": 10000000,
      "purseBalanceMinor": 9500000,
      "createdAt": "2024-11-24T10:35:00Z",
      "team": {
        "id": "team-karachi",
        "name": "Karachi Kings",
        "shortName": "KK",
        "primaryColor": "#1e3a8a",
        "secondaryColor": "#60a5fa"
      },
      "owners": [
        {
          "id": "owner-1",
          "userId": "user-def456",
          "method": "USER_SELECTED",
          "assignedAt": "2024-11-24T10:35:00Z"
        }
      ]
    }
  ]
}
```

**Error Responses:**
- `404 Not Found`: Room does not exist
- `403 Forbidden`: Room is private and user is not a member

---

### PUT /rooms/:roomId/settings

**Description:** Update room configuration (host only, before LIVE status).

**Auth:** Required

**Request Body:**
```json
{
  "teamCount": 10,
  "teamPurseMinor": 12000000,
  "currency": "PKR",
  "format": "LIVE_COUNTDOWN",
  "controlMode": "HOST_CONTROLLED"
}
```

**Response (200 OK):**
```json
{
  "version": 2,
  "config": {
    "teamCount": 10,
    "teamPurseMinor": 12000000
  },
  "createdAt": "2024-11-24T10:40:00Z"
}
```

**Error Responses:**
- `403 Forbidden`: User is not room host
- `400 Bad Request`: Room status is LIVE/COMPLETED or config is invalid

---

### GET /rooms/my-rooms

**Description:** List rooms created or joined by current user.

**Auth:** Required

**Query Parameters:**
- `skip` (optional, number, default=0)
- `take` (optional, number, default=20)

**Response (200 OK):**
```json
{
  "rooms": [
    {
      "id": "room-xyz789",
      "hostId": "user-abc123",
      "name": "My Auction",
      "status": "DRAFT",
      "visibility": "PRIVATE",
      "listed": false,
      "currentSettingsVersion": 1,
      "createdAt": "2024-11-24T10:30:00Z"
    }
  ],
  "total": 2,
  "hasMore": false
}
```

---

### DELETE /rooms/:roomId

**Description:** Delete a room (host only, not in LIVE/COMPLETED status).

**Auth:** Required

**Response (204 No Content)**

**Error Responses:**
- `403 Forbidden`: User is not room host
- `400 Bad Request`: Room is in LIVE/COMPLETED status

---

## Team Allocation API

### POST /rooms/:roomId/allocate-team

**Description:** Allocate a team to the current user (USER_SELECTED or RANDOM method).

**Auth:** Required

**Request Body (USER_SELECTED):**
```json
{
  "method": "USER_SELECTED",
  "teamId": "team-karachi",
  "slotIndex": 0
}
```

**Request Body (RANDOM):**
```json
{
  "method": "RANDOM",
  "teamId": "team-karachi"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "auctionTeamId": "auction-team-1",
  "teamId": "team-karachi",
  "slotIndex": 0
}
```

**Error Responses:**
- `400 Bad Request`: Invalid method or team
- `409 Conflict`: Team slot already allocated or room is at capacity
- `403 Forbidden`: User is not a member or cannot join as team owner

---

## Invitation API

### POST /rooms/:roomId/invitations

**Description:** Generate invitation code (host only).

**Auth:** Required

**Request Body:**
```json
{
  "role": "TEAM_OWNER",
  "maxUses": 5,
  "expiresInDays": 7
}
```

**Response (201 Created):**
```json
{
  "id": "inv-abc123",
  "roomId": "room-xyz789",
  "code": "ABC123DEF456",
  "role": "TEAM_OWNER",
  "expiresAt": "2024-12-01T10:30:00Z",
  "maxUses": 5,
  "useCount": 0,
  "createdAt": "2024-11-24T10:30:00Z"
}
```

**Error Responses:**
- `403 Forbidden`: User is not room host

---

### POST /invitations/join

**Description:** Join a room using invitation code.

**Auth:** Required

**Request Body:**
```json
{
  "code": "ABC123DEF456",
  "role": "TEAM_OWNER"
}
```

**Response (200 OK):**
```json
{
  "roomId": "room-xyz789",
  "memberId": "member-xyz",
  "role": "TEAM_OWNER",
  "status": "ACTIVE"
}
```

**Error Responses:**
- `400 Bad Request`: Code invalid, expired, or max uses exceeded
- `409 Conflict`: User already a member of the room

---

### GET /rooms/:roomId/invitations

**Description:** List invitations for a room (host only).

**Auth:** Required

**Response (200 OK):**
```json
{
  "invitations": [
    {
      "id": "inv-abc123",
      "roomId": "room-xyz789",
      "code": "ABC123DEF456",
      "role": "TEAM_OWNER",
      "expiresAt": "2024-12-01T10:30:00Z",
      "maxUses": 5,
      "useCount": 2,
      "revokedAt": null,
      "createdAt": "2024-11-24T10:30:00Z"
    }
  ],
  "total": 1
}
```

---

### DELETE /rooms/:roomId/invitations/:invitationId

**Description:** Revoke invitation code (host only).

**Auth:** Required

**Response (204 No Content)**

**Error Responses:**
- `403 Forbidden`: User is not room host
- `404 Not Found`: Invitation does not exist

---

## Error Codes

| Code | HTTP | Meaning | Retry? |
|------|------|---------|--------|
| `SUBSCRIPTION_REQUIRED` | 403 | User must have active subscription | No |
| `ROOM_NOT_FOUND` | 404 | Room does not exist | No |
| `CONFIGURATION_INVALID` | 400 | Invalid room config (team count, purse, etc.) | No |
| `TEAM_SLOT_TAKEN` | 409 | Team slot already allocated | No |
| `ROOM_CAPACITY_EXCEEDED` | 409 | Room is at max capacity | No |
| `CODE_INVALID_OR_EXPIRED` | 400 | Invitation code invalid or expired | No |
| `CODE_MAX_USES_EXCEEDED` | 409 | Invitation code max uses reached | No |
| `UNAUTHORIZED` | 401 | Invalid or missing JWT | No |
| `FORBIDDEN` | 403 | User lacks permission (not host, etc.) | No |
| `INTERNAL_SERVER_ERROR` | 500 | Server error | Yes |

---

## Rate Limiting

No rate limiting in Phase F. To be implemented in Phase L (security hardening).

---

## Pagination

Endpoints with pagination use `skip` and `take`:

```
GET /rooms/public?skip=0&take=20
```

Response includes:
```json
{
  "rooms": [...],
  "total": 100,
  "hasMore": true
}
```

- `total`: Total items available
- `hasMore`: Whether more items exist beyond current page

---

## Timestamps

All timestamps are ISO 8601 format (UTC):
```
2024-11-24T10:30:00Z
```

---

## Examples

### Example 1: Create Room

```bash
curl -X POST http://localhost:3001/v1/rooms \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Auction",
    "visibility": "PUBLIC",
    "config": {
      "teamCount": 8,
      "teamPurseMinor": 10000000,
      "currency": "PKR",
      "format": "LIVE_COUNTDOWN",
      "controlMode": "HOST_CONTROLLED",
      "playerSelectionMode": "MANUAL",
      "hostParticipates": false,
      "countdownDurationSeconds": 60,
      "turnDurationSeconds": 90,
      "breakAfterBidCount": 5,
      "breakDurationSeconds": 120,
      "maxBreakAdjustments": 2,
      "bidIncrementBrackets": [
        {
          "fromMinor": 0,
          "toMinor": 100000000,
          "incrementMinor": 1000000
        }
      ],
      "squadSizeMin": 11,
      "squadSizeMax": 15,
      "squadRules": []
    }
  }'
```

### Example 2: Join with Invitation Code

```bash
curl -X POST http://localhost:3001/v1/invitations/join \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ABC123DEF456",
    "role": "TEAM_OWNER"
  }'
```

### Example 3: Allocate Team (USER_SELECTED)

```bash
curl -X POST http://localhost:3001/v1/rooms/room-xyz789/allocate-team \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "USER_SELECTED",
    "teamId": "team-karachi",
    "slotIndex": 0
  }'
```

