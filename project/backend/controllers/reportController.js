const fs = require('fs');
const path = require('path');
const ActivityReport = require('../models/ActivityReport');
const Club = require('../models/Club');

const allowedFrequencies = ['weekly', 'monthly', 'annually'];

const isSuperAdmin = (user) => user?.role === 'super_admin';
const isClubAdmin = (user) => user?.role === 'club_admin';

const parseJsonField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [value];
    }
  }
  return [];
};

const submitReport = async (req, res) => {
  try {
    const clubId = req.params.clubId || req.body.clubId;
    if (!clubId) {
      return res.status(400).json({ success: false, message: 'clubId is required' });
    }

    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ success: false, message: 'Club not found' });
    }

    const isLeader =
      (club.leadership?.president?.toString() === req.user._id.toString()) ||
      (club.leadership?.vicePresident?.toString() === req.user._id.toString()) ||
      req.user.role === 'president' ||
      req.user.role === 'clubs_coordinator' ||
      req.user.isAdmin;

    const isClubRepresentative =
      isClubAdmin(req.user) &&
      club.managedBy?.toString() === req.user._id.toString();

    const isMember = club.members?.some(
      (member) => member.user?.toString() === req.user._id.toString() && member.status === 'approved'
    );

    if (!isLeader && !isClubRepresentative && !isMember) {
      return res.status(403).json({ success: false, message: 'You must be a member or club representative of this club to submit a report' });
    }

    const { title, description, date, photos, documentUrl, reportType, frequency } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Report title is required' });
    }

    if (!description) {
      return res.status(400).json({ success: false, message: 'Report description is required' });
    }

    if (!frequency || !allowedFrequencies.includes(frequency)) {
      return res.status(400).json({
        success: false,
        message: `Frequency is required and must be one of: ${allowedFrequencies.join(', ')}`
      });
    }

    const fileUrl = req.file ? `/uploads/reports/${req.file.filename}` : undefined;

    const report = await ActivityReport.create({
      club: clubId,
      title,
      description,
      date: date ? new Date(date) : new Date(),
      photos: parseJsonField(photos),
      documentUrl,
      fileUrl,
      frequency,
      reportType: reportType || 'ACTIVITY',
      status: isLeader || isClubRepresentative ? 'PENDING_REVIEW' : 'PENDING_MANAGER',
      submittedBy: req.user._id
    });

    res.status(201).json({ success: true, message: 'Report submitted successfully', report });
  } catch (error) {
    console.error('Submit report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error submitting report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const getClubReports = async (req, res) => {
  try {
    const club = await Club.findById(req.params.clubId);
    if (!club) {
      return res.status(404).json({ success: false, message: 'Club not found' });
    }

    const isLeader =
      (club.leadership?.president?.toString() === req.user._id.toString()) ||
      (club.leadership?.vicePresident?.toString() === req.user._id.toString()) ||
      req.user.role === 'president' ||
      req.user.role === 'clubs_coordinator' ||
      req.user.isAdmin;

    const isClubRepresentative =
      isClubAdmin(req.user) &&
      club.managedBy?.toString() === req.user._id.toString();

    if (!isLeader && !isClubRepresentative && !req.user.isAdmin) {
      const isMember = club.members?.some(
        (member) => member.user?.toString() === req.user._id.toString() && member.status === 'approved'
      );
      if (!isMember) {
        return res.status(403).json({ success: false, message: 'Not authorized to view reports for this club' });
      }
    }

    const query = { club: req.params.clubId };
    if (!isLeader && !isClubRepresentative && !req.user.isAdmin) {
      query.status = 'PUBLISHED';
    }

    const reports = await ActivityReport.find(query)
      .populate('submittedBy', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    console.error('Get club reports error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving reports' });
  }
};

const getAllReports = async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Only super_admin can view all reports' });
    }

    const query = {};
    const { frequency, clubId } = req.query;

    if (frequency) {
      if (!allowedFrequencies.includes(frequency)) {
        return res.status(400).json({ success: false, message: `Frequency must be one of: ${allowedFrequencies.join(', ')}` });
      }
      query.frequency = frequency;
    }

    if (clubId) {
      query.club = clubId;
    }

    const reports = await ActivityReport.find(query)
      .populate('club', 'name category managedBy')
      .populate('submittedBy', 'name email profileImage')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: reports.length, reports });
  } catch (error) {
    console.error('Get all reports error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving reports' });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await ActivityReport.findById(req.params.id).populate('club');
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const isAuthorized =
      isSuperAdmin(req.user) ||
      (isClubAdmin(req.user) && report.club?.managedBy?.toString() === req.user._id.toString());

    if (!isAuthorized) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this report' });
    }

    if (report.fileUrl) {
      const fileName = path.basename(report.fileUrl);
      const filePath = path.join(__dirname, '../uploads/reports', fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await report.deleteOne();

    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting report' });
  }
};

module.exports = {
  submitReport,
  getClubReports,
  getAllReports,
  deleteReport
};
