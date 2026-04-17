const Message = require('./models/Message')
const { authenticateSocket } = require('./middleware/auth')

/**
 * Set up the /chat Socket.IO namespace for real-time team messaging
 */
function setupChatNamespace(io) {
  const chatNamespace = io.of('/chat')

  // Authenticate every socket connection
  chatNamespace.use(authenticateSocket)

  chatNamespace.on('connection', (socket) => {
    const user = socket.user
    const projectId = socket.handshake.query.projectId

    if (!projectId) {
      socket.disconnect()
      return
    }

    // Join the project room
    const room = `project:${projectId}`
    socket.join(room)

    console.log(`💬 ${user.username} joined chat for project ${projectId}`)

    // Notify others that user joined
    socket.to(room).emit('chat:user-joined', {
      username: user.username,
      userId: user._id
    })

    // Send chat history (last 100 messages)
    Message.find({ project: projectId })
      .sort({ timestamp: -1 })
      .limit(100)
      .then((messages) => {
        socket.emit('chat:history', messages.reverse())
      })
      .catch((err) => {
        console.error('Error loading chat history:', err)
        socket.emit('chat:history', [])
      })

    // Handle incoming messages
    socket.on('chat:send', async (data) => {
      try {
        const { text } = data

        if (!text || !text.trim()) return

        // Save message to MongoDB
        const message = await Message.create({
          project: projectId,
          user: user._id,
          username: user.username,
          text: text.trim()
        })

        // Broadcast to all users in the room (including sender)
        chatNamespace.to(room).emit('chat:message', {
          id: message._id,
          username: user.username,
          userId: user._id,
          text: message.text,
          timestamp: message.timestamp
        })
      } catch (err) {
        console.error('Error sending message:', err)
      }
    })

    // ─── File Sync Relays (Host-Guest) ───
    socket.on('file:sync-request', (data) => {
      // Guest asks for the file tree
      // Broadcast this to the room so the Host can hear it
      chatNamespace.to(room).emit('file:sync-request', {
        ...data,
        requestingSocketId: socket.id,
        username: user.username
      })
    })

    socket.on('file:sync-response', (data) => {
      // Host responds with the packaged directory
      // Send it directly to the guest who requested it
      if (data.requestingSocketId) {
        chatNamespace.to(data.requestingSocketId).emit('file:sync-response', data)
      }
    })

    socket.on('file:tree-changed', () => {
      socket.to(room).emit('file:tree-changed')
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`💬 ${user.username} left chat for project ${projectId}`)
      socket.to(room).emit('chat:user-left', {
        username: user.username,
        userId: user._id
      })
    })
  })
}

module.exports = { setupChatNamespace }
