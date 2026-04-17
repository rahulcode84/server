const express = require('express')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { authenticate, generateToken } = require('../middleware/auth')

const router = express.Router()

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' })
    }

    if (username.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' })
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
    })

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username or email already taken' })
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword
    })

    // Generate token
    const token = generateToken(user._id)

    res.status(201).json({
      success: true,
      user: user.toJSON(),
      token
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' })
    }

    // Find user
    const user = await User.findOne({ username: username.toLowerCase() })
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' })
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' })
    }

    // Generate token
    const token = generateToken(user._id)

    res.json({
      success: true,
      user: user.toJSON(),
      token
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: req.user })
})

module.exports = router
