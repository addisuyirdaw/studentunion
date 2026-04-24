/** @format */

const prisma = require("../prismaClient");
const bcrypt = require("bcryptjs");

const createDefaultAdmin = async () => {
  try {
    // Create additional admin users with different roles
    const additionalAdmins = [
      {
        name: "System Administrator",
        username: "dbu10101030",
        email: "admin@dbu.edu.et",
        password: "Admin123#",
        role: "COORDINATOR",
        isAdmin: true,
        department: "Administration",
        year: "1st Year",
      },
      {
        name: "President Admin",
        username: "dbu10101020",
        email: "president@dbu.edu.et",
        password: "Admin123#",
        role: "COORDINATOR",
        isAdmin: true,
        department: "Student Affairs",
        year: "1st Year",
      },
      {
        name: "Demo Admin",
        username: "dbu10101011",
        email: "demoadmin@dbu.edu.et",
        password: "Admin123#",
        role: "COORDINATOR",
        isAdmin: true,
        department: "Administration",
        year: "1st Year",
      },
      {
        name: "Clubs Admin",
        username: "dbu10101040",
        email: "clubs@dbu.edu.et",
        password: "Admin123#",
        role: "COORDINATOR",
        isAdmin: true,
        department: "Student Activities",
        year: "1st Year",
      },
    ];

    for (const adminData of additionalAdmins) {
      const existingAdmin = await prisma.user.findUnique({
        where: { username: adminData.username },
      });

      if (!existingAdmin) {
        // Hash password before creating
        const hashedPassword = await bcrypt.hash(adminData.password, 12);
        
        const admin = await prisma.user.create({
          data: {
            ...adminData,
            password: hashedPassword
          }
        });
        console.log(`✅ Admin created: ${adminData.username}`);
      } else {
        console.log(`ℹ️ Admin already exists: ${adminData.username}`);
        
        // Hash password if we're updating it
        const hashedPassword = await bcrypt.hash(adminData.password, 12);
        
        // UPDATE EXISTING ADMIN to ensure proper privileges
        await prisma.user.update({
          where: { username: adminData.username },
          data: { 
            isAdmin: true,
            role: 'COORDINATOR',
            isActive: true,
            isLocked: false,
            loginAttempts: 0,
            lockUntil: null,
            password: hashedPassword, // Update password
            name: adminData.name, // Ensure name is correct
            email: adminData.email, // Ensure email is correct
            department: adminData.department,
            year: adminData.year
          }
        });
        console.log(`✅ Admin privileges updated for: ${adminData.username}`);
      }
    }

    // Create sample students for testing
    const sampleStudents = [
      {
        name: "John Doe",
        username: "dbu10304058",
        email: "john.doe@dbu.edu.et",
        password: "Student123#",
        role: "STUDENT",
        isAdmin: false,
        department: "Computer Science",
        year: "4th Year",
      },
      {
        name: "Jane Smith",
        username: "dbu10304059",
        email: "jane.smith@dbu.edu.et",
        password: "Student123#",
        role: "STUDENT",
        isAdmin: false,
        department: "Engineering",
        year: "3rd Year",
      },
    ];

    for (const studentData of sampleStudents) {
      const existingStudent = await prisma.user.findUnique({
        where: { username: studentData.username },
      });

      if (!existingStudent) {
        // Hash password before creating
        const hashedPassword = await bcrypt.hash(studentData.password, 12);
        
        const student = await prisma.user.create({
          data: {
            ...studentData,
            password: hashedPassword
          }
        });
        console.log(`✅ Sample student created: ${studentData.username}`);
      } else {
        console.log(`ℹ️ Student already exists: ${studentData.username}`);
        
        // Update existing student to ensure proper setup
        const hashedPassword = await bcrypt.hash(studentData.password, 12);
        await prisma.user.update({
          where: { username: studentData.username },
          data: { 
            password: hashedPassword,
            isActive: true,
            isLocked: false,
            loginAttempts: 0,
            lockUntil: null,
            role: 'STUDENT',
            isAdmin: false
          }
        });
        console.log(`✅ Student credentials updated for: ${studentData.username}`);
      }
    }
  } catch (error) {
    console.error("❌ Error creating default users:", error.message);
  }
};

module.exports = { createDefaultAdmin };