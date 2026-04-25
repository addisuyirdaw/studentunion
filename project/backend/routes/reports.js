const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ActivityReport = require('../models/ActivityReport');
const Club = require('../models/Club');
const reportController = require('../controllers/reportController');
const { protect, adminOnly, clubLeader } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads/reports');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// @desc    Force download of attached report files bypassing browser HTML render
// @route   GET /api/reports/download/:filename
// @access  Public
router.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../uploads/reports', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found.');
  }
});

// @desc    Submit new activity report (Club Rep or Member)
// @route   POST /api/reports
// @access  Private/Club Leader or Member
router.post('/', protect, upload.single('file'), reportController.submitReport);

// @desc    Submit new activity report via club-specific route
// @route   POST /api/reports/club/:clubId
// @access  Private/Club Leader or Member
router.post('/club/:clubId', protect, upload.single('file'), reportController.submitReport);


// @desc    Get pending reports from members (Club Rep)
// @route   GET /api/reports/club/:clubId/pending-manager
// @access  Private/Club Leader
router.get('/club/:clubId/pending-manager', protect, async (req, res) => {
  try {
    // Only leader can see
    const club = await Club.findById(req.params.clubId);
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    const isLeader = (club.leadership?.president?.toString() === req.user._id.toString()) || 
                     req.user.isAdmin || 
                     req.user.role === 'clubs_coordinator' || 
                     req.user.role === 'president';
    if (!isLeader) return res.status(403).json({ success: false, message: 'Not authorized' });

    const reports = await ActivityReport.find({ club: req.params.clubId, status: 'PENDING_MANAGER' })
      .populate('submittedBy', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    console.error('Get pending manager reports error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get reports for a specific club
// @route   GET /api/reports/club/:clubId
// @access  Private
// Allows Club Reps to see all reports, students to see only PUBLISHED
router.get('/club/:clubId', protect, reportController.getClubReports);


// @desc    Get all reports for super_admin
// @route   GET /api/reports/all
// @access  Private/Super Admin
router.get('/all', protect, reportController.getAllReports);

// @desc    Get all pending reports (Main Coordinator / Admin)
// @route   GET /api/reports/pending
// @access  Private/Coordinator
router.get('/pending', protect, async (req, res) => {
  try {
    // Only admins or clubs coordinators
    if (!req.user.isAdmin && req.user.role !== 'clubs_coordinator') {
      return res.status(403).json({ success: false, message: 'Not authorized to view reports' });
    }

    const reports = await ActivityReport.find({})
      .populate('club', 'name category image')
      .populate('submittedBy', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('Get pending reports error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving pending reports' });
  }
});

// @desc    Review and update report status (Main Coordinator / Admin / Club Manager)
// @route   PATCH /api/reports/:id/review
// @access  Private/Coordinator/ClubLeader
router.patch('/:id/review', protect, async (req, res) => {
  try {
    const report = await ActivityReport.findById(req.params.id).populate('club');
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const club = report.club;
    const isCoordinator = req.user.isAdmin || req.user.role === 'clubs_coordinator';
    const isLeader = club && (
      (club.leadership?.president?.toString() === req.user._id.toString()) ||
      (club.leadership?.vicePresident?.toString() === req.user._id.toString()) ||
      req.user.role === 'president'
    );

    if (!isCoordinator && !isLeader) {
      return res.status(403).json({ success: false, message: 'Not authorized to review this report' });
    }

    const { status, feedback } = req.body;

    if (!['PENDING_REVIEW', 'RETURNED', 'PUBLISHED', 'APPROVED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    report.status = status;
    if (feedback) report.feedback = feedback;
    await report.save();

    res.json({
      success: true,
      message: 'Report reviewed successfully',
      report
    });
  } catch (error) {
    console.error('Review report error:', error);
    res.status(500).json({ success: false, message: 'Server error reviewing report' });
  }
});

// @desc    Delete a report
// @route   DELETE /api/reports/:id
// @access  Private/Super Admin or Club Admin
router.delete('/:id', protect, reportController.deleteReport);

// @desc    Coordinator Inbox (All reports)
// @route   GET /api/reports/inbox
// @access  Private/Coordinator
router.get('/inbox', protect, async (req, res) => {
  try {
    if (!req.user.isAdmin && req.user.role !== 'clubs_coordinator') {
      return res.status(403).json({ success: false, message: 'Not authorized for inbox' });
    }
    const reports = await ActivityReport.find()
      .populate('club', 'name')
      .populate('submittedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    console.error('Reports inbox error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving reports inbox' });
  }
});

module.exports = router;
