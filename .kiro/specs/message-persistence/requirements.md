# Requirements Document

## Introduction

This feature introduces SQLite-backed message persistence to the real-time chat server. Using Knex as the query builder and `better-sqlite3` as the SQLite driver, the server will create and migrate a `messages` table (and a `users` table for future auth) on startup, then persist every successfully broadcast message to the database. The persistence layer hooks into the existing `sendMessage` / `newMessage` flow from the `message-broadcasting` feature: after `io.to(roomId).emit('newMessage', payload)` succeeds, the canonical `Message_Payload` is written to the database. Persistence failures are fire-and-forget — they are logged but never surfaced to the client.

## Glossary

- **Knex**: A SQL query builder for Node.js used to manage database connections, migrations, and queries.
- **better-sqlite3**: A synchronous SQLite3 driver for Node.js used as the Knex dialect.
- **DB_Singleton**: The single Knex instance exported from `server/src/config/db.js`, shared across the application.
- **Migration**: A versioned Knex migration file that creates or alters database tables in a repeatable, ordered way.
- **Message_Model**: The thin data-access module at `server/src/models/message.js` that exposes `saveMessage()`.
- **Message_Payload**: The canonical object broadcast in every `newMessage` event: `{ messageId, senderId, roomId, message, timestamp }` — defined by the `message-broadcasting` feature.
- **Message_Handler**: The existing `server/src/socket/messageHandler.js` module that processes `sendMessage` events and emits `newMessage` broadcasts.
- **messages table**: The SQLite table that stores persisted chat messages.
- **users table**: The SQLite table created in this commit for future JWT authentication (Commit 5); no user CRUD logic is implemented here.
- **Fire-and-forget**: A persistence pattern where a database write is attempted after a broadcast, but any failure is only logged — the client is never notified of a persistence error.

## Requirements

### Requirement 1: Database Configuration

**User Story:** As a developer, I want a single Knex instance configured for SQLite, so that all parts of the server share one database connection.

#### Acceptance Criteria

1. THE DB_Singleton SHALL be created in `server/src/config/db.js` using Knex configured with the `better-sqlite3` client.
2. THE DB_Singleton SHALL read the SQLite file path from the `DB_PATH` environment variable, falling back to `./data/chat.db` when the variable is absent.
3. WHEN the server starts, THE DB_Singleton SHALL be importable without throwing an error.
4. THE `server/data/` directory SHALL be used as the default location for the SQLite database file.

### Requirement 2: Database Migrations

**User Story:** As a developer, I want versioned migrations to create the `messages` and `users` tables, so that the schema is reproducible and tracked in source control.

#### Acceptance Criteria

1. THE Migration SHALL create a `users` table with columns: `id` (TEXT PRIMARY KEY, UUID), `username` (TEXT NOT NULL UNIQUE), `password_hash` (TEXT NOT NULL), `created_at` (INTEGER, Unix milliseconds).
2. THE Migration SHALL create a `messages` table with columns: `id` (TEXT PRIMARY KEY, UUID matching `messageId` from the broadcast payload), `room_id` (TEXT NOT NULL), `sender_id` (TEXT NOT NULL), `message` (TEXT NOT NULL), `created_at` (INTEGER, Unix milliseconds matching `timestamp` from the broadcast payload).
3. WHEN `knex.migrate.latest()` is called, THE Migration SHALL apply all pending migrations in order without error.
4. WHEN `knex.migrate.latest()` is called a second time on an already-migrated database, THE Migration SHALL complete without error and without re-applying migrations (idempotent).
5. THE Migration files SHALL be stored under `server/src/db/migrations/`.

### Requirement 3: Server Startup Integration

**User Story:** As a developer, I want migrations to run automatically on server startup, so that the database schema is always up to date without manual steps.

#### Acceptance Criteria

1. WHEN `startServer()` is called in `server/src/index.js`, THE Server SHALL call `knex.migrate.latest()` before the HTTP server begins listening, and SHALL begin listening for HTTP requests immediately after migrations complete successfully.
2. IF `knex.migrate.latest()` throws an error, THEN THE Server SHALL log the error and exit the process with a non-zero exit code.
3. WHEN migrations complete successfully, THE Server SHALL log a confirmation message indicating migrations are done, regardless of any other database readiness state.
4. THE `DB_PATH` environment variable SHALL be documented in `server/.env.example`.

### Requirement 4: Message Model

**User Story:** As a developer, I want a thin model module for saving messages, so that database access is encapsulated and the socket handler stays focused on event logic.

#### Acceptance Criteria

1. THE Message_Model SHALL export a `saveMessage({ id, roomId, senderId, message, createdAt })` function.
2. WHEN `saveMessage` is called, THE Message_Model SHALL insert one row into the `messages` table mapping: `id → id`, `room_id → roomId`, `sender_id → senderId`, `message → message`, `created_at → createdAt`.
3. WHEN `saveMessage` is called with a duplicate `id`, THE Message_Model SHALL throw an error (SQLite UNIQUE constraint violation on the primary key).
4. THE Message_Model SHALL use the DB_Singleton for all database operations.

### Requirement 5: Persist Messages After Broadcast

**User Story:** As a system operator, I want every successfully broadcast message to be saved to the database, so that chat history is durable and available for future retrieval.

#### Acceptance Criteria

1. WHEN `io.to(roomId).emit('newMessage', payload)` succeeds in THE Message_Handler, THE Message_Handler SHALL call `saveMessage` with the fields mapped from the broadcast payload: `{ id: payload.messageId, roomId: payload.roomId, senderId: payload.senderId, message: payload.message, createdAt: payload.timestamp }`.
2. IF `io.to(roomId).emit('newMessage', payload)` succeeds and `saveMessage` subsequently throws an error, THEN THE Message_Handler SHALL log the error with `{ messageId, roomId, socketId: socket.id }` context and SHALL NOT emit any event to the client.
3. WHILE the Socket.IO server is running, THE Message_Handler SHALL handle persistence failures without throwing unhandled exceptions that could crash the server process.
4. THE Message_Handler SHALL NOT await persistence before emitting the `newMessage` broadcast — the broadcast MUST complete before the database write is attempted.

### Requirement 6: Environment Configuration

**User Story:** As a developer, I want the database file path to be configurable via an environment variable, so that different environments (development, test, CI) can use separate database files.

#### Acceptance Criteria

1. THE `server/.env.example` file SHALL include a `DB_PATH` entry with the default value `./data/chat.db`.
2. WHEN `DB_PATH` is set in the environment, THE DB_Singleton SHALL use that path as the SQLite filename.
3. WHEN `DB_PATH` is not set, THE DB_Singleton SHALL fall back to `./data/chat.db`.
