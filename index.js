require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')
const mongoose = require('mongoose')
const { Server: SocketIOServer } = require('socket.io')
const { WebSocketServer } = require('ws')
const { setupWSConnection } = require('y-websocket/bin/utils')

const authRoutes = require('./routes/auth')
const projectRoutes = require('./routes/projects')
const fileRoutes = require('./routes/files')
const { setupChatNamespace } = require('./chat-handler')
const { authenticateSocket } = require('./middleware/auth')

const app = express()
const server = http.createServer(app)

// ─── Middleware ───
app.use(cors())
app.use(express.json())

// ─── MongoDB Connection ───
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/codenexus'

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err))

// ─── REST API Routes ───
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/files', fileRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// ─── Yjs WebSocket Server ───
// The Yjs WebSocket server runs on a separate path (/yjs)
const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req, { gc: true })
})

// ─── Socket.IO Server (for chat & presence) ───
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Setup chat namespace
setupChatNamespace(io)

// ─── HTTP Server Upgrade Handler ───
// Route WebSocket upgrades to the correct server
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname

  if (pathname === '/yjs' || pathname.startsWith('/yjs')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } else {
    // Let Socket.IO handle its own upgrades
    // socket.destroy() — don't destroy, Socket.IO handles it
  }
})

// ─── Start Server ───
const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║     🚀 CodeNexus Server Running     ║
  ║                                      ║
  ║   REST API : http://localhost:${PORT}   ║
  ║   Yjs WS   : ws://localhost:${PORT}/yjs ║
  ║   Chat IO  : http://localhost:${PORT}   ║
  ╚══════════════════════════════════════╝
  `)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Port ${PORT} is already in use. Server may already be running.`)
  } else {
    console.error('Server error:', err)
  }
})

