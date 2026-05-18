# Implementation Plan: Message Persistence

## Overview

Install Knex and better-sqlite3, create the DB singleton and migrations, implement the Message Model, wire persistence into the existing message handler, and update server startup to run migrations. Tests are co-located with each implementation step to catch errors early.

## Tasks

- [x] 1. Install dependencies and scaffold directory structure
  - Run `npm install knex better-sqlite3` in `server/`
  - Create `server/data/` directory (add a `.gitkeep` so it is tracked; add `server/data/*.db` to `.gitignore`)
  - Create `server/src/db/migrations/` directory
  - _Requirements: 1.1, 2.5_

- [ ] 2. Create the Knex singleton (`server/src/config/db.js`)
  - Add `dbPath` to `server/src/config/env.js`: `dbPath: process.env.DB_PATH || path.resolve(__dirname, '../../data/chat.db')`
  - Add `DB_PATH=./data/chat.db` to `server/.env.example`
  - Create `server/src/config/db.js` exporting a Knex instance configured with `client: 'better-sqlite3'`, `connection: { filename: config.dbPath }`, `useNullAsDefault: true`, and `migrations: { directory: path.resolve(__dirname, '../db/migrations') }`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3_

  - [ ]* 2.1 Write unit tests for DB_PATH config resolution
    - Test: `DB_PATH` env var set → Knex connection filename matches the env var value
    - Test: `DB_PATH` env var absent → Knex connection filename ends with `data/chat.db`
    - _Requirements: 1.2, 6.2, 6.3_

- [ ] 3. Create the initial migration
  - Create `server/src/db/migrations/20240101000000_create_users_and_messages.js`
  - `exports.up`: create `users` table (`id` TEXT PK, `username` TEXT NOT NULL UNIQUE, `password_hash` TEXT NOT NULL, `created_at` INTEGER NOT NULL) then create `messages` table (`id` TEXT PK, `room_id` TEXT NOT NULL, `sender_id` TEXT NOT NULL, `message` TEXT NOT NULL, `created_at` INTEGER NOT NULL)
  - `exports.down`: drop `messages` then drop `users`
  - _Requirements: 2.1, 2.2, 2.5_

  - [ ]* 3.1 Write integration tests for migrations
    - Use a temp in-memory or temp-file SQLite DB (separate Knex instance pointing to `:memory:` or a temp path)
    - Test: `knex.migrate.latest()` resolves without error on a fresh DB
    - Test: after migration, `users` table exists with columns `id`, `username`, `password_hash`, `created_at`
    - Test: after migration, `messages` table exists with columns `id`, `room_id`, `sender_id`, `message`, `created_at`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 3.2 Write property test for migration idempotence
    - `// Feature: message-persistence, Property 1: For any already-migrated SQLite DB, calling migrate.latest() again completes without error and leaves the schema unchanged`
    - Use a temp SQLite DB; call `knex.migrate.latest()` twice; assert both calls resolve and schema is identical after each call
    - Minimum 100 iterations (vary by using fresh temp DBs each iteration)
    - _Requirements: 2.4_

- [x] 4. Checkpoint — verify migrations run cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Create the Message Model (`server/src/models/message.js`)
  - Create `server/src/models/message.js`
  - Import the DB singleton from `../config/db`
  - Export `async function saveMessage({ id, roomId, senderId, message, createdAt })` that calls `db('messages').insert({ id, room_id: roomId, sender_id: senderId, message, created_at: createdAt })`
  - _Requirements: 4.1, 4.2, 4.4_

  - [ ]* 5.1 Write property test for saveMessage field mapping
    - `// Feature: message-persistence, Property 2: For any valid message object, saveMessage inserts exactly one row with correct column mapping`
    - Use a temp SQLite DB with migrations applied; generate random `{ id, roomId, senderId, message, createdAt }` objects using `fc.record({ id: fc.uuid(), roomId: fc.string({ minLength: 1 }), senderId: fc.string({ minLength: 1 }), message: fc.string({ minLength: 1 }), createdAt: fc.integer({ min: 0 }) })`
    - Call `saveMessage`, then query the DB; assert the row matches the input exactly
    - Minimum 100 iterations
    - _Requirements: 4.2_

  - [ ]* 5.2 Write unit test for duplicate id constraint
    - Test: insert a message, then call `saveMessage` again with the same `id` → assert an error is thrown (UNIQUE constraint violation)
    - _Requirements: 4.3_

- [ ] 6. Wire persistence into `messageHandler.js`
  - In `server/src/socket/messageHandler.js`, add `const { saveMessage } = require('../models/message')`
  - After `io.to(roomId).emit('newMessage', payload)` succeeds (inside the existing try block, after the emit), add a fire-and-forget call:
    ```js
    saveMessage({
      id: payload.messageId,
      roomId: payload.roomId,
      senderId: payload.senderId,
      message: payload.message,
      createdAt: payload.timestamp,
    }).catch((err) => {
      console.error('[MessageHandler] Failed to persist message', {
        messageId: payload.messageId,
        roomId,
        socketId: socket.id,
        error: err.message,
      })
    })
    ```
  - The `.catch()` must NOT call `socket.emit('error', ...)` — persistence failures are silent to the client
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 6.1 Write property test for persistence call mapping
    - `// Feature: message-persistence, Property 3: For any valid sendMessage payload, after broadcast, saveMessage is called with args derived from the payload`
    - Mock `io` and `saveMessage`; generate random valid payloads using `fc.record({ roomId: fc.string({ minLength: 1, maxLength: 100 }), message: fc.string({ minLength: 1, maxLength: 2000 }) })`; mock `socket.rooms.has` to return true
    - Call `handleSendMessage`; assert `saveMessage` was called with `{ id: payload.messageId, roomId: payload.roomId, senderId: socket.id, message: payload.message, createdAt: payload.timestamp }`
    - Minimum 100 iterations
    - _Requirements: 5.1_

  - [ ]* 6.2 Write property test for persistence failures never crashing the handler
    - `// Feature: message-persistence, Property 4: For any error thrown by saveMessage, handleSendMessage does not throw an unhandled exception`
    - Generate random `Error` objects; mock `saveMessage` to return a rejected promise with the generated error; wrap `handleSendMessage` call; assert no exception escapes and `socket.emit('error')` is NOT called
    - Minimum 100 iterations
    - _Requirements: 5.3_

  - [ ]* 6.3 Write unit test for persistence error logging
    - Mock `saveMessage` to reject with a known error; mock `console.error`; call `handleSendMessage` with a valid payload
    - Assert `console.error` was called with context including `messageId`, `roomId`, and `socketId`
    - Assert `socket.emit` was NOT called with `'error'`
    - _Requirements: 5.2_

- [x] 7. Update server startup to run migrations (`server/src/index.js`)
  - Import the DB singleton: `const db = require('./config/db')`
  - In `startServer()`, before `httpServer.listen(...)`, add:
    ```js
    try {
      await db.migrate.latest()
      console.log('[DB] ✅ Migrations complete')
    } catch (err) {
      console.error('[DB] ❌ Migration failed:', err)
      process.exit(1)
    }
    ```
  - Update the graceful shutdown handler to call `await db.destroy()` before `process.exit(0)`
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 8. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** (already a dev dependency from the `message-broadcasting` spec) with a minimum of 100 iterations each
- `better-sqlite3` is synchronous but Knex wraps it in a Promise-based API — always `await` Knex calls
- The `users` table is created in the migration but no user CRUD is implemented here — that is Commit 5
- The `server/data/` directory must exist before Knex tries to create the SQLite file; the directory is created in Task 1
- For integration tests that need a real DB, use a separate Knex instance pointing to `:memory:` (in-memory SQLite) to avoid polluting the development database
- The fire-and-forget pattern means `saveMessage` is called with `.catch()` — do NOT `await` it in the handler

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["2.1"] },
    { "wave": 4, "tasks": ["3"] },
    { "wave": 5, "tasks": ["3.1", "3.2"] },
    { "wave": 6, "tasks": ["4"] },
    { "wave": 7, "tasks": ["5"] },
    { "wave": 8, "tasks": ["5.1", "5.2"] },
    { "wave": 9, "tasks": ["6"] },
    { "wave": 10, "tasks": ["6.1", "6.2", "6.3"] },
    { "wave": 11, "tasks": ["7"] },
    { "wave": 12, "tasks": ["8"] }
  ]
}
```
