# Real-Time Chat App

A full-stack real-time chat application built with Vue 3, Node.js, Socket.IO, Redis, and end-to-end encryption.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vue 3, Vite, Pinia, Vue Router |
| Backend | Node.js, Express, Socket.IO |
| Cache / Presence | Redis (ioredis) |
| Database | SQLite / PostgreSQL + Knex |
| Encryption | TweetNaCl (X25519 + XSalsa20-Poly1305) |
| Auth | JWT + bcrypt |
| DevOps | Docker, Docker Compose |

## Project Structure

```
realtime-chat-app/
├── client/          # Vue 3 + Vite frontend
│   └── src/
│       ├── assets/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       └── router/
├── server/          # Node.js + Express backend
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── middleware/
│       └── config/
├── .gitignore
├── package.json
└── README.md
```

## Getting Started

### Prerequisites
- Node.js >= 18
- Redis running locally or via Docker

### Install dependencies

```bash
# Install client dependencies
cd client && npm install

# Install server dependencies
cd server && npm install
```

### Run in development

```bash
# Start the frontend
cd client && npm run dev

# Start the backend
cd server && npm run dev
```

### Environment variables

Copy `.env.example` to `.env` in the server folder:

```bash
cp server/.env.example server/.env
```

## Features (Roadmap)

- [x] Project scaffolding
- [ ] Express server + health check
- [ ] Redis integration
- [ ] Socket.IO real-time messaging
- [ ] JWT authentication
- [ ] Chat rooms + presence tracking
- [ ] Message persistence
- [ ] End-to-end encryption (X25519 + XSalsa20)
- [ ] Vue 3 chat UI
- [ ] Docker Compose deployment
