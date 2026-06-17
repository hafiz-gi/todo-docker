// backend/src/db.js
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Connect with retry
const connectDB = async () => {
  let retries = 10

  while (retries) {
    try {
      const client = await pool.connect()
      console.log('✅ PostgreSQL connected!')
      client.release()

      // Create tables if not exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(100) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS todos (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          title VARCHAR(255) NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `)
      console.log('✅ Tables ready!')
      break

    } catch (err) {
      retries -= 1
      console.log(`❌ DB connection failed. Retries left: ${retries}`)
      console.log(`   Error: ${err.message}`)

      if (retries === 0) {
        console.log('💀 Could not connect to database. Exiting...')
        process.exit(1)
      }

      // Wait 5 seconds before retry
      await new Promise(res => setTimeout(res, 5000))
    }
  }
}

module.exports = { pool, connectDB }
