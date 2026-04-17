const mongoose = require('mongoose')

const fileSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true
    },
    path: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      default: ''
    },
    isDirectory: {
      type: Boolean,
      default: false
    },
    parentPath: {
      type: String,
      default: '/',
      trim: true
    }
  },
  {
    timestamps: true
  }
)

// Compound index: each path is unique within a project
fileSchema.index({ project: 1, path: 1 }, { unique: true })
// Fast lookups for listing directory contents
fileSchema.index({ project: 1, parentPath: 1 })

module.exports = mongoose.model('File', fileSchema)
