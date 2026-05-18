# Implementation Plan: Room Management

## Overview

Implement Socket.IO room join/leave logic with Redis-backed membership tracking. The work is split into three incremental steps: the core room handler module, wiring it into the existing socket initializer, and the test suite.

## Tasks

- [ ] 1. Create the `roomHandler.js` module with validation and join logic
  - Create `server/src/socket/roomHandler.js`
  - Implement `validateRoomId(roomId)` — returns `true` if roomId is a non-empty string after trim, `false` otherwise
  - Implement `handleJoinRoom(io, socket, redis, { roomId })`:
    - Call `validateRoomId`; if invalid, emit `error` event to socket and return
    - Call `socket.join(roomId)`
    - Call `redis.sadd('room:' + roomId + ':members', socket.id)` inside a try/catch; on catch, log and emit `error` to socket
    - Broadcast `roomJoined` to `io.to(roomId)` with payload `{ socketId: socket.id, roomId, timestamp: Date.now() }`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.3_

- [ ] 2. Add leave and disconnect logic to `roomHandler.js`
  - [ ] 2.1 Implement `handleLeaveRoom(io, socket, redis, { roomId })`
    - Call `validateRoomId`; if invalid, emit `error` event to socket and return
    - Call `socket.leave(roomId)`
    - Call `redis.srem('room:' + roomId + ':members', socket.id)` inside a try/catch; on catch, log and emit `error` to socket
    - After successful `srem`, check remaining set size with `redis.scard`; if 0, call `redis.del` (log but do not throw on failure)
    - Broadcast `roomLeft` to `io.to(roomId)` with payload `{ socketId: socket.id, roomId, timestamp: Date.now() }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.2, 5.1, 5.3_

  - [ ] 2.2 Implement `handleDisconnect(io, socket, redis)`
    - Iterate `socket.rooms` (a `Set`); skip the entry equal to `socket.id` (the socket's own private room)
    - For each `roomId`: wrap in try/catch — call `redis.srem`, check `redis.scard`, call `redis.del` if empty, broadcast `roomLeft`; on catch, log error with `{ roomId, socketId: socket.id }` and continue to next room
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.2, 5.2_

  - [ ] 2.3 Export `registerRoomHandlers(io, socket, redis)` from `roomHandler.js`
    - This function registers `joinRoom`, `leaveRoom`, and `disconnect` listeners on `socket`, delegating to the three handler functions above
    - _Requirements: 1.1, 2.1, 3.1_

- [ ] 3. Wire `roomHandler.js` into the Socket.IO initializer
  - Modify `server/src/socket/index.js`
  - Import `createRedisClient` from `../config/redis` and `registerRoomHandlers` from `./roomHandler`
  - Inside `io.on('connection', (socket) => { ... })`, call `registerRoomHandlers(io, socket, createRedisClient())`
  - _Requirements: 1.1, 2.1, 3.1_

- [ ] 4. Checkpoint — verify the server starts and room events work manually
  - Ensure all existing tests pass, ask the user if questions arise.

- [ ] 5. Set up the test framework and write unit tests for `roomHandler.js`
  - [ ] 5.1 Install Jest and fast-check as dev dependencies
    - Run `npm install --save-dev jest fast-check` in `server/`
    - Add `"test": "jest"` script to `server/package.json`
    - _Requirements: (testing infrastructure)_

  - [ ]* 5.2 Write unit tests for `handleJoinRoom`
    - Mock `io`, `socket`, and `redis` objects
    - Test: valid roomId → `socket.join`, `redis.sadd`, and broadcast called with correct args
    - Test: empty string roomId → `socket.emit('error')` called, no `socket.join` or `redis.sadd`
    - Test: `redis.sadd` throws → `socket.emit('error')` called, error logged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1_

  - [ ]* 5.3 Write unit tests for `handleLeaveRoom`
    - Test: valid roomId → `socket.leave`, `redis.srem`, and broadcast called
    - Test: `redis.srem` returns 0 → `redis.del` called
    - Test: `redis.srem` returns > 0 → `redis.del` NOT called
    - Test: empty roomId → `socket.emit('error')`, no `socket.leave` or `redis.srem`
    - Test: `redis.srem` throws → `socket.emit('error')` called
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.2, 5.1_

  - [ ]* 5.4 Write unit tests for `handleDisconnect`
    - Test: socket in 2 rooms → `redis.srem` called twice, 2 broadcasts emitted
    - Test: first `redis.srem` throws → error logged, second room still processed
    - Test: socket in 0 rooms (only private room) → no Redis calls, no broadcasts
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.2_

- [ ] 6. Write property-based tests for `roomHandler.js`
  - [ ]* 6.1 Write property test for Property 1: Join adds socket to Redis membership
    - `// Feature: room-management, Property 1: For any valid roomId and socket, after joinRoom the socketId is in the Redis set`
    - Use `fc.string({ minLength: 1 })` for roomId and socketId; assert `redis.sadd` called with `'room:' + roomId + ':members'` and socketId
    - Minimum 100 iterations
    - _Requirements: 1.2_

  - [ ]* 6.2 Write property test for Property 2: Leave removes socket from Redis membership
    - `// Feature: room-management, Property 2: For any roomId and socket, after leaveRoom the socketId is removed from the Redis set`
    - Generate random roomId and socketId; assert `redis.srem` called with correct key and socketId
    - Minimum 100 iterations
    - _Requirements: 2.2_

  - [ ]* 6.3 Write property test for Property 3: Disconnect cleans up all rooms
    - `// Feature: room-management, Property 3: For any socket in N rooms, after disconnect srem is called for every room`
    - Use `fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 10 })` for room list; assert `redis.srem` called once per room
    - Minimum 100 iterations
    - _Requirements: 3.2_

  - [ ]* 6.4 Write property test for Property 4: Empty sets are removed
    - `// Feature: room-management, Property 4: For any room where the last member leaves, the Redis key is deleted`
    - Mock `redis.srem` to resolve and `redis.scard` to return 0; assert `redis.del` called with `'room:' + roomId + ':members'`
    - Minimum 100 iterations
    - _Requirements: 4.2_

  - [ ]* 6.5 Write property test for Property 5: Invalid roomId is rejected without state change
    - `// Feature: room-management, Property 5: For any invalid roomId, no Redis or Socket.IO state is modified`
    - Use `fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined), fc.integer(), fc.object())` for invalid roomIds; assert `socket.join`, `redis.sadd`, `socket.leave`, `redis.srem` are NOT called; assert `socket.emit('error')` IS called
    - Minimum 100 iterations
    - _Requirements: 1.5, 2.5, 5.3_

  - [ ]* 6.6 Write property test for Property 6: Broadcast payload completeness
    - `// Feature: room-management, Property 6: For any roomJoined or roomLeft broadcast, the payload contains socketId, roomId, and a positive timestamp`
    - Generate random roomId and socketId; call handleJoinRoom and handleLeaveRoom; capture the argument passed to `io.to(roomId).emit`; assert payload has non-empty `socketId`, non-empty `roomId`, and `timestamp > 0`
    - Minimum 100 iterations
    - _Requirements: 1.4, 2.4, 3.4_

- [ ] 7. Final checkpoint — ensure all tests pass
  - Run `npm test` in `server/`; ensure all unit and property tests pass, ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5.1"] },
    { "wave": 6, "tasks": ["5.2", "5.3", "5.4"] },
    { "wave": 7, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "wave": 8, "tasks": ["7"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** with a minimum of 100 iterations each
- Unit tests use Jest with manual mocks for `io`, `socket`, and `redis`
- The `handleDisconnect` function reads `socket.rooms` which is a native Socket.IO `Set` — exclude the entry equal to `socket.id` (the socket's own private room)
- Redis `scard` is used after `srem` to check if the set is empty before calling `del`
