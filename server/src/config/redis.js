const Redis = require('ioredis')
const config = require('./env')

let client = null

/**
 * Create and return a Redis client singleton.
 * Handles connection events, errors, and reconnection automatically.
 */
function createRedisClient() {
  if (client) return client

  client = new Redis(config.redisUrl, {
    // Retry strategy: exponential backoff capped at 10s
    retryStrategy(times) {
      const delay = Math.min(times * 200, 10000)
      console.warn(`[Redis] Reconnecting... attempt #${times} (delay: ${delay}ms)`)
      return delay
    },
    // Stop retrying after 20 failed attempts
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  })

  client.on('connect', () => {
    console.log('[Redis] Connecting...')
  })

  client.on('ready', () => {
    console.log('[Redis] ✅ Connected and ready')
  })

  client.on('error', (err) => {
    console.error('[Redis] ❌ Error:', err.message)
  })

  client.on('close', () => {
    console.warn('[Redis] Connection closed')
  })

  client.on('reconnecting', () => {
    console.warn('[Redis] Reconnecting...')
  })

  client.on('end', () => {
    console.warn('[Redis] Connection ended')
  })

  return client
}

/**
 * Ping Redis to verify connectivity.
 * Returns true if successful, false otherwise.
 */
async function pingRedis() {
  try {
    const redis = createRedisClient()
    const result = await redis.ping()
    return result === 'PONG'
  } catch (err) {
    console.error('[Redis] Ping failed:', err.message)
    return false
  }
}

/**
 * Gracefully disconnect the Redis client.
 */
async function disconnectRedis() {
  if (client) {
    await client.quit()
    client = null
    console.log('[Redis] Disconnected gracefully')
  }
}

module.exports = { createRedisClient, pingRedis, disconnectRedis }
