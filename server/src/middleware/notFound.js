/**
 * 404 Not Found middleware
 */
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  })
}

module.exports = notFound
