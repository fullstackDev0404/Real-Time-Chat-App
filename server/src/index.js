const http = require('http')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const config = require('./config/env')
const { createRedisClient, pingRedis, disconnectRedis } = require('./config/redis')
const { initSocket } = require('./socket')
const healthRouter = require('./routes/health')
const errorHandler = require('./middleware/errorHandler')
const notFound = require('./middleware/notFound')

const app = express()
const httpServer = http.createServer(app)

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: config.clientUrl,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// ─── Request Logger (dev only) ────────────────────────────────────────────────
if (config.nodeEnv === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
    next()
  })
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter)

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use(notFound)
app.use(errorHandler)

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  // Initialize Redis
  createRedisClient()
  const redisOk = await pingRedis()
  if (redisOk) {
    console.log('[Redis] ✅ Ping successful')
  } else {
    console.warn('[Redis] ⚠️  Ping failed — server will start but Redis is unavailable')
  }

  // Initialize Socket.IO (attached to httpServer, not app)
  const io = initSocket(httpServer)

  // Make io accessible in routes/controllers if needed
  app.set('io', io)

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] ❌ Port ${config.port} is already in use. Kill the process or change PORT in .env`)
      process.exit(1)
    } else {
      throw err
    }
  })

  httpServer.listen(config.port, () => {
    console.log(`\n🚀 Server running on http://localhost:${config.port}`)
    console.log(`   Environment : ${config.nodeEnv}`)
    console.log(`   Health check: http://localhost:${config.port}/api/health`)
    console.log(`   Redis       : ${redisOk ? '✅ connected' : '❌ unavailable'}`)
    console.log(`   Socket.IO   : ✅ listening\n`)
  })

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal) => {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`)
    io.close(() => console.log('[Socket.IO] Closed'))
    httpServer.close(async () => {
      await disconnectRedis()
      console.log('[Server] Closed. Goodbye.')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  return httpServer
}

startServer().catch((err) => {
  console.error('[Server] Failed to start:', err)
  process.exit(1)
})

module.exports = { app, httpServer }
