const express = require('express');
const prisma = require('../prismaClient');
const { protect, adminOnly } = require('../middleware/auth');
const { validateContact } = require('../middleware/validation');

const router = express.Router();

// @desc    Submit contact message
// @route   POST /api/contact
// @access  Public
router.post('/', validateContact, async (req, res) => {
  try {
    const { name, email, subject, message, category } = req.body;

    const contact = await prisma.contact.create({
      data: {
        name,
        email,
        subject,
        message,
        category: category || 'general',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    });

    res.status(201).json({
      success: true,
      message: 'Your message has been sent successfully. We will get back to you soon.',
      contact: {
        id: contact.id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        category: contact.category,
        createdAt: contact.createdAt
      }
    });
  } catch (error) {
    console.error('Submit contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting contact message'
    });
  }
});

// @desc    Get all contact messages
// @route   GET /api/contact
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, category, priority, search } = req.query;

    let where = {};
    
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } }
      ];
    }

    const contactsRaw = await prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        assignedTo: { select: { name: true, email: true, role: true } },
        replies: { include: { author: { select: { name: true, email: true, role: true } } } }
      }
    });

    const total = await prisma.contact.count({ where });

    res.json({
      success: true,
      count: contactsRaw.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      contacts: contactsRaw
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching contact messages'
    });
  }
});

// @desc    Get single contact message
// @route   GET /api/contact/:id
// @access  Private/Admin
router.get('/:id', protect, adminOnly, async (req, res) => {
  try {
    let contactRaw = await prisma.contact.findUnique({
      where: { id: req.params.id },
      include: {
        assignedTo: { select: { name: true, email: true, role: true } },
        replies: { include: { author: { select: { name: true, email: true, role: true } } } }
      }
    });

    if (!contactRaw) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    // Mark as read if it's new
    if (contactRaw.status === 'new') {
      contactRaw = await prisma.contact.update({
        where: { id: contactRaw.id },
        data: { status: 'read' },
        include: {
          assignedTo: { select: { name: true, email: true, role: true } },
          replies: { include: { author: { select: { name: true, email: true, role: true } } } }
        }
      });
    }

    res.json({
      success: true,
      contact: contactRaw
    });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching contact message'
    });
  }
});

// @desc    Update contact message status
// @route   PATCH /api/contact/:id/status
// @access  Private/Admin
router.patch('/:id/status', protect, adminOnly, async (req, res) => {
  try {
    const { status, priority } = req.body;

    const contactRaw = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!contactRaw) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    const updateData = {};
    if (status && ['new', 'read', 'replied', 'resolved'].includes(status)) {
      updateData.status = status;
    }
    if (priority && ['low', 'medium', 'high'].includes(priority)) {
      updateData.priority = priority;
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactRaw.id },
      data: updateData,
      include: {
        assignedTo: { select: { name: true, email: true, role: true } },
        replies: { include: { author: { select: { name: true, email: true, role: true } } } }
      }
    });

    res.json({
      success: true,
      message: 'Contact message updated successfully',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Update contact status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating contact message'
    });
  }
});

// @desc    Reply to contact message
// @route   POST /api/contact/:id/reply
// @access  Private/Admin
router.post('/:id/reply', protect, adminOnly, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Reply message is required'
      });
    }

    const contactRaw = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!contactRaw) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactRaw.id },
      data: {
        status: 'replied',
        assignedToId: req.user.id,
        replies: {
          create: {
            authorId: req.user.id,
            message: message.trim()
          }
        }
      },
      include: {
        assignedTo: { select: { name: true, email: true, role: true } },
        replies: { include: { author: { select: { name: true, email: true, role: true } } }, orderBy: { sentAt: 'desc' } }
      }
    });

    const newReply = updatedContact.replies[0];

    res.json({
      success: true,
      message: 'Reply sent successfully',
      reply: newReply
    });
  } catch (error) {
    console.error('Reply to contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending reply'
    });
  }
});

// @desc    Assign contact message
// @route   PATCH /api/contact/:id/assign
// @access  Private/Admin
router.patch('/:id/assign', protect, adminOnly, async (req, res) => {
  try {
    const { assignedTo } = req.body;

    const contactRaw = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!contactRaw) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    const assignedUser = await prisma.user.findUnique({ where: { id: assignedTo } });
    if (!assignedUser || !assignedUser.isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user assignment'
      });
    }

    const updatedContact = await prisma.contact.update({
      where: { id: contactRaw.id },
      data: {
        assignedToId: assignedTo,
        status: contactRaw.status === 'new' ? 'read' : undefined
      },
      include: {
        assignedTo: { select: { name: true, email: true, role: true } },
        replies: { include: { author: { select: { name: true, email: true, role: true } } } }
      }
    });

    res.json({
      success: true,
      message: 'Contact message assigned successfully',
      contact: updatedContact
    });
  } catch (error) {
    console.error('Assign contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error assigning contact message'
    });
  }
});

// @desc    Delete contact message
// @route   DELETE /api/contact/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const contactRaw = await prisma.contact.findUnique({ where: { id: req.params.id } });
    if (!contactRaw) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    await prisma.contactReply.deleteMany({ where: { contactId: contactRaw.id } });
    await prisma.contact.delete({ where: { id: contactRaw.id } });

    res.json({
      success: true,
      message: 'Contact message deleted successfully'
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting contact message'
    });
  }
});

// @desc    Get contact statistics
// @route   GET /api/contact/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const totalMessages = await prisma.contact.count();
    const newMessages = await prisma.contact.count({ where: { status: 'new' } });
    const readMessages = await prisma.contact.count({ where: { status: 'read' } });
    const repliedMessages = await prisma.contact.count({ where: { status: 'replied' } });
    const resolvedMessages = await prisma.contact.count({ where: { status: 'resolved' } });

    // Messages by category
    const catRaw = await prisma.contact.groupBy({
      by: ['category'], _count: { category: true }
    });
    const messagesByCategory = catRaw.map(c => ({ _id: c.category, count: c._count.category })).sort((a,b) => b.count - a.count);

    // Messages by priority
    const priORaw = await prisma.contact.groupBy({
      by: ['priority'], _count: { priority: true }
    });
    const messagesByPriority = priORaw.map(c => ({ _id: c.priority, count: c._count.priority }));

    // Recent messages (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentMessages = await prisma.contact.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    });

    // Average response time for replied messages
    const repliedWithRepliesRaw = await prisma.contact.findMany({
      where: { status: 'replied' },
      select: { createdAt: true, replies: { select: { sentAt: true }, orderBy: { sentAt: 'asc' }, take: 1 } }
    });

    let avgResponseTime = 0;
    const itemsWithReplies = repliedWithRepliesRaw.filter(r => r.replies && r.replies.length > 0);
    if (itemsWithReplies.length > 0) {
      const totalTime = itemsWithReplies.reduce((sum, contact) => {
        const firstReply = contact.replies[0];
        return sum + (new Date(firstReply.sentAt).getTime() - new Date(contact.createdAt).getTime());
      }, 0);
      avgResponseTime = Math.round(totalTime / itemsWithReplies.length / (1000 * 60 * 60)); // in hours
    }

    res.json({
      success: true,
      stats: {
        totalMessages,
        newMessages,
        readMessages,
        repliedMessages,
        resolvedMessages,
        recentMessages,
        avgResponseTime,
        messagesByCategory,
        messagesByPriority
      }
    });
  } catch (error) {
    console.error('Get contact stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching contact statistics'
    });
  }
});

module.exports = router;