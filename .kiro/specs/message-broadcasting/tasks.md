# Implementation Plan: Message Broadcasting

## Overview

Implement the `sendMessage` Socket.IO event in a new `messageHandler.js` module, wire it into the existing socket initializer, and cover it with unit and property-based tests. The work is split into three incremental steps: the core handler module, wiring it into `socket/index.js`, and the test suite.

## Tasks

- [ ] 1. Create `server/src/socket/messageHandler.js` with validation and send logic
  - Create `server/src/socket/messageHandler.js`
  - Import `uuidv4` from the `uuid` package (`const { v4: uuidv4 } = require('uuid')`)
  - Implement `validatePayload(roomId, message)`:
    - Return `{ valid: false, error: 'roomId must be a non-empty string' }` if `roomId` is not a string or `roomId.trim()` is empty
    - Return `{ valid: false, error: 'message must be a non-empty string' }` if `message` is not a string or `message.trim()` is empty
    - Return `{ valid: false, error: 'message exceeds maximum length of 2000 characters' }` if `message.trim().length > 2000`
    - Return `{ valid: true }` otherwise
  - Implement `handleSendMessage(io, socket, { roomId, message })`:
    - Call `validatePayload`; if invalid, call `socket.emit('error', { message: result.error })` and return
    - Call `socket.rooms.has(roomId)`; if false, call `socket.emit('error', { message: 'You are not a member of this room' })` and return
    - Build payload: `{ messageId: uuidv4(), senderId: socket.id, roomId, message: message.trim(), timestamp: Date.now() }`
    - Wrap `io.to(roomId).emit('newMessage', payload)` in try/catch; on catch, log error with `{ roomId, socketId: socket.id }` and call `socket.emit('error', { message: 'Broadcast failed' })`
  - Implement and export `registerMessageHandlers(io, socket)`:
    - Register a `sendMessage` listener on `socket` that calls `handleSendMessage(io, socket, data)`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3_

- [ ] 2. Wire `messageHandler.js` into the Socket.IO initializer
  - Modify `server/src/socket/index.js`
  - Add `const { registerMessageHandlers } = require('./messageHandler')` at the top
  - Inside `io.on('connection', (socket) => { ... })`, call `registerMessageHandlers(io, socket)` after the existing `registerRoomHandlers` call (or after the disconnect/ping handlers if room-management is not yet merged)
  - _Requirements: 1.1, 1.2_

- [ ] 3. Checkpoint — verify the server starts and message events work
  - Ensure all existing tests pass, ask the user if questions arise.

- [ ] 4. Set up the test framework (if not already present) and write unit tests
  - [ ] 4.1 Confirm Jest and fast-check are available as dev dependencies
    - Check `server/package.json` for `jest` and `fast-check`; if missing, run `npm install --save-dev jest fast-check` in `server/`
    - Ensure `"test": "jest"` script exists in `server/package.json`
    - _Requirements: (testing infrastructure)_

  - [ ]* 4.2 Write unit tests for `validatePayload`
    - Test: valid roomId and message → `{ valid: true }`
    - Test: null roomId → `{ valid: false, error: '...' }`
    - Test: empty string roomId → `{ valid: false, error: '...' }`
    - Test: whitespace-only roomId → `{ valid: false, error: '...' }`
    - Test: null message → `{ valid: false, error: '...' }`
    - Test: empty string message → `{ valid: false, error: '...' }`
    - Test: whitespace-only message → `{ valid: false, error: '...' }`
    - Test: message of exactly 2000 chars → `{ valid: true }`
    - Test: message of 2001 chars → `{ valid: false, error: '...' }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 4.3 Write unit tests for `handleSendMessage` happy path
    - Mock `io` with `{ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }` and `socket` with `{ id: 'socket-1', rooms: new Set(['room-1']), emit: jest.fn() }`
    - Test: valid roomId and message, socket in room → `io.to('room-1').emit('newMessage', payload)` called; payload has all five fields; `socket.emit` NOT called with `'error'`
    - Test: message with leading/trailing whitespace → `payload.message` equals trimmed value
    - _Requirements: 1.2, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.4 Write unit tests for `handleSendMessage` error paths
    - Test: invalid roomId → `socket.emit('error', { message: '...' })` called; `io.to().emit` NOT called
    - Test: invalid message → `socket.emit('error', { message: '...' })` called; `io.to().emit` NOT called
    - Test: message too long → `socket.emit('error', { message: '...' })` called; `io.to().emit` NOT called
    - Test: socket not in room → `socket.emit('error', { message: '...' })` called; `io.to().emit` NOT called
    - Test: `io.to().emit` throws → error logged; `socket.emit('error', { message: 'Broadcast failed' })` called
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 5.1, 5.3_

- [ ] 5. Write property-based tests for `messageHandler.js`
  - [ ]* 5.1 Write property test for Property 1: Valid messages are always broadcast
    - `// Feature: message-broadcasting, Property 1: For any valid roomId and message, when socket is in room, io.to(roomId).emit is called once`
    - Use `fc.string({ minLength: 1, maxLength: 2000 })` for roomId and message; mock `socket.rooms.has` to return true; assert `io.to(roomId).emit` called once with event `'newMessage'`
    - Minimum 100 iterations
    - _Requirements: 1.1, 1.2_

  - [ ]* 5.2 Write property test for Property 2: Invalid payloads are always rejected without broadcast
    - `// Feature: message-broadcasting, Property 2: For any invalid payload, error is emitted and no broadcast occurs`
    - Use `fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.constant(''), fc.string().map(s => s.replace(/\S/g, ' ')))` for invalid roomId/message; assert `socket.emit('error')` called and `io.to().emit` NOT called
    - Also generate strings longer than 2000 chars for the length boundary
    - Minimum 100 iterations
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 5.3 Write property test for Property 3: Non-member sockets are rejected without broadcast
    - `// Feature: message-broadcasting, Property 3: For any valid payload where socket is not in room, error is emitted and no broadcast occurs`
    - Use `fc.string({ minLength: 1, maxLength: 2000 })` for valid roomId and message; mock `socket.rooms.has` to return false; assert `socket.emit('error')` called and `io.to().emit` NOT called
    - Minimum 100 iterations
    - _Requirements: 3.1, 3.2_

  - [ ]* 5.4 Write property test for Property 4: Broadcast payload is complete and well-formed
    - `// Feature: message-broadcasting, Property 4: For any valid sendMessage, the newMessage payload contains all required fields with correct values`
    - Use `fc.string({ minLength: 1, maxLength: 2000 })` for roomId and message; capture the argument passed to `io.to(roomId).emit`; assert payload has `messageId` matching UUID v4 regex, `senderId === socket.id`, `roomId === input roomId`, `message === message.trim()`, `timestamp > 0`
    - Minimum 100 iterations
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.5 Write property test for Property 5: Error events always carry a non-empty message string
    - `// Feature: message-broadcasting, Property 5: For any rejection scenario, the error event payload has a non-empty message string`
    - Cover all rejection paths (invalid roomId, invalid message, too long, not in room); capture `socket.emit` call arguments; assert `args[0] === 'error'` and `args[1].message` is a non-empty string
    - Minimum 100 iterations
    - _Requirements: 5.1_

  - [ ]* 5.6 Write property test for Property 6: Handler never throws unhandled exceptions
    - `// Feature: message-broadcasting, Property 6: For any input, handleSendMessage does not throw`
    - Use `fc.anything()` for both roomId and message; wrap call in try/catch; assert no exception is thrown
    - Minimum 100 iterations
    - _Requirements: 5.2_

  - [ ]* 5.7 Write property test for Property 7: Redis is never called
    - `// Feature: message-broadcasting, Property 7: For any sendMessage payload, no Redis methods are invoked`
    - Pass a mock redis object with jest.fn() for common methods (sadd, srem, set, get, lpush, etc.); run handler with valid and invalid inputs; assert none of the mock methods were called
    - Minimum 100 iterations
    - _Requirements: 1.4_

- [ ] 6. Final checkpoint — ensure all tests pass
  - Run `npm test` in `server/`; ensure all unit and property tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** with a minimum of 100 iterations each
- Unit tests use Jest with manual mocks for `io` and `socket`
- `socket.rooms` is a native Socket.IO `Set` — use `socket.rooms.has(roomId)` for membership check
- The handler has no Redis dependency; do not import or inject a Redis client into `messageHandler.js`
- `uuid` is already installed (`"uuid": "^14.0.0"` in `server/package.json`) — import with `const { v4: uuidv4 } = require('uuid')`
- The `io.to(roomId).emit` call sends to all sockets in the room including the sender — do NOT use `socket.broadcast.to`

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4.1"] },
    { "wave": 5, "tasks": ["4.2", "4.3", "4.4"] },
    { "wave": 6, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "wave": 7, "tasks": ["6"] }
  ]
}
```
