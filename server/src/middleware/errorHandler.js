/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500
  const message = err.message || 'Internal Server Error'

  console.error(`[Error] ${status} - ${message}`)
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack)
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

module.exports = errorHandler
