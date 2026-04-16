const express = require('express');
const prisma = require('../prismaClient');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// @desc    Get announcements
// @route   GET /api/announcements
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        coordinator: { select: { name: true, email: true } }
      }
    });
    
    res.json({ success: true, count: announcements.length, announcements });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching announcements' });
  }
});

// @desc    Broadcast announcement
// @route   POST /api/announcements
// @access  Private/Coordinator
router.post('/', protect, authorize('COORDINATOR'), async (req, res) => {
  try {
    const { title, content } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        coordinatorId: req.user.id
      },
      include: { coordinator: { select: { name: true, email: true } } }
    });

    res.status(201).json({ success: true, message: 'Announcement broadcasted', announcement });
  } catch (error) {
    console.error('Broadcast announcement error:', error);
    res.status(500).json({ success: false, message: 'Server error creating announcement' });
  }
});

module.exports = router;
