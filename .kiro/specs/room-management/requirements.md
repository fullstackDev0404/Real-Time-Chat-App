# Requirements Document

## Introduction

This feature implements Socket.IO room management logic for the real-time chat application. It introduces `joinRoom` and `leaveRoom` socket events that allow clients to enter and exit named chat rooms. Active room membership is persisted in Redis using sets (one set per room), enabling membership queries across server restarts or multiple server instances. When a socket joins or leaves a room, all current members of that room receive a broadcast notification. On disconnect, the server automatically cleans up all Redis membership records for that socket.

## Glossary

- **Socket**: A single persistent WebSocket connection between a client and the Socket.IO server, identified by `socket.id`.
- **Room**: A named channel identified by a `roomId` string. Sockets can join and leave rooms to receive targeted broadcasts.
- **Room_Handler**: The server-side module responsible for processing `joinRoom`, `leaveRoom`, and `disconnect` events and managing room state.
- **Redis_Client**: The ioredis singleton from `server/src/config/redis.js` used to persist room membership data.
- **Redis_Set**: A Redis data structure used to store the set of `socket.id` values currently in a room, keyed as `room:{roomId}:members`.
- **Broadcast**: A Socket.IO emission sent to all sockets currently joined to a specific room.
- **Notification_Payload**: The data object emitted to room members when a socket joins or leaves, containing at minimum `socketId` and `timestamp`.

## Requirements

### Requirement 1: Join Room

**User Story:** As a connected client, I want to join a named room, so that I can receive messages and notifications targeted to that room.

#### Acceptance Criteria

1. WHEN a socket emits a `joinRoom` event with a `{ roomId }` payload, THE Room_Handler SHALL add the socket to the Socket.IO room identified by `roomId`.
2. WHEN the entire room join process succeeds, THE Room_Handler SHALL add the socket's `socket.id` to the Redis set at key `room:{roomId}:members` using `SADD`.
3. WHEN a socket successfully joins a room, THE Room_Handler SHALL broadcast a `roomJoined` notification to all sockets in that room, including the joining socket.
4. THE `roomJoined` notification payload SHALL include the `socketId` of the joining socket and a `timestamp` (Unix milliseconds).
5. IF a `joinRoom` event is received with a missing or empty `roomId`, THEN THE Room_Handler SHALL emit an `error` event back to the requesting socket with a descriptive message and SHALL NOT modify any room state.

### Requirement 2: Leave Room

**User Story:** As a connected client, I want to leave a room I previously joined, so that I stop receiving notifications for that room.

#### Acceptance Criteria

1. WHEN a socket emits a `leaveRoom` event with a `{ roomId }` payload, THE Room_Handler SHALL remove the socket from the Socket.IO room identified by `roomId`.
2. WHEN a socket emits a `leaveRoom` event with a `{ roomId }` payload, THE Room_Handler SHALL remove the socket's `socket.id` from the Redis set at key `room:{roomId}:members` using `SREM`, regardless of whether the socket was previously a member.
3. WHEN a `leaveRoom` event is processed, THE Room_Handler SHALL broadcast a `roomLeft` notification to all remaining sockets in that room, regardless of whether the socket was previously a member.
4. THE `roomLeft` notification payload SHALL include the `socketId` of the leaving socket and a `timestamp` (Unix milliseconds).
5. IF a `leaveRoom` event is received with a missing or empty `roomId`, THEN THE Room_Handler SHALL emit an `error` event back to the requesting socket with a descriptive message and SHALL NOT modify any room state.

### Requirement 3: Disconnect Cleanup

**User Story:** As a system operator, I want the server to automatically clean up room membership when a client disconnects, so that Redis sets never contain stale socket IDs.

#### Acceptance Criteria

1. WHEN a socket disconnects for any reason, THE Room_Handler SHALL retrieve all Socket.IO rooms that socket was a member of (excluding the socket's own private room).
2. WHEN a socket disconnects, THE Room_Handler SHALL remove the socket's `socket.id` from the Redis set for each room it was a member of using `SREM`.
3. WHEN a socket disconnects, THE Room_Handler SHALL broadcast a `roomLeft` notification to the remaining members of each affected room.
4. THE disconnect cleanup `roomLeft` notification payload SHALL include the `socketId` of the disconnected socket and a `timestamp` (Unix milliseconds).
5. IF the Redis `SREM` operation fails during disconnect cleanup, THEN THE Room_Handler SHALL log the error with the `roomId` and `socket.id` context and SHALL continue processing remaining rooms without throwing any exception.

### Requirement 4: Redis Key Schema

**User Story:** As a developer, I want a consistent Redis key schema for room membership, so that membership data is predictable and queryable across the system.

#### Acceptance Criteria

1. THE Redis_Client SHALL store room membership using the key pattern `room:{roomId}:members` where `{roomId}` is the exact string provided by the client.
2. WHEN a room has no remaining members, THE Room_Handler SHALL remove the Redis key `room:{roomId}:members` to avoid accumulating empty sets.
3. THE Room_Handler SHALL use `SADD` to add a `socket.id` to a membership set, `SREM` to remove it, and `SMEMBERS` to read the full set when needed.

### Requirement 5: Error Handling and Resilience

**User Story:** As a system operator, I want room operations to handle Redis failures gracefully, so that a Redis outage does not crash the Socket.IO server.

#### Acceptance Criteria

1. IF a Redis operation (`SADD`, `SREM`) throws an error during a `joinRoom` or `leaveRoom` event, THEN THE Room_Handler SHALL log the error with the `roomId` and `socket.id` context and SHALL emit an `error` event to the requesting socket.
2. WHILE the Socket.IO server is running, THE Room_Handler SHALL handle each Redis operation failure independently, allowing other room operations to continue when Redis is unavailable, and SHALL NOT allow unhandled Redis promise rejections to propagate to the process level.
3. IF a `joinRoom` or `leaveRoom` event payload is malformed (non-string `roomId`, missing field), THEN THE Room_Handler SHALL emit an `error` event to the requesting socket with a message describing the validation failure.
