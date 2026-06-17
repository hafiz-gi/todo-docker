// backend/src/index.js
const express   = require('express')
const bcrypt    = require('bcryptjs')
const jwt       = require('jsonwebtoken')
const cors      = require('cors')
const { pool, connectDB }     = require('./db')
const { client, connectRedis } = require('./redis')

const app = express()
app.use(express.json())
app.use(cors())

const JWT_SECRET = process.env.JWT_SECRET || 'secret'

// ─── Middleware: verify token ──────────────────────────
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token' })

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.userId = decoded.userId
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ─── Health check ──────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() })
})

// ─── REGISTER ──────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' })

  try {
    const hashed = await bcrypt.hash(password, 10)
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashed]
    )
    res.status(201).json({ message: 'User created', user: result.rows[0] })
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ error: 'Username already exists' })
    res.status(500).json({ error: err.message })
  }
})

// ─── LOGIN ─────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    )

    const user = result.rows[0]
    if (!user) return res.status(400).json({ error: 'User not found' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(400).json({ error: 'Wrong password' })

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })

    // Cache user in Redis
    await client.setEx(`user:${user.id}`, 3600, JSON.stringify({
      id: user.id,
      username: user.username
    }))

    res.json({ token, username: user.username })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET TODOS ─────────────────────────────────────────
app.get('/api/todos', authMiddleware, async (req, res) => {
  try {
    // Try Redis cache first
    const cached = await client.get(`todos:${req.userId}`)
    if (cached) {
      console.log('📦 Serving todos from Redis cache')
      return res.json(JSON.parse(cached))
    }

    // Not in cache - get from database
    const result = await pool.query(
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    )

    // Save to Redis cache for 60 seconds
    await client.setEx(`todos:${req.userId}`, 60, JSON.stringify(result.rows))
    console.log('💾 Todos saved to Redis cache')

    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── CREATE TODO ───────────────────────────────────────
app.post('/api/todos', authMiddleware, async (req, res) => {
  const { title } = req.body
  if (!title) return res.status(400).json({ error: 'Title required' })

  try {
    const result = await pool.query(
      'INSERT INTO todos (user_id, title) VALUES ($1, $2) RETURNING *',
      [req.userId, title]
    )

    // Clear cache so next GET fetches fresh data
    await client.del(`todos:${req.userId}`)

    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── UPDATE TODO (toggle complete) ─────────────────────
app.put('/api/todos/:id', authMiddleware, async (req, res) => {
  const { id } = req.params

  try {
    const result = await pool.query(
      `UPDATE todos
       SET completed = NOT completed
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.userId]
    )

    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Todo not found' })

    // Clear cache
    await client.del(`todos:${req.userId}`)

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── DELETE TODO ───────────────────────────────────────
app.delete('/api/todos/:id', authMiddleware, async (req, res) => {
  const { id } = req.params

  try {
    await pool.query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2',
      [id, req.userId]
    )

    // Clear cache
    await client.del(`todos:${req.userId}`)

    res.json({ message: 'Todo deleted' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── START SERVER ──────────────────────────────────────
const start = async () => {
  await connectDB()
  await connectRedis()

  app.listen(5000, () => {
    console.log('🚀 Backend running on port 5000')
  })
}

start()
