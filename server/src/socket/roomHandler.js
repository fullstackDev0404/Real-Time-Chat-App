/**
 * roomHandler.js
 * Handles Socket.IO room join/leave logic with Redis-backed membership tracking.
 */

/**
 * Validate a roomId value.
 * @param {*} roomId
 * @returns {boolean} true if roomId is a non-empty string after trim, false otherwise
 */
function validateRoomId(roomId) {
  return typeof roomId === 'string' && roomId.trim().length > 0
}

/**
 * Handle a joinRoom event.
 * - Validates roomId; emits error and returns early if invalid.
 * - Joins the Socket.IO room.
 * - Adds socket.id to the Redis membership set.
 * - Broadcasts roomJoined to all sockets in the room.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} redis
 * @param {{ roomId: string }} payload
 */
async function handleJoinRoom(io, socket, redis, { roomId } = {}) {
  if (!validateRoomId(roomId)) {
    socket.emit('error', { message: 'roomId must be a non-empty string' })
    return
  }

  socket.join(roomId)

  try {
    await redis.sadd('room:' + roomId + ':members', socket.id)
  } catch (err) {
    console.error('[RoomHandler] redis.sadd failed', { roomId, socketId: socket.id, error: err.message })
    socket.emit('error', { message: 'Failed to register room membership' })
    return
  }

  io.to(roomId).emit('roomJoined', {
    socketId: socket.id,
    roomId,
    timestamp: Date.now(),
  })
}

/**
 * Handle a leaveRoom event.
 * - Validates roomId; emits error and returns early if invalid.
 * - Leaves the Socket.IO room.
 * - Removes socket.id from the Redis membership set.
 * - Deletes the Redis key if the set becomes empty.
 * - Broadcasts roomLeft to remaining sockets in the room.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} redis
 * @param {{ roomId: string }} payload
 */
async function handleLeaveRoom(io, socket, redis, { roomId } = {}) {
  if (!validateRoomId(roomId)) {
    socket.emit('error', { message: 'roomId must be a non-empty string' })
    return
  }

  socket.leave(roomId)

  try {
    await redis.srem('room:' + roomId + ':members', socket.id)

    const remaining = await redis.scard('room:' + roomId + ':members')
    if (remaining === 0) {
      try {
        await redis.del('room:' + roomId + ':members')
      } catch (delErr) {
        console.error('[RoomHandler] redis.del failed (non-fatal)', { roomId, error: delErr.message })
      }
    }
  } catch (err) {
    console.error('[RoomHandler] redis.srem failed', { roomId, socketId: socket.id, error: err.message })
    socket.emit('error', { message: 'Failed to remove room membership' })
    return
  }

  io.to(roomId).emit('roomLeft', {
    socketId: socket.id,
    roomId,
    timestamp: Date.now(),
  })
}

/**
 * Handle a socket disconnect event.
 * Iterates all rooms the socket was in (excluding its own private room),
 * removes it from each Redis membership set, cleans up empty keys,
 * and broadcasts roomLeft to remaining members.
 * Errors per room are caught and logged individually; processing continues.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} redis
 */
async function handleDisconnect(io, socket, redis) {
  for (const roomId of socket.rooms) {
    // Skip the socket's own private room
    if (roomId === socket.id) continue

    try {
      await redis.srem('room:' + roomId + ':members', socket.id)

      const remaining = await redis.scard('room:' + roomId + ':members')
      if (remaining === 0) {
        try {
          await redis.del('room:' + roomId + ':members')
        } catch (delErr) {
          console.error('[RoomHandler] redis.del failed during disconnect (non-fatal)', { roomId, error: delErr.message })
        }
      }

      io.to(roomId).emit('roomLeft', {
        socketId: socket.id,
        roomId,
        timestamp: Date.now(),
      })
    } catch (err) {
      console.error('[RoomHandler] Error during disconnect cleanup', { roomId, socketId: socket.id, error: err.message })
      // Continue to next room
    }
  }
}

/**
 * Register joinRoom, leaveRoom, and disconnect listeners on the given socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('ioredis').Redis} redis
 */
function registerRoomHandlers(io, socket, redis) {
  socket.on('joinRoom', (payload) => handleJoinRoom(io, socket, redis, payload || {}))
  socket.on('leaveRoom', (payload) => handleLeaveRoom(io, socket, redis, payload || {}))
  socket.on('disconnect', () => handleDisconnect(io, socket, redis))
}

module.exports = {
  validateRoomId,
  handleJoinRoom,
  handleLeaveRoom,
  handleDisconnect,
  registerRoomHandlers,
}
