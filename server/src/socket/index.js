const { Server } = require('socket.io')
const config = require('../config/env')

/**
 * Initialize Socket.IO and attach it to the HTTP server.
 * @param {import('http').Server} httpServer
 * @returns {import('socket.io').Server}
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Ping clients every 25s, disconnect if no pong within 60s
    pingInterval: 25000,
    pingTimeout: 60000,
  })

  // ─── Connection Middleware ─────────────────────────────────────────────────
  io.use((socket, next) => {
    // Placeholder for auth middleware (JWT validation added in Commit 5)
    const token = socket.handshake.auth?.token
    if (token) {
      // Token will be verified in auth middleware — store raw for now
      socket.data.token = token
    }
    next()
  })

  // ─── Connection Handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket.IO] ✅ Client connected    | id: ${socket.id} | ip: ${socket.handshake.address}`)

    // ── Disconnection ────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] ❌ Client disconnected | id: ${socket.id} | reason: ${reason}`)
    })

    // ── Disconnect Error ─────────────────────────────────────────────────────
    socket.on('error', (err) => {
      console.error(`[Socket.IO] ⚠️  Socket error      | id: ${socket.id} | error: ${err.message}`)
    })

    // ── Ping/Pong (manual heartbeat for debugging) ───────────────────────────
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() })
    })
  })

  // ─── Server-level Error ────────────────────────────────────────────────────
  io.engine.on('connection_error', (err) => {
    console.error('[Socket.IO] Connection error:', err.message)
  })

  console.log('[Socket.IO] ✅ Initialized')
  return io
}

module.exports = { initSocket }
