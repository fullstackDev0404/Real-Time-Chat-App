exports.up = async (knex) => {
  await knex.schema.createTable('users', (t) => {
    t.text('id').primary()
    t.text('username').notNullable().unique()
    t.text('password_hash').notNullable()
    t.integer('created_at').notNullable()
  })

  await knex.schema.createTable('messages', (t) => {
    t.text('id').primary()
    t.text('room_id').notNullable()
    t.text('sender_id').notNullable()
    t.text('message').notNullable()
    t.integer('created_at').notNullable()
  })
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('messages')
  await knex.schema.dropTableIfExists('users')
}
