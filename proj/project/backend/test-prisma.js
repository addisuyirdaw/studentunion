require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function test() {
  await prisma.$connect();
  const res = await prisma.user.count();
  console.log("Count:", res);
  await prisma.$disconnect();
}
test().catch(e => console.error(e));
