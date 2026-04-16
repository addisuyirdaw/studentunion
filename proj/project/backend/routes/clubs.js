const express = require('express');
const prisma = require('../prismaClient');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');
const { validateClub } = require('../middleware/validation');

const router = express.Router();
const { authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure reports directory exists
const reportsDir = path.join(__dirname, '..', 'uploads', 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Configure multer storage for reports
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, reportsDir);
  },
  filename: function (req, file, cb) {
    cb(null, `report-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage: storage });

// @desc    Get coordinator grid
// @route   GET /api/clubs/coordinator/grid
// @access  Private/Coordinator
router.get('/coordinator/grid', protect, authorize('COORDINATOR'), async (req, res) => {
  try {
    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        planStatus: true,
        septemberPlanUrl: true,
        juneReportUrl: true,
        representative: { select: { id: true, name: true, email: true } }
      },
      orderBy: { name: 'asc' }
    });
    return res.json({ success: true, count: clubs.length, clubs });
  } catch (error) {
    console.error('Coordinator grid error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching grid' });
  }
});

// @desc    Unified Events Feed
// @route   GET /api/clubs/events/feed
// @access  Public
router.get('/events/feed', optionalAuth, async (req, res) => {
  try {
    const events = await prisma.clubEvent.findMany({
      orderBy: { date: 'asc' },
      where: { date: { gte: new Date() } },
      include: { clubs: { select: { id: true, name: true, image: true, category: true } } }
    });
    res.json({ success: true, count: events.length, events });
  } catch(error) {
    console.error('Feed error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching feed' });
  }
});

// @desc    Create shared event
// @route   POST /api/clubs/events
// @access  Private/Club_Rep
router.post('/events', protect, authorize('CLUB_REP', 'COORDINATOR'), async (req, res) => {
  try {
    const { title, description, date, location, clubIds } = req.body;
    
    // Check authorization for all given clubIds if CLUB_REP
    if (req.user.role !== 'COORDINATOR') {
       const repClubs = await prisma.club.findMany({ where: { representativeId: req.user.id } });
       const repClubIds = repClubs.map(c => c.id);
       const authorizedToPost = clubIds.some(id => repClubIds.includes(id));
       if (!authorizedToPost) {
          return res.status(403).json({ success: false, message: 'Unauthorized. Must represent at least one participating club.' });
       }
    }

    const event = await prisma.clubEvent.create({
      data: {
        title,
        description,
        date: new Date(date),
        location,
        clubs: {
          connect: clubIds.map(id => ({ id }))
        }
      },
      include: { clubs: { select: { id: true, name: true } } }
    });

    res.status(201).json({ success: true, event });
  } catch(error) {
     console.error('Create event error:', error);
     res.status(500).json({ success: false, message: 'Server error creating event' });
  }
});

// @desc    Get all clubs
// @route   GET /api/clubs
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const { category, status, search } = req.query;

    let where = {};
    
    // We show all clubs regardless of status for students to be able to see and join them!
    if (status) {
      where.status = status;
    }

    if (category) where.category = category;
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const clubs = await prisma.club.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
      include: {
        president: { select: { name: true, email: true, profileImage: true } },
        vicePresident: { select: { name: true, email: true, profileImage: true } },
        secretary: { select: { name: true, email: true, profileImage: true } },
        treasurer: { select: { name: true, email: true, profileImage: true } },
        representative: { select: { id: true, name: true, email: true, phoneNumber: true } },
        members: { where: { status: 'ACCEPTED' } },
        events: true
      }
    });

    const total = await prisma.club.count({ where });

    // Transform clubs
    const transformedClubs = clubs.map(club => ({
      id: club.id,
      name: club.name,
      description: club.description,
      category: club.category,
      founded: club.founded,
      image: club.image,
      members: club.members ? club.members.length : 0,
      events: club.events ? club.events.length : 0,
      status: club.status,
      contactEmail: club.contactEmail,
      meetingSchedule: club.meetingSchedule,
      leadership: {
        president: club.president,
        vicePresident: club.vicePresident,
        secretary: club.secretary,
        treasurer: club.treasurer
      },
      representative: club.representative,
      socialMedia: {
        facebook: club.facebook,
        instagram: club.instagram,
        twitter: club.twitter,
        telegram: club.telegram
      },
      createdAt: club.createdAt
    }));

    return res.json({
      success: true,
      count: transformedClubs.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      clubs: transformedClubs,
      data: transformedClubs
    });
  } catch (error) {
    console.error('Get clubs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching clubs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Get single club
// @route   GET /api/clubs/:id
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const club = await prisma.club.findUnique({
      where: { id: req.params.id },
      include: {
        representative: { select: { name: true, email: true, phoneNumber: true } },
        members: { where: { status: 'ACCEPTED' }, include: { user: { select: { name: true, email: true, studentId: true, department: true, year: true, profileImage: true } } } },
        president: { select: { name: true, email: true, studentId: true, profileImage: true } },
        vicePresident: { select: { name: true, email: true, studentId: true, profileImage: true } },
        secretary: { select: { name: true, email: true, studentId: true, profileImage: true } },
        treasurer: { select: { name: true, email: true, studentId: true, profileImage: true } },
        events: { include: { attendees: { include: { user: { select: { name: true, email: true, profileImage: true } } } } } }
      }
    });

    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Club not found'
      });
    }

    if ((!req.user || !req.user.isAdmin) && !['active', 'approved'].includes(club.status?.toLowerCase())) {
      return res.status(404).json({
        success: false,
        message: 'Club not found'
      });
    }

    // transform leadership
    const transformedClub = {
      ...club,
      leadership: {
        president: club.president,
        vicePresident: club.vicePresident,
        secretary: club.secretary,
        treasurer: club.treasurer
      }
    };

    res.json({
      success: true,
      club: transformedClub
    });
  } catch (error) {
    console.error('Get club error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching club',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Create new club
// @route   POST /api/clubs
// @access  Private/Admin
router.post('/', protect, adminOnly, validateClub, async (req, res) => {
  try {
    const { name, description, category, founded, image, contactEmail, meetingSchedule, requirements } = req.body;

    const existingClub = await prisma.club.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    });
    
    if (existingClub) {
      return res.status(409).json({
        success: false,
        message: 'Club with this name already exists'
      });
    }

    const club = await prisma.club.create({
      data: {
        name,
        description,
        category,
        founded: founded || new Date().getFullYear().toString(),
        image: image || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=400',
        contactEmail,
        meetingSchedule,
        requirements,
        status: 'active'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Club created successfully',
      club
    });
  } catch (error) {
    console.error('Create club error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating club',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Update club
// @route   PUT /api/clubs/:id
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, description, category, image, contactEmail, meetingSchedule, requirements, status } = req.body;

    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Club not found'
      });
    }

    if (name && name !== club.name) {
      const existingClub = await prisma.club.findFirst({ 
        where: { name: { equals: name, mode: 'insensitive' }, id: { not: req.params.id } }
      });
      if (existingClub) {
        return res.status(409).json({
          success: false,
          message: 'Club with this name already exists'
        });
      }
    }

    const updatedClub = await prisma.club.update({
      where: { id: req.params.id },
      data: {
        name: name || undefined,
        description: description || undefined,
        category: category || undefined,
        image: image || undefined,
        contactEmail: contactEmail || undefined,
        meetingSchedule: meetingSchedule || undefined,
        requirements: requirements || undefined,
        status: status || undefined
      }
    });

    res.json({
      success: true,
      message: 'Club updated successfully',
      club: updatedClub
    });
  } catch (error) {
    console.error('Update club error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating club',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Upload/Update Club documents
// @route   PATCH /api/clubs/:id/documents
// @access  Private/Club_Rep
router.patch('/:id/documents', protect, authorize('CLUB_REP', 'COORDINATOR'), async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    if (req.user.role !== 'COORDINATOR' && club.representativeId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Unauthorized. Not representative for this club.' });
    }

    const { septemberPlanUrl, juneReportUrl, planStatus } = req.body;
    const updateData = {};
    if (septemberPlanUrl !== undefined) updateData.septemberPlanUrl = septemberPlanUrl;
    if (juneReportUrl !== undefined) updateData.juneReportUrl = juneReportUrl;
    if (planStatus) updateData.planStatus = planStatus;

    if ((septemberPlanUrl || juneReportUrl) && club.planStatus === 'PENDING' && !planStatus) {
       updateData.planStatus = 'SUBMITTED';
    }

    const updatedClub = await prisma.club.update({
      where: { id: club.id },
      data: updateData
    });

    res.json({ success: true, message: 'Documents updated', club: updatedClub });
  } catch (error) {
    console.error('Document update error:', error);
    res.status(500).json({ success: false, message: 'Server error updating documents' });
  }
});

// @desc    Delete club
// @route   DELETE /api/clubs/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Club not found'
      });
    }

    await prisma.club.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      message: 'Club deleted successfully'
    });
  } catch (error) {
    console.error('Delete club error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting club',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Join club
// @route   POST /api/clubs/:id/join
// @access  Private
router.post('/:id/join', protect, async (req, res) => {
  try {
    const { fullName, department, year, background } = req.body;

    if (!fullName || !department || !year) {
      return res.status(400).json({
        success: false,
        message: 'Full name, department, and year are required'
      });
    }

    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Club not found'
      });
    }

    if (!['active', 'approved'].includes(club.status?.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Cannot join inactive club'
      });
    }

    const existingMember = await prisma.clubMember.findFirst({
      where: { clubId: club.id, userId: req.user.id }
    });
    
    if (existingMember) {
      if (existingMember.status === 'PENDING') {
        return res.status(400).json({
          success: false,
          message: 'Your join request is already pending approval'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'You are already a member of this club'
      });
    }

    await prisma.clubMember.create({
      data: {
        clubId: club.id,
        userId: req.user.id,
        fullName: fullName || req.user.name,
        department: department || req.user.department,
        year: year || req.user.year,
        background,
        role: 'member',
        status: 'PENDING'
      }
    });

    res.json({
      success: true,
      message: 'Join request submitted successfully. Waiting for representative approval.'
    });
  } catch (error) {
    console.error('Join club error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error joining club',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @desc    Approve club member
// @route   PATCH /api/clubs/:id/members/:memberId/approve
// @access  Private/Club_Rep
router.patch('/:id/members/:memberId/approve', protect, authorize('CLUB_REP', 'COORDINATOR'), async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) {
      return res.status(404).json({
        success: false,
        message: 'Club not found'
      });
    }

    if (req.user.role !== 'COORDINATOR' && club.representativeId !== req.user.id) {
       return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const member = await prisma.clubMember.findUnique({ where: { id: req.params.memberId } });
    if (!member || member.clubId !== club.id) {
      return res.status(404).json({
        success: false,
        message: 'Member not found'
      });
    }

    await prisma.clubMember.update({
      where: { id: member.id },
      data: { status: 'ACCEPTED' }
    });

    res.json({
      success: true,
      message: 'Member accepted successfully'
    });
  } catch (error) {
    console.error('Approve member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error approving member'
    });
  }
});

// @desc    Reject club member
// @route   PATCH /api/clubs/:id/members/:memberId/reject
// @access  Private/Club_Rep
router.patch('/:id/members/:memberId/reject', protect, authorize('CLUB_REP', 'COORDINATOR'), async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) { return res.status(404).json({ success: false, message: 'Club not found' }); }

    if (req.user.role !== 'COORDINATOR' && club.representativeId !== req.user.id) {
       return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const member = await prisma.clubMember.findUnique({ where: { id: req.params.memberId } });
    if (!member || member.clubId !== club.id) { return res.status(404).json({ success: false, message: 'Member not found' }); }

    await prisma.clubMember.update({
      where: { id: member.id },
      data: { status: 'REJECTED' }
    });

    res.json({ success: true, message: 'Member rejected successfully' });
  } catch (error) {
    console.error('Reject member error:', error);
    res.status(500).json({ success: false, message: 'Server error rejecting member' });
  }
});

// @desc    Get club join requests
// @route   GET /api/clubs/:id/join-requests
// @access  Private/Club_Rep
router.get('/:id/join-requests', protect, authorize('CLUB_REP', 'COORDINATOR'), async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) { return res.status(404).json({ success: false, message: 'Club not found' }); }

    if (req.user.role !== 'COORDINATOR' && club.representativeId !== req.user.id) {
       return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const pendingRequests = await prisma.clubMember.findMany({
      where: { clubId: club.id, status: 'PENDING' },
      include: { user: { select: { name: true, username: true, email: true, profileImage: true } } }
    });

    res.json({
      success: true,
      count: pendingRequests.length,
      requests: pendingRequests
    });
  } catch (error) {
    console.error('Get join requests error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching join requests' });
  }
});

// @desc    Leave club
// @route   POST /api/clubs/:id/leave
// @access  Private
router.post('/:id/leave', protect, async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) { return res.status(404).json({ success: false, message: 'Club not found' }); }

    const member = await prisma.clubMember.findFirst({
      where: { clubId: club.id, userId: req.user.id }
    });
    
    if (!member) {
      return res.status(400).json({ success: false, message: 'You are not a member of this club' });
    }

    await prisma.clubMember.delete({ where: { id: member.id } });

    res.json({ success: true, message: 'Successfully left the club' });
  } catch (error) {
    console.error('Leave club error:', error);
    res.status(500).json({ success: false, message: 'Server error leaving club' });
  }
});

// @desc    Get club statistics
// @route   GET /api/clubs/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const totalClubs = await prisma.club.count();
    const activeClubs = await prisma.club.count({ where: { status: 'active' } });
    const pendingClubs = await prisma.club.count({ where: { status: 'pending' } });
    const inactiveClubs = await prisma.club.count({ where: { status: 'inactive' } });

    const catsRaw = await prisma.club.groupBy({
      by: ['category'],
      _count: { category: true }
    });
    const clubsByCategory = catsRaw.map(c => ({ _id: c.category, count: c._count.category }));

    const totalMembers = await prisma.clubMember.count();
    const avgMembers = totalClubs > 0 ? Math.round(totalMembers / totalClubs) : 0;

    const popularClubsRaw = await prisma.club.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { members: { _count: 'desc' } },
      take: 5
    });

    const popularClubs = popularClubsRaw.map(c => ({ name: c.name, memberCount: c._count.members }));

    res.json({
      success: true,
      stats: {
        totalClubs, activeClubs, pendingClubs, inactiveClubs,
        totalMembers, avgMembers, clubsByCategory, popularClubs
      }
    });
  } catch (error) {
    console.error('Get club stats error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching club statistics' });
  }
});

// @desc    Get all club reports (Global)
// @route   GET /api/clubs/reports/all
// @access  Private/Coordinator
router.get('/reports/all', protect, authorize('COORDINATOR'), async (req, res) => {
  try {
    const reports = await prisma.clubActivity.findMany({
      where: { type: 'REPORT' },
      orderBy: { date: 'desc' },
      include: {
        club: { select: { id: true, name: true, image: true, category: true } }
      }
    });
    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching all reports' });
  }
});

// @desc    Get club activities
// @route   GET /api/clubs/:id/activities
// @access  Private
router.get('/:id/activities', protect, async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    // Restrict visibility: Students only see 'EVENT'. Coordinator/Reps see both.
    let query = { clubId: club.id };
    
    if (req.user.role !== 'COORDINATOR' && !(req.user.role === 'CLUB_REP' && club.representativeId === req.user.id) && !req.user.isAdmin) {
       query.type = 'EVENT';
    }

    const activities = await prisma.clubActivity.findMany({
      where: query,
      orderBy: { date: 'desc' }
    });

    res.json({ success: true, activities });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching activities' });
  }
});

// @desc    Create club activity
// @route   POST /api/clubs/:id/activities
// @access  Private/Club_Rep
router.post('/:id/activities', protect, authorize('CLUB_REP'), upload.single('file'), async (req, res) => {
  try {
    const club = await prisma.club.findUnique({ where: { id: req.params.id } });
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    if (club.representativeId !== req.user.id) {
       return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const { type, title, description, fileUrl, date } = req.body;
    
    if (!title || !type) {
      return res.status(400).json({ success: false, message: 'Title and type are required' });
    }

    // Capture the static Express uploaded path OR generic text link
    let finalFileUrl = req.file ? `/uploads/reports/${req.file.filename}` : fileUrl;

    const activity = await prisma.clubActivity.create({
      data: {
        clubId: club.id,
        type: type.toUpperCase(),
        title,
        description,
        fileUrl: finalFileUrl,
        date: date ? new Date(date) : undefined
      }
    });

    res.status(201).json({ success: true, activity });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ success: false, message: 'Server error creating activity' });
  }
});

module.exports = router;