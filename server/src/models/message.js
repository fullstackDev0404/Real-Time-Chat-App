const db = require('../config/db')

async function saveMessage({ id, roomId, senderId, message, createdAt }) {
  await db('messages').insert({
    id,
    room_id: roomId,
    sender_id: senderId,
    message,
    created_at: createdAt,
  })
}

module.exports = { saveMessage }
