/** @format */
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { MongoMemoryServer } = require("mongodb-memory-server");
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/student_union_db";
const JWT_SECRET = process.env.JWT_SECRET || "dbu_student_union_jwt_secret_2024_very_secure_key";
const PORT = process.env.PORT || 5000;

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const complaintRoutes = require("./routes/complaints");
const clubRoutes = require("./routes/clubs");
const electionRoutes = require("./routes/elections");
const postRoutes = require("./routes/posts");
const contactRoutes = require("./routes/contact");
const reportRoutes = require("./routes/reports");
const messageRoutes = require("./routes/messages");

const errorHandler = require("./middleware/errorHandler");
const { createDefaultAdmin } = require("./utils/createAdmin");

const app = express();

// Fix for Codespace Proxy
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: true, credentials: true })); // Simplified for demo success

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // High limit for demo
  message: "Too many requests",
});
app.use("/api/", limiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/clubs", clubRoutes);
app.use("/api/elections", electionRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/messages", messageRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected" });
});

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 120000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 10000,
      heartbeatFrequencyMS: 30000,
      retryWrites: true,
      w: 'majority'
    });
    console.log(`🚀 MongoDB Connected: ${conn.connection.host}`);
    await createDefaultAdmin();
  } catch (error) {
    console.error(`❌ Connection failed: ${error.message}`);
    if (process.env.NODE_ENV !== 'production') {
      console.warn("⚠️ Falling back to in-memory MongoDB for development.");
      const memoryServer = await MongoMemoryServer.create();
      const memUri = memoryServer.getUri();
      const conn = await mongoose.connect(memUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log(`✅ In-memory MongoDB started: ${conn.connection.host}`);
      await createDefaultAdmin();
      return;
    }
    process.exit(1);
  }
};

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ SERVER LIVE ON PORT ${PORT}`);
    console.log(`🔑 JWT SECRET IS SET`);
  });
});

app.use(errorHandler);
module.exports = app;