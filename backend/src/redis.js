// backend/src/redis.js
const { createClient } = require('redis')

const client = createClient({
  url: process.env.REDIS_URL,
})

client.on('error', (err) => {
  console.log('❌ Redis error:', err.message)
})

client.on('connect', () => {
  console.log('✅ Redis connected!')
})

const connectRedis = async () => {
  await client.connect()
}

module.exports = { client, connectRedis }
