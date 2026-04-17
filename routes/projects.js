const express = require('express')
const Project = require('../models/Project')
const File = require('../models/File')
const Message = require('../models/Message')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

// All project routes require authentication
router.use(authenticate)

/**
 * GET /api/projects
 * Get all projects the user is a member of
 */
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find({
      'members.user': req.user._id
    })
      .populate('members.user', 'username email')
      .populate('createdBy', 'username')
      .sort({ updatedAt: -1 })

    // Attach user's role to each project
    const projectsWithRole = projects.map((project) => {
      const member = project.members.find(
        (m) => m.user._id.toString() === req.user._id.toString()
      )
      const obj = project.toObject()
      obj.userRole = member?.role || 'viewer'
      // Flatten member info for frontend
      obj.members = project.members.map((m) => ({
        username: m.user.username,
        userId: m.user._id,
        role: m.role
      }))
      return obj
    })

    res.json({ success: true, projects: projectsWithRole })
  } catch (error) {
    console.error('Fetch projects error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required' })
    }

    const project = await Project.create({
      name: name.trim(),
      description: description?.trim() || '',
      createdBy: req.user._id,
      members: [
        {
          user: req.user._id,
          role: 'owner'
        }
      ]
    })

    await project.populate('members.user', 'username email')

    const result = project.toObject()
    result.userRole = 'owner'
    result.members = project.members.map((m) => ({
      username: m.user.username,
      userId: m.user._id,
      role: m.role
    }))

    res.status(201).json({ success: true, project: result })
  } catch (error) {
    console.error('Create project error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * POST /api/projects/join
 * Join a project using an invite code
 */
router.post('/join', async (req, res) => {
  try {
    const { inviteCode } = req.body

    if (!inviteCode) {
      return res.status(400).json({ success: false, message: 'Invite code is required' })
    }

    const project = await Project.findOne({ inviteCode: inviteCode.toUpperCase() })
    if (!project) {
      return res.status(404).json({ success: false, message: 'Invalid invite code' })
    }

    // Check if already a member
    const isMember = project.members.some(
      (m) => m.user.toString() === req.user._id.toString()
    )

    if (isMember) {
      return res.status(400).json({ success: false, message: 'You are already a member of this project' })
    }

    // Add user as editor by default
    project.members.push({
      user: req.user._id,
      role: 'editor'
    })

    await project.save()

    res.json({ success: true, message: 'Successfully joined the project' })
  } catch (error) {
    console.error('Join project error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * GET /api/projects/:id
 * Get a single project by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('members.user', 'username email')
      .populate('createdBy', 'username')

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    // Check if user is a member
    const member = project.members.find(
      (m) => m.user._id.toString() === req.user._id.toString()
    )

    if (!member) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    const result = project.toObject()
    result.userRole = member.role
    result.members = project.members.map((m) => ({
      username: m.user.username,
      userId: m.user._id,
      role: m.role
    }))

    res.json({ success: true, project: result })
  } catch (error) {
    console.error('Fetch project error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * PATCH /api/projects/:id/members/:userId/role
 * Update a member's role (only owners can do this)
 */
router.patch('/:id/members/:userId/role', async (req, res) => {
  try {
    const { role } = req.body

    if (!['owner', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' })
    }

    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    // Check if requester is owner
    const requesterMember = project.members.find(
      (m) => m.user.toString() === req.user._id.toString()
    )

    if (!requesterMember || requesterMember.role !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only owners can change roles' })
    }

    // Find target member
    const targetMember = project.members.find(
      (m) => m.user.toString() === req.params.userId
    )

    if (!targetMember) {
      return res.status(404).json({ success: false, message: 'Member not found' })
    }

    // Can't change own role (prevent locking yourself out)
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot change your own role' })
    }

    targetMember.role = role
    await project.save()

    res.json({ success: true, message: `Role updated to ${role}` })
  } catch (error) {
    console.error('Update role error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * DELETE /api/projects/:id/members/:userId
 * Remove a member from a project (owners only) or leave a project
 */
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    const isOwner = project.members.some(
      (m) => m.user.toString() === req.user._id.toString() && m.role === 'owner'
    )

    const isSelf = req.params.userId === req.user._id.toString()

    if (!isOwner && !isSelf) {
      return res.status(403).json({ success: false, message: 'Only owners can remove members' })
    }

    project.members = project.members.filter(
      (m) => m.user.toString() !== req.params.userId
    )

    await project.save()

    res.json({ success: true, message: 'Member removed' })
  } catch (error) {
    console.error('Remove member error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

/**
 * DELETE /api/projects/:id
 * Delete entire project (owner only) — removes project, all files, and all messages
 */
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' })
    }

    // Only owner can delete
    const isOwner = project.members.some(
      (m) => m.user.toString() === req.user._id.toString() && m.role === 'owner'
    )

    if (!isOwner) {
      return res.status(403).json({ success: false, message: 'Only the owner can delete a project' })
    }

    // Delete all project files from MongoDB
    await File.deleteMany({ project: req.params.id })

    // Delete all chat messages
    await Message.deleteMany({ project: req.params.id })

    // Delete the project itself
    await Project.deleteOne({ _id: req.params.id })

    res.json({ success: true, message: 'Project deleted successfully' })
  } catch (error) {
    console.error('Delete project error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

module.exports = router

