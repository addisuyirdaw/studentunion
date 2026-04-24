require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const bcrypt = require('bcryptjs');

const seedClubs = async () => {
  try {
    console.log("Seeding database...");
    
    // 1. Ensure coordinator exists and has COORDINATOR role
    const coordinatorUsername = "dbu10101030";
    let coordinator = await prisma.user.findUnique({
      where: { username: coordinatorUsername }
    });

    if (!coordinator) {
      console.log("Coordinator not found, creating one...");
      const hashedPassword = await bcrypt.hash("Admin123#", 12);
      coordinator = await prisma.user.create({
        data: {
          name: "System Coordinator",
          username: coordinatorUsername,
          email: "coordinator@dbu.edu.et",
          password: hashedPassword,
          role: "COORDINATOR",
          isAdmin: true,
          department: "Administration",
          year: "1st Year",
        }
      });
    } else {
      console.log("Found existing coordinator, updating role...");
      coordinator = await prisma.user.update({
        where: { id: coordinator.id },
        data: {
          role: "COORDINATOR",
          isAdmin: true
        }
      });
    }

    console.log(`Coordinator ID: ${coordinator.id}`);

    // 2. The 11 Clubs
    const clubs = [
      { name: "Techtonik Club", category: "Technology", description: "A hub for tech enthusiasts." },
      { name: "Booking Club", category: "Reading", description: "For book lovers." },
      { name: "Civil Engineering Club", category: "Academic", description: "Civil Engineering student hub." },
      { name: "Career Development Club", category: "Professional", description: "Helping students with careers." },
      { name: "Bego Adragot Club", category: "Service", description: "Community service and outreach." },
      { name: "Idea Hub Club", category: "Innovation", description: "Where ideas come to life." },
      { name: "Law Association Club", category: "Academic", description: "Association of law students." },
      { name: "Truth Culture Club", category: "Cultural", description: "Exploring truth and culture." },
      { name: "Hohie Tesfa Club", category: "Social", description: "A club bringing hope." },
      { name: "Mechanical Engineering Club", category: "Academic", description: "Mechanical Engineering student hub." },
      { name: "Food Engineering Club", category: "Academic", description: "Food Engineering student hub." }
    ];

    for (const c of clubs) {
      const existing = await prisma.club.findUnique({ where: { name: c.name } });
      if (!existing) {
        await prisma.club.create({
          data: {
            name: c.name,
            category: c.category,
            description: c.description,
            founded: new Date().getFullYear().toString(),
            status: "approved",
            // Since representativeId expects a CLUB_REP role, we'll assign the coordinator for now 
            // but the coordinator is a COORDINATOR. If the schema allows any user, this is fine.
            representativeId: coordinator.id,
            planStatus: "PENDING"
          }
        });
        console.log(`Created club: ${c.name}`);
      } else {
        await prisma.club.update({
          where: { id: existing.id },
          data: {
            representativeId: coordinator.id
          }
        });
        console.log(`Updated club representative for: ${c.name}`);
      }
    }

    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
};

seedClubs();
