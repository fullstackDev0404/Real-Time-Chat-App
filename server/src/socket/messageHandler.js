'use strict'

const { v4: uuidv4 } = require('uuid')
const { saveMessage } = require('../models/message')

/**
 * Validate the sendMessage payload.
 * @param {*} roomId
 * @param {*} message
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePayload(roomId, message) {
  if (typeof roomId !== 'string' || roomId.trim() === '') {
    return { valid: false, error: 'roomId must be a non-empty string' }
  }

  if (typeof message !== 'string' || message.trim() === '') {
    return { valid: false, error: 'message must be a non-empty string' }
  }

  if (message.trim().length > 2000) {
    return { valid: false, error: 'message exceeds maximum length of 2000 characters' }
  }

  return { valid: true }
}

/**
 * Handle a sendMessage event from a socket.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {{ roomId: any, message: any }} data
 */
function handleSendMessage(io, socket, { roomId, message } = {}) {
  // 1. Validate payload
  const result = validatePayload(roomId, message)
  if (!result.valid) {
    socket.emit('error', { message: result.error })
    return
  }

  // 2. Check room membership
  if (!socket.rooms.has(roomId)) {
    socket.emit('error', { message: 'You are not a member of this room' })
    return
  }

  // 3. Build the canonical message payload
  const payload = {
    messageId: uuidv4(),
    senderId: socket.id,
    roomId,
    message: message.trim(),
    timestamp: Date.now(),
  }

  // 4. Broadcast to all sockets in the room (including sender)
  try {
    io.to(roomId).emit('newMessage', payload)

    // Fire-and-forget persistence — broadcast always completes first
    saveMessage({
      id: payload.messageId,
      roomId: payload.roomId,
      senderId: payload.senderId,
      message: payload.message,
      createdAt: payload.timestamp,
    }).catch((err) => {
      console.error('[MessageHandler] Failed to persist message', {
        messageId: payload.messageId,
        roomId,
        socketId: socket.id,
        error: err.message,
      })
    })
  } catch (err) {
    console.error('[MessageHandler] Broadcast error', { roomId, socketId: socket.id, error: err })
    socket.emit('error', { message: 'Broadcast failed' })
  }
}

/**
 * Register message-related Socket.IO event handlers for a socket.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerMessageHandlers(io, socket) {
  socket.on('sendMessage', (data) => {
    handleSendMessage(io, socket, data)
  })
}

module.exports = { validatePayload, handleSendMessage, registerMessageHandlers }
