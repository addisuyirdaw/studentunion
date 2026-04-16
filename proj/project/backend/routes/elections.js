const express = require('express');
const prisma = require('../prismaClient');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');
const { validateElection } = require('../middleware/validation');

const router = express.Router();

// @desc    Get all elections
// @route   GET /api/elections
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { status, type, search } = req.query;

    let where = {};
    
    // Only show public elections to non-admin users
    if (!req.user || !req.user.isAdmin) {
      where.isPublic = true;
    }

    if (status) where.status = status;
    if (type) where.electionType = type;
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const electionsRaw = await prisma.election.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        createdBy: { select: { name: true, email: true, role: true } }
      }
    });

    const total = await prisma.election.count({ where });

    // Update election status based on current date
    const now = new Date();
    const elections = [];
    
    for (let election of electionsRaw) {
      let needsUpdate = false;
      let newStatus = election.status;
      
      if (new Date(election.startDate) > now && election.status !== 'upcoming') {
        newStatus = 'upcoming';
        needsUpdate = true;
      } else if (new Date(election.startDate) <= now && new Date(election.endDate) > now && election.status !== 'active') {
        newStatus = 'active';
        needsUpdate = true;
      } else if (new Date(election.endDate) <= now && election.status !== 'completed') {
        newStatus = 'completed';
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        election = await prisma.election.update({
          where: { id: election.id },
          data: { status: newStatus },
          include: { createdBy: { select: { name: true, email: true, role: true } } }
        });
      }
      elections.push(election);
    }

    return res.json({
      success: true,
      count: elections.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      elections,
      data: elections
    });
  } catch (error) {
    console.error('Get elections error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching elections'
    });
  }
});

// @desc    Get single election
// @route   GET /api/elections/:id
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    let election = await prisma.election.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { name: true, email: true, role: true } },
        voters: { include: { user: { select: { name: true, email: true, studentId: true } } } },
        candidates: { include: { voters: true } } // needed to compute candidate votes if needed
      }
    });

    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }

    if ((!req.user || (!req.user.isAdmin && req.user.role !== 'admin')) && !election.isPublic) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }

    // Update election status if needed
    const now = new Date();
    let newStatus = election.status;
    let needsUpdate = false;
    
    if (new Date(election.startDate) > now && election.status !== 'upcoming') {
      newStatus = 'upcoming';
      needsUpdate = true;
    } else if (new Date(election.startDate) <= now && new Date(election.endDate) > now && election.status !== 'active') {
      newStatus = 'active';
      needsUpdate = true;
    } else if (new Date(election.endDate) <= now && election.status !== 'completed') {
      newStatus = 'completed';
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      election = await prisma.election.update({
        where: { id: election.id },
        data: { status: newStatus },
        include: {
          createdBy: { select: { name: true, email: true, role: true } },
          voters: { include: { user: { select: { name: true, email: true, studentId: true } } } },
          candidates: { include: { voters: true } }
        }
      });
    }

    // Hide voter details for non-admin users
    if (!req.user || (!req.user.isAdmin && req.user.role !== 'admin')) {
      election.voters = election.voters.map(voter => ({
        votedAt: voter.votedAt
      }));
    }

    res.json({
      success: true,
      election
    });
  } catch (error) {
    console.error('Get election error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching election'
    });
  }
});

// @desc    Create new election
// @route   POST /api/elections
// @access  Private/Admin
router.post('/', protect, adminOnly, validateElection, async (req, res) => {
  try {
    const { title, description, startDate, endDate, candidates, electionType, rules, isPublic } = req.body;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start < now) {
      return res.status(400).json({ success: false, message: 'Start date cannot be in the past' });
    }

    if (end <= start) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }

    const eligibleVotersCount = await prisma.user.count({ 
      where: { role: 'student', isActive: true }
    });

    const election = await prisma.election.create({
      data: {
        title,
        description,
        startDate: start,
        endDate: end,
        electionType: electionType || 'general',
        rules: rules || [],
        isPublic: isPublic !== false,
        eligibleVoters: eligibleVotersCount,
        createdById: req.user.id,
        candidates: candidates ? {
          create: candidates.map(c => ({
            name: c.name,
            username: c.username,
            department: c.department,
            year: c.year,
            academicYear: c.academicYear,
            position: c.position,
            profileImage: c.profileImage,
            platform: c.platform || [],
            biography: c.biography,
            votes: 0
          }))
        } : undefined
      },
      include: {
        createdBy: { select: { name: true, email: true, role: true } },
        candidates: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Election created successfully',
      election
    });
  } catch (error) {
    console.error('Create election error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating election'
    });
  }
});

// @desc    Update election
// @route   PUT /api/elections/:id
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { title, description, startDate, endDate, rules, isPublic, candidates } = req.body; // candidates complex to update this way, simplified here

    const election = await prisma.election.findUnique({ where: { id: req.params.id } });
    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }

    if (election.status === 'active' || election.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot update active or completed elections' });
    }

    let start = election.startDate;
    let end = election.endDate;

    if (startDate || endDate) {
      start = new Date(startDate || election.startDate);
      end = new Date(endDate || election.endDate);
      const now = new Date();

      if (start < now) { return res.status(400).json({ success: false, message: 'Start date cannot be in the past' }); }
      if (end <= start) { return res.status(400).json({ success: false, message: 'End date must be after start date' }); }
    }

    const updatedElection = await prisma.election.update({
      where: { id: req.params.id },
      data: {
        title: title || undefined,
        description: description || undefined,
        rules: rules || undefined,
        isPublic: isPublic !== undefined ? isPublic : undefined,
        startDate: start,
        endDate: end
      }
    });

    res.json({
      success: true,
      message: 'Election updated successfully',
      election: updatedElection
    });
  } catch (error) {
    console.error('Update election error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating election'
    });
  }
});

// @desc    Delete election
// @route   DELETE /api/elections/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const election = await prisma.election.findUnique({ where: { id: req.params.id } });
    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }

    if (election.status === 'active') {
      return res.status(400).json({ success: false, message: 'Cannot delete active elections' });
    }

    await prisma.electionVoter.deleteMany({ where: { electionId: req.params.id } });
    await prisma.electionCandidate.deleteMany({ where: { electionId: req.params.id } });
    await prisma.election.delete({ where: { id: req.params.id } });

    res.json({
      success: true,
      message: 'Election deleted successfully'
    });
  } catch (error) {
    console.error('Delete election error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting election'
    });
  }
});

// @desc    Vote in election
// @route   POST /api/elections/:id/vote
// @access  Private
router.post('/:id/vote', protect, async (req, res) => {
  try {
    const { candidateId } = req.body;

    if (!candidateId) {
      return res.status(400).json({ success: false, message: 'Candidate ID is required' });
    }

    if (req.user.isAdmin || req.user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Administrators cannot vote in elections' });
    }

    const election = await prisma.election.findUnique({ where: { id: req.params.id } });
    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }

    if (election.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Election is not currently active' });
    }

    const existingVote = await prisma.electionVoter.findFirst({
      where: { electionId: election.id, userId: req.user.id }
    });

    if (existingVote) {
      return res.status(400).json({ success: false, message: 'You have already voted in this election' });
    }

    const candidate = await prisma.electionCandidate.findUnique({ where: { id: candidateId } });
    if (!candidate || candidate.electionId !== election.id) {
      return res.status(400).json({ success: false, message: 'Invalid candidate' });
    }

    // In a transaction
    await prisma.$transaction([
      prisma.electionVoter.create({
        data: {
          electionId: election.id,
          userId: req.user.id,
          candidateId: candidate.id,
          ipAddress: req.ip
        }
      }),
      prisma.electionCandidate.update({
        where: { id: candidate.id },
        data: { votes: { increment: 1 } }
      }),
      prisma.election.update({
        where: { id: election.id },
        data: { totalVotes: { increment: 1 } }
      })
    ]);

    res.json({
      success: true,
      message: 'Vote cast successfully',
      election: {
        id: election.id,
        totalVotes: election.totalVotes + 1,
        hasVoted: true
      }
    });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error casting vote'
    });
  }
});

// @desc    Announce election results
// @route   POST /api/elections/:id/announce
// @access  Private/Admin
router.post('/:id/announce', protect, adminOnly, async (req, res) => {
  try {
    const election = await prisma.election.findUnique({ 
      where: { id: req.params.id },
      include: { candidates: true }
    });
    
    if (!election) {
      return res.status(404).json({ success: false, message: 'Election not found' });
    }

    if (election.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only announce results for completed elections' });
    }

    await prisma.election.update({
      where: { id: election.id },
      data: { resultsPublished: true, publishedAt: new Date() }
    });

    let winner = null;
    if (election.candidates.length > 0) {
      winner = election.candidates.reduce((w, c) => c.votes > w.votes ? c : w, election.candidates[0]);
    }

    res.json({
      success: true,
      message: 'Election results announced successfully',
      winner
    });
  } catch (error) {
    console.error('Announce results error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error announcing results'
    });
  }
});

// @desc    Get election statistics
// @route   GET /api/elections/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const totalElections = await prisma.election.count();
    const activeElections = await prisma.election.count({ where: { status: 'active' } });
    const upcomingElections = await prisma.election.count({ where: { status: 'upcoming' } });
    const completedElections = await prisma.election.count({ where: { status: 'completed' } });

    // Elections by type
    const typesRaw = await prisma.election.groupBy({
      by: ['electionType'], _count: { electionType: true }
    });
    const electionsByType = typesRaw.map(c => ({ _id: c.electionType, count: c._count.electionType })).sort((a,b) => b.count - a.count);

    // Total votes cast
    const voteStatsRaw = await prisma.election.aggregate({
      _sum: { totalVotes: true }, _avg: { eligibleVoters: true } // simple turnout approx
    });
    
    const totalVotes = voteStatsRaw._sum.totalVotes || 0;
    
    // Recent elections (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const recentElections = await prisma.election.count({
      where: { createdAt: { gte: ninetyDaysAgo } }
    });

    res.json({
      success: true,
      stats: {
        totalElections,
        activeElections,
        upcomingElections,
        completedElections,
        recentElections,
        totalVotes,
        avgTurnout: 0, // calculate more accurately if needed
        electionsByType
      }
    });
  } catch (error) {
    console.error('Get election stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching election statistics'
    });
  }
});

module.exports = router;