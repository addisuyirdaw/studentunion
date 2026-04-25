/** @format */

const User = require("../models/User");
const bcrypt = require("bcryptjs");

const Club = require('../models/Club');

const createDefaultAdmin = async () => {
  try {
    const adminUsers = [
      {
        name: "System Coordinator",
        username: "dbu10101030",
        email: "coordinator@dbu.edu.et",
        password: "admin123",
        role: "super_admin",
        isAdmin: true,
        department: "Administration",
        year: "1st Year",
      },
      {
        name: "Club Representative",
        username: "dbu10101020",
        email: "clubrep@dbu.edu.et",
        password: "admin123",
        role: "club_admin",
        isAdmin: true,
        department: "Student Activities",
        year: "1st Year",
      }
    ];

    let clubRepUser = null;

    for (const userData of adminUsers) {
      const existingUser = await User.findOne({ username: userData.username });
      const hashedPassword = await bcrypt.hash(userData.password, 12);

      if (!existingUser) {
        const user = await User.create({
          ...userData,
          password: hashedPassword
        });
        console.log(`✅ Admin created: ${userData.username}`);
        if (userData.username === 'dbu10101020') {
          clubRepUser = user;
        }
      } else {
        await User.findOneAndUpdate(
          { username: userData.username },
          {
            name: userData.name,
            email: userData.email,
            password: hashedPassword,
            role: userData.role,
            isAdmin: true,
            isActive: true,
            isLocked: false,
            loginAttempts: 0,
            lockUntil: undefined,
            department: userData.department,
            year: userData.year
          },
          { new: true }
        );
        console.log(`✅ Admin updated: ${userData.username}`);

        if (userData.username === 'dbu10101020') {
          clubRepUser = await User.findOne({ username: 'dbu10101020' });
        }
      }
    }

    if (clubRepUser) {
      const clubs = await Club.find().sort({ _id: 1 }).limit(3);
      for (const club of clubs) {
        club.managedBy = clubRepUser._id;
        await club.save();
        console.log(`✅ Assigned club ${club.name} to club_admin ${clubRepUser.username}`);
      }
    }

    // Create sample students for testing
    const sampleStudents = [
      {
        name: "John Doe",
        username: "dbu10304058",
        email: "john.doe@dbu.edu.et",
        password: "Student123#",
        role: "student",
        isAdmin: false,
        department: "Computer Science",
        year: "4th Year",
      },
      {
        name: "Jane Smith",
        username: "dbu10304059",
        email: "jane.smith@dbu.edu.et",
        password: "Student123#",
        role: "student",
        isAdmin: false,
        department: "Engineering",
        year: "3rd Year",
      },
    ];

    for (const studentData of sampleStudents) {
      const existingStudent = await User.findOne({
        username: studentData.username,
      });

      if (!existingStudent) {
        const student = await User.create({
          ...studentData,
          password: studentData.password
        });
        console.log(`✅ Sample student created: ${studentData.username}`);
      } else {
        console.log(`ℹ️ Student already exists: ${studentData.username}`);
        
        // Update existing student to ensure proper setup
        const hashedPassword = await bcrypt.hash(studentData.password, 12);
        await User.findOneAndUpdate(
          { username: studentData.username },
          { 
            password: hashedPassword,
            isActive: true,
            isLocked: false,
            loginAttempts: 0,
            lockUntil: undefined,
            role: 'student',
            isAdmin: false
          }
        );
        console.log(`✅ Student credentials updated for: ${studentData.username}`);
      }
    }
  } catch (error) {
    console.error("❌ Error creating default users:", error.message);
  }
};

module.exports = { createDefaultAdmin };