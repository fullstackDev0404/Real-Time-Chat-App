const knex = require('knex')
const path = require('path')
const config = require('./env')

const db = knex({
  client: 'better-sqlite3',
  connection: {
    filename: config.dbPath,
  },
  useNullAsDefault: true,
  migrations: {
    directory: path.resolve(__dirname, '../db/migrations'),
  },
})

module.exports = db
