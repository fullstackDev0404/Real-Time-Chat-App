require('dotenv').config()

const path = require('path')

const config = {
  port: process.env.PORT || 3010,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'change-this-secret-in-production',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../../data/chat.db'),
}

module.exports = config
