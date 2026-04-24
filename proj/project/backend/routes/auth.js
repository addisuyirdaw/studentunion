/** @format */

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const prisma = require("../prismaClient");
const { protect } = require("../middleware/auth");
const {
	validateUserRegistration,
	validateUserLogin,
} = require("../middleware/validation");

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
	return jwt.sign({ id }, process.env.JWT_SECRET, {
		expiresIn: process.env.JWT_EXPIRE || "7d",
	});
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
router.post("/register", validateUserRegistration, async (req, res) => {
	try {
		const { name, username, password, department, year, phoneNumber, email } =
			req.body;

		console.log('Registration attempt:', { username, email });

		// Check if user exists
		const userExists = await prisma.user.findFirst({
			where: {
				OR: [
					{ username: username },
					...(email ? [{ email: email }] : [])
				]
			}
		});

		if (userExists) {
			return res.status(400).json({
				success: false,
				message: "User already exists with this username or email",
			});
		}

		// Hash the password manually before creating in Prisma
		const salt = await bcrypt.genSalt(12);
		const hashedPassword = await bcrypt.hash(password, salt);

		// Create user
		const user = await prisma.user.create({
			data: {
				name,
				username,
				password: hashedPassword,
				department,
				year,
				phoneNumber,
				email: email || null,
				studentId: username,
			}
		});

		// Generate token
		const token = generateToken(user.id);

		console.log('Registration successful:', username);
		return res.status(201).json({
			success: true,
			message: "User registered successfully",
			token,
			user: {
				id: user.id,
				name: user.name,
				username: user.username,
				email: user.email,
				department: user.department,
				year: user.year,
				role: user.role,
				isAdmin: user.isAdmin,
				profileImage: user.profileImage,
			},
		});
	} catch (error) {
		console.error("Registration error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error during registration",
		});
	}
});

// @desc    Login user (Student)
// @route   POST /api/auth/login
// @access  Public
router.post("/login", validateUserLogin, async (req, res) => {
	try {
		const { username, password } = req.body;

		console.log('Login attempt:', username);

		const user = await prisma.user.findUnique({ where: { username } });
		if (!user) {
			console.log('User not found:', username);
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		console.log('User found:', user.username, 'Active:', user.isActive, 'Locked:', user.isLocked);

		// Portal Separation
		if (user.isAdmin || user.role === 'admin' || user.role === 'COORDINATOR') {
			return res.status(403).json({
				success: false,
				message: "Access Denied: Please use the Admin tab to log in with this account.",
			});
		}

		// Check if account is locked
		if (user.isLocked && user.lockUntil && user.lockUntil > new Date()) {
			console.log('Account locked:', username);
			return res.status(423).json({
				success: false,
				message: "Account temporarily locked due to too many failed login attempts",
			});
		}

		// Reset lock if expired
		if (user.isLocked && user.lockUntil && user.lockUntil <= new Date()) {
			await prisma.user.update({
				where: { id: user.id },
				data: { loginAttempts: 0, isLocked: false, lockUntil: null }
			});
			user.isLocked = false;
			user.loginAttempts = 0;
			console.log('Lock reset for:', username);
		}

		// Check if user is active
		if (!user.isActive) {
			console.log('Account inactive:', username);
			return res.status(401).json({
				success: false,
				message: "Account has been deactivated",
			});
		}

		// Check password
		const isMatch = await bcrypt.compare(password, user.password);
		console.log('Password match result:', isMatch);

		if (!isMatch) {
			console.log('Password mismatch for:', username);
			
			// Increment login attempts
			const attempts = (user.loginAttempts || 0) + 1;
			const isLocked = attempts >= 5;
			const lockUntil = isLocked ? new Date(Date.now() + 30 * 60 * 1000) : null;
			
			await prisma.user.update({
				where: { id: user.id },
				data: { loginAttempts: attempts, isLocked, lockUntil }
			});
			
			return res.status(401).json({
				success: false,
				message: "Invalid credentials",
			});
		}

		// Reset login attempts on successful login
		const updatedUser = await prisma.user.update({
			where: { id: user.id },
			data: { loginAttempts: 0, isLocked: false, lockUntil: null, lastLogin: new Date() }
		});

		// Generate token
		const token = generateToken(updatedUser.id);

		console.log('Login successful:', username);
		return res.json({
			success: true,
			message: "Login successful",
			token,
			user: {
				id: updatedUser.id,
				name: updatedUser.name,
				username: updatedUser.username,
				email: updatedUser.email,
				department: updatedUser.department,
				year: updatedUser.year,
				role: updatedUser.role || 'student',
				isAdmin: updatedUser.isAdmin,
				profileImage: updatedUser.profileImage,
			},
		});
	} catch (error) {
		console.error("Login error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error during login",
		});
	}
});

// @desc    Admin Login
// @route   POST /api/auth/admin-login
// @access  Public
router.post("/admin-login", async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('Admin login attempt:', username);

    const admin = await prisma.user.findUnique({ where: { username } });
    if (!admin) {
      return res.status(401).json({ 
        success: false,
        message: "Admin account not found. Please contact system administrator." 
      });
    }

    // Check if user is actually an admin or coordinator
    if (!admin.isAdmin && admin.role !== 'admin' && admin.role !== 'COORDINATOR') {
      console.log('Admin privilege check failed:', {
        username: admin.username,
        isAdmin: admin.isAdmin,
        role: admin.role
      });
      return res.status(403).json({ 
        success: false,
        message: "Access denied. Please use the Student login portal." 
      });
    }

    // Check if account is active
    if (!admin.isActive) {
      return res.status(403).json({ 
        success: false,
        message: "Account has been deactivated" 
      });
    }

    // Check if account is locked
    if (admin.isLocked && admin.lockUntil && admin.lockUntil > new Date()) {
      return res.status(423).json({ 
        success: false,
        message: "Account temporarily locked due to too many failed login attempts" 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, admin.password);
    console.log('Admin password match:', isMatch);
    
    if (!isMatch) {
      const attempts = (admin.loginAttempts || 0) + 1;
      const isLocked = attempts >= 5;
      const lockUntil = isLocked ? new Date(Date.now() + 30 * 60 * 1000) : null;
      
      await prisma.user.update({
        where: { id: admin.id },
        data: { loginAttempts: attempts, isLocked, lockUntil }
      });

      return res.status(401).json({ 
        success: false,
        message: "Invalid credentials. Please check your username and password." 
      });
    }

    // Reset login attempts on successful login
    const updatedAdmin = await prisma.user.update({
      where: { id: admin.id },
      data: { loginAttempts: 0, isLocked: false, lockUntil: null, lastLogin: new Date() }
    });

    // Generate token with admin role
    const token = jwt.sign(
      { 
        id: updatedAdmin.id, 
        role: 'admin',
        isAdmin: true 
      }, 
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    console.log('Admin login successful:', username);
    
    return res.status(200).json({ 
      success: true,
      message: "Admin login successful",
      token,
      user: {
        id: updatedAdmin.id,
        name: updatedAdmin.name,
        username: updatedAdmin.username,
        email: updatedAdmin.email,
        role: updatedAdmin.role,
        isAdmin: updatedAdmin.isAdmin,
        profileImage: updatedAdmin.profileImage
      }
    });

  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error" 
    });
  }
});

// @desc    Get current user profile
// @route   GET /api/auth/profile
// @access  Private
router.get("/profile", protect, async (req, res) => {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.user.id }
		});

		if (!user) {
			return res.status(404).json({ success: false, message: "User not found" });
		}
		
		const { password, ...userWithoutPassword } = user;

		return res.json({
			success: true,
			user: userWithoutPassword,
		});
	} catch (error) {
		console.error("Profile fetch error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error fetching profile",
		});
	}
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put("/profile", protect, async (req, res) => {
	try {
		const { name, department, year, phoneNumber, address, email } = req.body;

		const user = await prisma.user.findUnique({ where: { id: req.user.id } });
		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		const updatedUser = await prisma.user.update({
			where: { id: user.id },
			data: {
				name: name || undefined,
				department: department || undefined,
				year: year || undefined,
				phoneNumber: phoneNumber || undefined,
				address: address || undefined,
				email: email || undefined,
			}
		});

		return res.json({
			success: true,
			message: "Profile updated successfully",
			user: {
				id: updatedUser.id,
				name: updatedUser.name,
				email: updatedUser.email,
				username: updatedUser.username,
				department: updatedUser.department,
				year: updatedUser.year,
				phoneNumber: updatedUser.phoneNumber,
				address: updatedUser.address,
				role: updatedUser.role,
				isAdmin: updatedUser.isAdmin,
				profileImage: updatedUser.profileImage,
			},
		});
	} catch (error) {
		console.error("Profile update error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error updating profile",
		});
	}
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put("/change-password", protect, async (req, res) => {
	try {
		const { currentPassword, newPassword } = req.body;

		if (!currentPassword || !newPassword) {
			return res.status(400).json({
				success: false,
				message: "Please provide current and new password",
			});
		}

		if (newPassword.length < 8) {
			return res.status(400).json({
				success: false,
				message: "New password must be at least 8 characters",
			});
		}

		const user = await prisma.user.findUnique({ where: { id: req.user.id } });

		// Check current password
		const isMatch = await bcrypt.compare(currentPassword, user.password);
		if (!isMatch) {
			return res.status(400).json({
				success: false,
				message: "Current password is incorrect",
			});
		}

		// Update password
		const salt = await bcrypt.genSalt(12);
		const hashedPassword = await bcrypt.hash(newPassword, salt);
		
		await prisma.user.update({
			where: { id: user.id },
			data: { password: hashedPassword }
		});

		return res.json({
			success: true,
			message: "Password changed successfully",
		});
	} catch (error) {
		console.error("Password change error:", error);
		return res.status(500).json({
			success: false,
			message: "Server error changing password",
		});
	}
});

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
router.post("/logout", protect, (req, res) => {
	return res.json({
		success: true,
		message: "Logged out successfully",
	});
});

module.exports = router;