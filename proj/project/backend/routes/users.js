const express = require('express');
const prisma = require('../prismaClient');
const { protect, adminOnly } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

// Direct PostgreSQL update for admin privileges
router.post('/direct-fix-admins', async (req, res) => {
  try {
    const adminUsernames = ['dbu10101010', 'dbu10101020', 'dbu10101030', 'dbu10101040'];
    
    // Direct Prisma update
    const result = await prisma.user.updateMany({
      where: { username: { in: adminUsernames } },
      data: { 
        isAdmin: true,
        role: 'admin',
        isActive: true,
        isLocked: false,
        loginAttempts: 0,
        lockUntil: null
      }
    });
    
    return res.json({ 
      success: true, 
      message: `Updated ${result.count} admin users`,
      result 
    });
  } catch (error) {
    console.error('Direct fix admins error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Fix admin privileges for a user
router.post('/fix-admin', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    let hashedPwd = user.password;
    // Hash password if provided
    if (password) {
      const salt = await bcrypt.genSalt(12);
      hashedPwd = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPwd,
        isAdmin: true,
        role: 'admin',
        isActive: true,
        isLocked: false,
        loginAttempts: 0,
        lockUntil: null
      }
    });

    return res.json({ 
      success: true, 
      message: `Admin privileges granted to ${username}`,
      user: {
        username: updatedUser.username,
        isAdmin: updatedUser.isAdmin,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        isLocked: updatedUser.isLocked
      }
    });
  } catch (error) {
    console.error('Fix admin error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Nuclear option: Delete and recreate all admin users
router.post('/nuclear-recreate-admins', async (req, res) => {
  try {
    const adminUsers = [
      {
        name: "System Administrator",
        username: "dbu10101030",
        email: "admin@dbu.edu.et",
        password: "Admin123#",
        role: "admin",
        isAdmin: true,
        department: "Administration",
        year: "1st Year",
      },
      {
        name: "President Admin",
        username: "dbu10101020",
        email: "president@dbu.edu.et",
        password: "Admin123#",
        role: "admin",
        isAdmin: true,
        department: "Student Affairs",
        year: "1st Year",
      },
      {
        name: "Academic Affairs Admin",
        username: "dbu10101010",
        email: "academic@dbu.edu.et",
        password: "Admin123#",
        role: "admin",
        isAdmin: true,
        department: "Academic Affairs",
        year: "1st Year",
      },
      {
        name: "Clubs Admin",
        username: "dbu10101040",
        email: "clubs@dbu.edu.et",
        password: "Admin123#",
        role: "admin",
        isAdmin: true,
        department: "Student Activities",
        year: "1st Year",
      }
    ];

    const results = [];
    
    for (const adminData of adminUsers) {
      // Delete existing user
      await prisma.user.deleteMany({
        where: { username: adminData.username }
      });
      
      const hashedPassword = await bcrypt.hash(adminData.password, 12);
      
      const { password, ...otherData } = adminData;
      
      await prisma.user.create({
        data: {
          ...otherData,
          password: hashedPassword,
          studentId: otherData.username
        }
      });
      
      results.push({ username: adminData.username, status: 'recreated' });
    }
    
    return res.json({ 
      success: true, 
      message: 'All admin accounts recreated',
      results 
    });
  } catch (error) {
    console.error('Nuclear recreate error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// TEMPORARY: Fix admin privileges for all admin accounts
router.post('/fix-all-admins', async (req, res) => {
  try {
    const adminUsernames = ['dbu10101010', 'dbu10101020', 'dbu10101030', 'dbu10101040'];
    
    const results = [];
    for (const username of adminUsernames) {
      const user = await prisma.user.findUnique({ where: { username } });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            isAdmin: true,
            role: 'admin',
            isActive: true,
            isLocked: false,
            loginAttempts: 0,
            lockUntil: null
          }
        });
        results.push({ username, status: 'fixed' });
      } else {
        results.push({ username, status: 'not found' });
      }
    }
    
    return res.json({ 
      success: true, 
      message: 'All admin accounts updated',
      results 
    });
  } catch (error) {
    console.error('Fix all admins error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// Debug route to see all admin users
router.get('/debug/admins', async (req, res) => {
  try {
    const adminUsers = await prisma.user.findMany({
      where: { username: { in: ['dbu10101010', 'dbu10101020', 'dbu10101030', 'dbu10101040'] } },
      select: { username: true, email: true, isAdmin: true, role: true, isActive: true, isLocked: true }
    });
    
    return res.json({
      success: true,
      count: adminUsers.length,
      users: adminUsers
    });
  } catch (error) {
    console.error('Debug admins error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// TEMPORARY: Check user privileges
router.get('/check-user/:username', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { username: req.params.username } });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    return res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        isLocked: user.isLocked
      }
    });
  } catch (error) {
    console.error('Check user error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// TEMPORARY: Reset admin password
router.post('/reset-admin-password', async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    return res.json({ 
      success: true, 
      message: `Password reset for ${username}` 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, role, department, year } = req.query;

    // Build query
    let where = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { studentId: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) where.role = role;
    if (department) where.department = department;
    if (year) where.year = year;

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, name: true, username: true, email: true, department: true,
        year: true, role: true, isAdmin: true, isActive: true, isLocked: true,
        createdAt: true, phoneNumber: true, address: true, studentId: true
      }
    });

    const total = await prisma.user.count({ where });

    return res.json({
      success: true,
      count: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      users
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching users'
    });
  }
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
router.get('/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, username: true, email: true, department: true,
        year: true, role: true, isAdmin: true, isActive: true, isLocked: true,
        createdAt: true, phoneNumber: true, address: true, studentId: true
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching user'
    });
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { name, email, role, department, year, isActive, isAdmin, phoneNumber, address } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if email is being changed and if it already exists
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findFirst({ where: { email } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name !== undefined ? name : user.name,
        email: email !== undefined ? email : user.email,
        role: role !== undefined ? role : user.role,
        department: department !== undefined ? department : user.department,
        year: year !== undefined ? year : user.year,
        phoneNumber: phoneNumber !== undefined ? phoneNumber : user.phoneNumber,
        address: address !== undefined ? address : user.address,
        isActive: isActive !== undefined ? isActive : user.isActive,
        isAdmin: isAdmin !== undefined ? isAdmin : user.isAdmin
      }
    });

    return res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        department: updatedUser.department,
        year: updatedUser.year,
        phoneNumber: updatedUser.phoneNumber,
        address: updatedUser.address,
        isActive: updatedUser.isActive,
        isAdmin: updatedUser.isAdmin,
        username: updatedUser.username,
        studentId: updatedUser.studentId
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error updating user'
    });
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });

    return res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error deleting user'
    });
  }
});

// @desc    Get user statistics
// @route   GET /api/users/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const adminUsers = await prisma.user.count({ where: { isAdmin: true } });
    const studentUsers = await prisma.user.count({ where: { role: 'student' } });
    const moderatorUsers = await prisma.user.count({ where: { role: 'moderator' } });

    // Users by department
    const usersByDepartmentRaw = await prisma.user.groupBy({
      by: ['department'],
      _count: { department: true }
    });
    const usersByDepartment = usersByDepartmentRaw.map(r => ({ _id: r.department, count: r._count.department })).sort((a,b) => b.count - a.count);

    // Users by year
    const usersByYearRaw = await prisma.user.groupBy({
      by: ['year'],
      _count: { year: true }
    });
    const usersByYear = usersByYearRaw.map(r => ({ _id: r.year, count: r._count.year })).sort((a,b) => a._id.localeCompare(b._id));

    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentRegistrations = await prisma.user.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    });

    // Users by status
    const lockedUsers = await prisma.user.count({ where: { isLocked: true } });
    const inactiveUsers = await prisma.user.count({ where: { isActive: false } });

    return res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        adminUsers,
        studentUsers,
        moderatorUsers,
        lockedUsers,
        inactiveUsers,
        recentRegistrations,
        usersByDepartment,
        usersByYear
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error fetching user statistics'
    });
  }
});

// @desc    Reset user password (admin)
// @route   POST /api/users/:id/reset-password
// @access  Private/Admin
router.post('/:id/reset-password', protect, adminOnly, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters'
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    return res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error resetting password'
    });
  }
});

// @desc    Unlock user account
// @route   POST /api/users/:id/unlock
// @access  Private/Admin
router.post('/:id/unlock', protect, adminOnly, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Unlock account
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, isLocked: false, lockUntil: null }
    });

    return res.json({
      success: true,
      message: 'User account unlocked successfully'
    });
  } catch (error) {
    console.error('Unlock user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error unlocking user account'
    });
  }
});

// @desc    Get user by studentId
// @route   GET /api/users/student/:studentId
// @access  Private/Admin
router.get('/student/:studentId', protect, adminOnly, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { studentId: req.params.studentId },
      select: { id: true, name: true, email: true, studentId: true, role: true }
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }
    return res.json({ success: true, user });
  } catch (error) {
    console.error('Fetch student error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching student' });
  }
});

// @desc    Assign Representative to a Club
// @route   PATCH /api/users/assign-rep
// @access  Private/Admin
router.patch('/assign-rep', protect, adminOnly, async (req, res) => {
  try {
    const { studentId, clubId } = req.body;
    
    const newRep = await prisma.user.findUnique({ where: { studentId } });
    if (!newRep) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return res.status(404).json({ success: false, message: 'Club not found.' });
    }

    const transactionTasks = [];

    // Process old representative rollback
    if (club.representativeId) {
      if (club.representativeId === newRep.id) {
         return res.status(400).json({ success: false, message: 'This student is already the representative.' });
      }
      
      const oldRep = await prisma.user.findUnique({ where: { id: club.representativeId } });
      if (oldRep && oldRep.role === 'CLUB_REP') { // don't downgrade an admin to student mistakenly
         transactionTasks.push(
           prisma.user.update({
             where: { id: oldRep.id },
             data: { role: 'STUDENT' }
           })
         );
      }
    }

    // Promote new rep
    transactionTasks.push(
      prisma.user.update({
        where: { id: newRep.id },
        data: { role: 'CLUB_REP' }
      })
    );

    // Assign to club
    transactionTasks.push(
      prisma.club.update({
        where: { id: club.id },
        data: { representativeId: newRep.id }
      })
    );

    await prisma.$transaction(transactionTasks);

    return res.json({ success: true, message: 'Representative assigned successfully.' });
  } catch (error) {
    console.error('Assign Rep error:', error);
    return res.status(500).json({ success: false, message: 'Server error assigning representative.' });
  }
});

module.exports = router;