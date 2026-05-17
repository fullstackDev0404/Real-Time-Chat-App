const express = require('express')
const router = express.Router()
const { pingRedis } = require('../config/redis')

/**
 * GET /api/health
 * Health check — includes Redis connectivity status
 */
router.get('/', async (req, res) => {
  const redisOk = await pingRedis()

  res.status(redisOk ? 200 : 503).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      redis: redisOk ? 'connected' : 'unavailable',
    },
  })
})

module.exports = router
