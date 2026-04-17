const jwt = require('jsonwebtoken')
const User = require('../models/User')

const JWT_SECRET = process.env.JWT_SECRET || 'codenexus_default_secret'

/**
 * Express middleware to authenticate JWT tokens
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)

    const user = await User.findById(decoded.userId).select('-password')
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' })
  }
}

/**
 * Socket.IO middleware to authenticate socket connections
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (!token) {
      return next(new Error('Authentication required'))
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.userId).select('-password')
    if (!user) {
      return next(new Error('User not found'))
    }

    socket.user = user
    next()
  } catch (error) {
    next(new Error('Invalid token'))
  }
}

/**
 * Generate JWT token for a user
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}

module.exports = { authenticate, authenticateSocket, generateToken }
