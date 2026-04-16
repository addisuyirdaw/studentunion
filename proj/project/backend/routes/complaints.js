const express = require('express');
const prisma = require('../prismaClient');
const { protect, adminOnly, authorize } = require('../middleware/auth');
const { validateComplaint } = require('../middleware/validation');

const router = express.Router();

function generateCaseId() {
	const date = new Date();
	const formattedDate = date.toISOString().split("T")[0].replace(/-/g, ""); // Format YYYYMMDD
	const randomNum = Math.floor(Math.random() * 10000); // Random number between 0-9999
	return `CASE-${formattedDate}-${randomNum}`;
}

// @desc    Get all complaints
// @route   GET /api/complaints
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, category, priority, search } = req.query;

    let where = {};
    
    // Non-admin users can only see their own complaints
    if (!req.user.isAdmin && req.user.role !== 'admin') {
      if (req.user.id && !req.user.id.toString().includes('admin_') && 
          !req.user.id.toString().includes('student_') && 
          !req.user.id.toString().includes('google_')) {
        where.submittedById = req.user.id;
      }
    }

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { caseId: { contains: search, mode: 'insensitive' } }
      ];
    }

    const complaintsRaw = await prisma.complaint.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        submittedBy: { select: { name: true, email: true, studentId: true } },
        assignedTo: { select: { name: true, email: true, role: true } },
        responses: {
          include: {
            user: { select: { name: true, role: true } }
          }
        }
      }
    });

    // map responses back to have authorId populated like mongoose
    const complaints = complaintsRaw.map(c => ({
      ...c,
      responses: c.responses.map(r => ({ ...r, authorId: r.user }))
    }));

    const total = await prisma.complaint.count({ where });

    res.json({
      success: true,
      count: complaints.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      complaints,
      data: complaints
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching complaints'
    });
  }
});

// @desc    Get single complaint
// @route   GET /api/complaints/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const complaintRaw = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, studentId: true } },
        assignedTo: { select: { name: true, email: true, role: true } },
        responses: { include: { user: { select: { name: true, role: true } } } }
      }
    });

    if (!complaintRaw) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const complaint = {
      ...complaintRaw,
      responses: complaintRaw.responses.map(r => ({ ...r, authorId: r.user }))
    };

    // Check if user can access this complaint
    if (!req.user.isAdmin && req.user.role !== 'admin' && complaint.submittedBy && complaint.submittedBy.id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this complaint'
      });
    }

    res.json({
      success: true,
      complaint
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching complaint'
    });
  }
});

// @desc    Create new complaint
// @route   POST /api/complaints
// @access  Private
router.post('/', protect, validateComplaint, async (req, res) => {
  try {
    const { title, description, category, priority, branch } = req.body;

    const complaint = await prisma.complaint.create({
      data: {
        title,
        description,
        category,
        priority: priority || 'medium',
        branch: branch || category,
        caseId: generateCaseId(),
        submittedById: req.user.id
      },
      include: { submittedBy: { select: { name: true, email: true, studentId: true } } }
    });

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      complaint
    });
  } catch (error) {
    console.error('Create complaint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error creating complaint'
    });
  }
});

// @desc    Update complaint status
// @route   PATCH /api/complaints/:id/status
// @access  Private/Admin
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['submitted', 'under_review', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    let payload = { status };
    if (status === 'under_review' && !complaint.assignedToId) {
      payload.assignedToId = req.user.id;
    }
    if (status === 'resolved' && !complaint.resolvedAt) payload.resolvedAt = new Date();
    if (status === 'closed' && !complaint.closedAt) payload.closedAt = new Date();

    const updatedComplaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: payload,
      include: {
        submittedBy: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true, role: true } },
        responses: { include: { user: { select: { name: true, role: true } } } }
      }
    });

    res.json({
      success: true,
      message: 'Complaint status updated successfully',
      complaint: updatedComplaint
    });
  } catch (error) {
    console.error('Update complaint status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating complaint status'
    });
  }
});

// @desc    Add response to complaint
// @route   POST /api/complaints/:id/responses
// @access  Private/Admin
router.post('/:id/responses', protect, adminOnly, async (req, res) => {
  try {
    const { message } = req.body;

    let textMessage = typeof message === 'string' ? message.trim() : message?.message?.trim() || '';

    if (!textMessage || textMessage.length === 0) {
      return res.status(400).json({ success: false, message: 'Response message is required' });
    }

    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    let complaintUpdatePayload = {};
    if (complaint.status === 'submitted') {
      complaintUpdatePayload = { status: 'under_review', assignedToId: req.user.id };
    }

    await prisma.complaint.update({
      where: { id: complaint.id },
      data: {
        ...complaintUpdatePayload,
        responses: {
          create: {
            author: req.user.name,
            authorId: req.user.id,
            message: textMessage,
            isOfficial: true
          }
        }
      }
    });

    const updatedComplaint = await prisma.complaint.findUnique({
      where: { id: complaint.id },
      include: {
        responses: { include: { user: { select: { name: true, role: true } } } }
      }
    });

    res.json({
      success: true,
      message: 'Response added successfully',
      response: updatedComplaint.responses[updatedComplaint.responses.length - 1]
    });
  } catch (error) {
    console.error('Add response error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding response'
    });
  }
});

// @desc    Assign complaint to admin
// @route   PATCH /api/complaints/:id/assign
// @access  Private/Admin
router.patch('/:id/assign', protect, adminOnly, async (req, res) => {
  try {
    const { assignedTo } = req.body;

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    const assignedUser = await prisma.user.findUnique({ where: { id: assignedTo } });
    if (!assignedUser || !assignedUser.isAdmin) {
      return res.status(400).json({ success: false, message: 'Invalid user assignment' });
    }

    const updatedComplaint = await prisma.complaint.update({
      where: { id: complaint.id },
      data: {
        assignedToId: assignedTo,
        status: complaint.status === 'submitted' ? 'under_review' : undefined
      },
      include: { assignedTo: { select: { name: true, email: true, role: true } } }
    });

    return res.json({
      success: true,
      message: 'Complaint assigned successfully',
      complaint: updatedComplaint
    });
  } catch (error) {
    console.error('Assign complaint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error assigning complaint'
    });
  }
});

// @desc    Get complaint statistics
// @route   GET /api/complaints/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const totalComplaints = await prisma.complaint.count();
    const pendingComplaints = await prisma.complaint.count({ where: { status: 'submitted' } });
    const underReviewComplaints = await prisma.complaint.count({ where: { status: 'under_review' } });
    const resolvedComplaints = await prisma.complaint.count({ where: { status: 'resolved' } });

    // Complaints by category
    const categoryRaw = await prisma.complaint.groupBy({
      by: ['category'], _count: { category: true }
    });
    const complaintsByCategory = categoryRaw.map(c => ({ _id: c.category, count: c._count.category })).sort((a,b) => b.count - a.count);

    // Complaints by priority
    const priorityRaw = await prisma.complaint.groupBy({
      by: ['priority'], _count: { priority: true }
    });
    const complaintsByPriority = priorityRaw.map(c => ({ _id: c.priority, count: c._count.priority }));

    // Recent complaints (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentComplaints = await prisma.complaint.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    });

    // Average resolution time
    const resolvedComplaintsWithTime = await prisma.complaint.findMany({
      where: { status: 'resolved', resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true }
    });

    let avgResolutionTime = 0;
    if (resolvedComplaintsWithTime.length > 0) {
      const totalTime = resolvedComplaintsWithTime.reduce((sum, complaint) => {
        return sum + (new Date(complaint.resolvedAt).getTime() - new Date(complaint.createdAt).getTime());
      }, 0);
      avgResolutionTime = Math.round(totalTime / resolvedComplaintsWithTime.length / (1000 * 60 * 60 * 24)); // in days
    }

    return res.json({
      success: true,
      stats: {
        totalComplaints, pendingComplaints, underReviewComplaints, resolvedComplaints,
        recentComplaints, avgResolutionTime, complaintsByCategory, complaintsByPriority
      }
    });
  } catch (error) {
    console.error('Get complaint stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching complaint statistics'
    });
  }
});

// @desc    Delete complaint (Admin only)
// @route   DELETE /api/complaints/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    if (!req.params.id || req.params.id === 'undefined') {
      return res.status(400).json({ success: false, message: 'Invalid complaint ID' });
    }

    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // delete related responses first (or use onDelete cascade in schema, assuming implicit cascade or doing it manually)
    await prisma.complaintResponse.deleteMany({ where: { complaintId: req.params.id } });
    await prisma.complaintEvidence.deleteMany({ where: { complaintId: req.params.id } });
    await prisma.complaint.delete({ where: { id: req.params.id } });

    return res.json({
      success: true,
      message: 'Complaint deleted successfully'
    });
  } catch (error) {
    console.error('Delete complaint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting complaint'
    });
  }
});

module.exports = router;