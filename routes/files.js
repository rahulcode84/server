const express = require('express')
const File = require('../models/File')
const Project = require('../models/Project')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

router.use(authenticate)

/**
 * Helper: Check if user is a member of the project
 */
async function checkMembership(userId, projectId) {
  const project = await Project.findById(projectId)
  if (!project) return { allowed: false, project: null, role: null }
  const member = project.members.find(
    (m) => m.user.toString() === userId.toString()
  )
  if (!member) return { allowed: false, project, role: null }
  return { allowed: true, project, role: member.role }
}

/**
 * GET /api/files/:projectId
 * List all files in a directory (or root)
 */
router.get('/:projectId', async (req, res) => {
  try {
    const { allowed } = await checkMembership(req.user._id, req.params.projectId)
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' })

    const parentPath = req.query.parentPath || '/'

    const files = await File.find({
      project: req.params.projectId,
      parentPath
    })
      .select('path name isDirectory parentPath updatedAt')
      .sort({ isDirectory: -1, name: 1 }) // Folders first, then alphabetical

    res.json({ success: true, items: files })
  } catch (error) {
    console.error('List files error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * GET /api/files/:projectId/read?path=/path/to/file
 * Read a single file's content
 */
router.get('/:projectId/read', async (req, res) => {
  try {
    const { allowed } = await checkMembership(req.user._id, req.params.projectId)
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' })

    const filePath = req.query.path
    if (!filePath) return res.status(400).json({ success: false, message: 'File path required' })

    const file = await File.findOne({
      project: req.params.projectId,
      path: filePath,
      isDirectory: false
    })

    if (!file) return res.status(404).json({ success: false, message: 'File not found' })

    res.json({ success: true, content: file.content, file })
  } catch (error) {
    console.error('Read file error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * POST /api/files/:projectId/create
 * Create a new file or folder
 */
router.post('/:projectId/create', async (req, res) => {
  try {
    const { allowed, role } = await checkMembership(req.user._id, req.params.projectId)
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' })
    if (role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot create files' })

    const { name, parentPath = '/', isDirectory = false, content = '' } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'File name is required' })
    }

    const cleanName = name.trim()
    const path = parentPath === '/' ? `/${cleanName}` : `${parentPath}/${cleanName}`

    // Check if already exists
    const existing = await File.findOne({ project: req.params.projectId, path })
    if (existing) {
      return res.status(400).json({ success: false, message: 'File or folder already exists' })
    }

    const file = await File.create({
      project: req.params.projectId,
      path,
      name: cleanName,
      parentPath,
      isDirectory,
      content: isDirectory ? '' : content
    })

    res.status(201).json({ success: true, file })
  } catch (error) {
    console.error('Create file error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * PUT /api/files/:projectId/save
 * Save/update file content
 */
router.put('/:projectId/save', async (req, res) => {
  try {
    const { allowed, role } = await checkMembership(req.user._id, req.params.projectId)
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' })
    if (role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot edit files' })

    const { path, content } = req.body

    if (!path) return res.status(400).json({ success: false, message: 'File path required' })

    const file = await File.findOneAndUpdate(
      { project: req.params.projectId, path, isDirectory: false },
      { content },
      { new: true }
    )

    if (!file) return res.status(404).json({ success: false, message: 'File not found' })

    res.json({ success: true, file })
  } catch (error) {
    console.error('Save file error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * PUT /api/files/:projectId/rename
 * Rename a file or folder
 */
router.put('/:projectId/rename', async (req, res) => {
  try {
    const { allowed, role } = await checkMembership(req.user._id, req.params.projectId)
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' })
    if (role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot rename files' })

    const { oldPath, newName } = req.body

    if (!oldPath || !newName) {
      return res.status(400).json({ success: false, message: 'Old path and new name are required' })
    }

    const file = await File.findOne({ project: req.params.projectId, path: oldPath })
    if (!file) return res.status(404).json({ success: false, message: 'File not found' })

    const newPath = file.parentPath === '/' ? `/${newName}` : `${file.parentPath}/${newName}`

    // If it's a directory, also update all children's paths
    if (file.isDirectory) {
      const children = await File.find({
        project: req.params.projectId,
        path: { $regex: `^${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/` }
      })

      for (const child of children) {
        child.path = child.path.replace(oldPath, newPath)
        child.parentPath = child.parentPath.replace(oldPath, newPath)
        await child.save()
      }
    }

    file.name = newName
    file.path = newPath
    await file.save()

    res.json({ success: true, file })
  } catch (error) {
    console.error('Rename file error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * DELETE /api/files/:projectId/delete
 * Delete a file or folder (and all children)
 */
router.delete('/:projectId/delete', async (req, res) => {
  try {
    const { allowed, role } = await checkMembership(req.user._id, req.params.projectId)
    if (!allowed) return res.status(403).json({ success: false, message: 'Access denied' })
    if (role === 'viewer') return res.status(403).json({ success: false, message: 'Viewers cannot delete files' })

    const filePath = req.query.path
    if (!filePath) return res.status(400).json({ success: false, message: 'File path required' })

    const file = await File.findOne({ project: req.params.projectId, path: filePath })
    if (!file) return res.status(404).json({ success: false, message: 'File not found' })

    // If directory, delete all children too
    if (file.isDirectory) {
      await File.deleteMany({
        project: req.params.projectId,
        path: { $regex: `^${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/` }
      })
    }

    await File.deleteOne({ _id: file._id })

    res.json({ success: true, message: 'Deleted successfully' })
  } catch (error) {
    console.error('Delete file error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

module.exports = router
