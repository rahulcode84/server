const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    username: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
)

// Index for fetching messages by project, sorted by time
messageSchema.index({ project: 1, timestamp: 1 })

module.exports = mongoose.model('Message', messageSchema)
