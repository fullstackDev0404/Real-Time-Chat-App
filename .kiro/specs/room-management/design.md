# Design Document: Room Management

## Overview

This design describes the server-side implementation of Socket.IO room management for the real-time chat application. The feature adds `joinRoom` and `leaveRoom` event handlers to the existing Socket.IO server, backed by Redis sets for persistent membership tracking. A dedicated `roomHandler` module is extracted from `server/src/socket/index.js` to keep concerns separated and the code testable.

The core data flow is:
1. Client emits `joinRoom` / `leaveRoom` with a `{ roomId }` payload.
2. The Room_Handler validates the payload, updates Socket.IO room membership, updates the Redis set, then broadcasts a notification to the room.
3. On disconnect, the handler iterates all rooms the socket belonged to and performs the same Redis cleanup and broadcast for each.

## Architecture

```mermaid
flowchart TD
    Client -->|joinRoom / leaveRoom| SocketIO[Socket.IO Server]
    SocketIO --> RoomHandler[Room Handler Module\nserver/src/socket/roomHandler.js]
    RoomHandler -->|socket.join / socket.leave| SocketIORoom[Socket.IO Room]
    RoomHandler -->|SADD / SREM| Redis[(Redis\nroom:{roomId}:members)]
    RoomHandler -->|broadcast roomJoined / roomLeft| SocketIORoom
    SocketIO -->|disconnect| RoomHandler
```

The `initSocket` function in `server/src/socket/index.js` remains the entry point. It imports and delegates room events to `registerRoomHandlers(io, socket)` from the new `roomHandler.js` module.

## Components and Interfaces

### `server/src/socket/roomHandler.js` (new file)

```
registerRoomHandlers(io, socket)
  - Registers joinRoom, leaveRoom, and disconnect listeners on the given socket
  - Parameters:
      io     : Socket.IO Server instance (for broadcasting)
      socket : individual Socket instance

handleJoinRoom(io, socket, redis, { roomId })
  - Validates roomId
  - Calls socket.join(roomId)
  - Calls redis.sadd(`room:${roomId}:members`, socket.id)
  - Broadcasts roomJoined to io.to(roomId)
  - On error: emits error event to socket

handleLeaveRoom(io, socket, redis, { roomId })
  - Validates roomId
  - Calls socket.leave(roomId)
  - Calls redis.srem(`room:${roomId}:members`, socket.id)
  - Cleans up empty Redis key if set size reaches 0
  - Broadcasts roomLeft to io.to(roomId)
  - On error: emits error event to socket

handleDisconnect(io, socket, redis)
  - Reads socket.rooms (Set of roomIds the socket was in, excluding its own private room)
  - For each roomId: calls redis.srem, broadcasts roomLeft, cleans up empty key
  - Errors per room are caught and logged individually; processing continues
```

### `server/src/socket/index.js` (modified)

Imports `registerRoomHandlers` and calls it inside the `io.on('connection', ...)` handler, passing `io` and `socket`.

### Event Contract

| Event (client → server) | Payload | Description |
|---|---|---|
| `joinRoom` | `{ roomId: string }` | Request to join a room |
| `leaveRoom` | `{ roomId: string }` | Request to leave a room |

| Event (server → client) | Payload | Description |
|---|---|---|
| `roomJoined` | `{ socketId, roomId, timestamp }` | Broadcast to room on join |
| `roomLeft` | `{ socketId, roomId, timestamp }` | Broadcast to room on leave/disconnect |
| `error` | `{ message: string }` | Emitted to requesting socket on validation or Redis failure |

## Data Models

### Notification Payload

```js
// roomJoined and roomLeft broadcast payload
{
  socketId: string,   // socket.id of the joining/leaving socket
  roomId:   string,   // the room affected
  timestamp: number   // Date.now() — Unix milliseconds
}
```

### Redis Key Schema

```
Key:   room:{roomId}:members
Type:  Redis Set
Value: Set of socket.id strings currently in the room

Operations:
  SADD  room:{roomId}:members  <socket.id>   — on joinRoom
  SREM  room:{roomId}:members  <socket.id>   — on leaveRoom / disconnect
  DEL   room:{roomId}:members                — when set becomes empty (post-SREM)
```

`roomId` is the exact string provided by the client. No server-side transformation is applied.

### Validation Rules

- `roomId` must be present, a string, and non-empty after trimming.
- Any violation emits `{ message: 'roomId must be a non-empty string' }` to the requesting socket.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Join adds socket to Redis membership

*For any* valid `roomId` and any connected socket, after a successful `joinRoom` operation the socket's `socket.id` SHALL be present in the Redis set `room:{roomId}:members`.

**Validates: Requirements 1.2**

### Property 2: Leave removes socket from Redis membership

*For any* `roomId` and any socket, after a `leaveRoom` operation the socket's `socket.id` SHALL NOT be present in the Redis set `room:{roomId}:members`.

**Validates: Requirements 2.2**

### Property 3: Disconnect cleans up all rooms

*For any* socket that was a member of N rooms, after a disconnect event the socket's `socket.id` SHALL NOT be present in the Redis set for any of those N rooms.

**Validates: Requirements 3.2**

### Property 4: Empty sets are removed

*For any* room where the last member leaves (via `leaveRoom` or disconnect), the Redis key `room:{roomId}:members` SHALL NOT exist after the operation completes.

**Validates: Requirements 4.2**

### Property 5: Invalid roomId is rejected without state change

*For any* `joinRoom` or `leaveRoom` event with a missing, empty, or non-string `roomId`, the Redis membership sets and Socket.IO room membership SHALL remain unchanged.

**Validates: Requirements 1.5, 2.5, 5.3**

### Property 6: Broadcast payload completeness

*For any* `roomJoined` or `roomLeft` notification emitted by the Room_Handler, the payload SHALL contain a non-empty `socketId` string, a non-empty `roomId` string, and a positive integer `timestamp`.

**Validates: Requirements 1.4, 2.4, 3.4**

## Error Handling

| Scenario | Behaviour |
|---|---|
| Missing / empty `roomId` | Emit `error` to requesting socket; no state change |
| Non-string `roomId` | Emit `error` to requesting socket; no state change |
| Redis `SADD` failure on `joinRoom` | Log error with context; emit `error` to socket |
| Redis `SREM` failure on `leaveRoom` | Log error with context; emit `error` to socket |
| Redis `SREM` failure on disconnect | Log error with context; continue to next room |
| Redis `DEL` failure on empty-set cleanup | Log error; non-fatal, operation considered complete |

All Redis calls are wrapped in `try/catch` blocks. Errors never propagate as unhandled promise rejections.

## Testing Strategy

### Unit Tests

Unit tests cover the pure logic of `roomHandler.js` using mocked `io`, `socket`, and `redis` objects (Jest mocks or sinon stubs).

Key example-based unit tests:
- `joinRoom` with valid payload → `socket.join`, `redis.sadd`, and broadcast are called with correct arguments.
- `joinRoom` with empty `roomId` → `error` emitted, no `socket.join` or `redis.sadd` called.
- `leaveRoom` with valid payload → `socket.leave`, `redis.srem`, and broadcast are called.
- `leaveRoom` when Redis throws → `error` emitted to socket, error logged.
- `disconnect` with two rooms → `redis.srem` called twice, two broadcasts emitted.
- `disconnect` where first `srem` throws → error logged, second room still processed.

### Property-Based Tests

Property-based tests use **fast-check** (already compatible with the Node.js/Jest stack) with a minimum of **100 iterations** per property.

Each property test is tagged with a comment in the format:
`// Feature: room-management, Property N: <property_text>`

| Property | Test approach |
|---|---|
| P1: Join adds to Redis | Generate random `roomId` strings and `socketId` strings; call `handleJoinRoom` with mocked Redis; assert `sadd` was called with `room:{roomId}:members` and the `socketId` |
| P2: Leave removes from Redis | Generate random `roomId` and `socketId`; call `handleLeaveRoom`; assert `srem` was called correctly |
| P3: Disconnect cleans all rooms | Generate a random list of 1–10 `roomId` strings; simulate socket in all rooms; call `handleDisconnect`; assert `srem` called for every room |
| P4: Empty sets deleted | Generate `roomId`; mock `redis.srem` to return 0 remaining members; assert `redis.del` called |
| P5: Invalid roomId rejected | Generate arbitrary non-string values and empty strings as `roomId`; assert no `socket.join`, `redis.sadd`, `socket.leave`, or `redis.srem` calls |
| P6: Broadcast payload completeness | Generate random `roomId` and `socketId`; call join/leave; capture broadcast argument; assert all three fields present and valid |

### Integration Tests

A small number of integration tests (1–3) run against a real Redis instance (or `ioredis-mock`) to verify end-to-end key lifecycle: join → key exists → leave → key deleted.
