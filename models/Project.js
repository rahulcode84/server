const mongoose = require('mongoose')
const crypto = require('crypto')

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'editor', 'viewer'],
      default: 'editor'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
)

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    inviteCode: {
      type: String,
      unique: true,
      default: () => crypto.randomBytes(4).toString('hex').toUpperCase()
    },
    members: [memberSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
)

// Index for fast member lookups
projectSchema.index({ 'members.user': 1 })

module.exports = mongoose.model('Project', projectSchema)
