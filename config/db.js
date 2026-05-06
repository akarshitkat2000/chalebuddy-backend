const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info(`✅ MongoDB Connected: ${conn.connection.host} [DB: ${conn.connection.name}]`);
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}`);
    setTimeout(connectDB, 5000);
  }
};

mongoose.connection.on("disconnected", () =>
  logger.warn("⚠️  MongoDB disconnected — retrying...")
);

module.exports = connectDB;
