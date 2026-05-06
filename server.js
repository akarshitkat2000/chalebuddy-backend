"use strict";
require("dotenv").config();

const express       = require("express");
const cors          = require("cors");
const helmet        = require("helmet");
const compression   = require("compression");
const morgan        = require("morgan");
const mongoSanitize = require("express-mongo-sanitize");
const path          = require("path");

const connectDB    = require("./config/db");
const logger       = require("./utils/logger");
const AppError     = require("./utils/AppError");
const errorHandler = require("./middleware/errorHandler");

// ── Routes ────────────────────────────────────────────────────
const authRoutes             = require("./routes/authRoutes");
const guideRoutes            = require("./routes/guideRoutes");
const stayRoutes             = require("./routes/stayRoutes");
const transportRoutes        = require("./routes/transportRoutes");
const bookingRoutes          = require("./routes/bookingRoutes");
const paymentRoutes          = require("./routes/paymentRoutes");   // ← payment
const contactRoutes          = require("./routes/contactRoutes");
const tripRoutes             = require("./routes/tripRoutes");
const guideApplicationRoutes = require("./routes/guideApplicationRoutes");
const adminRoutes            = require("./routes/adminRoutes");

connectDB();
const app = express();

// ── Security ──────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
  ],
  credentials: true,
  methods: ["GET","POST","PATCH","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Source","x-razorpay-signature"],
}));
app.use(mongoSanitize());
app.use(compression());

// ── CRITICAL: Payment routes BEFORE express.json() ───────────
// Webhook needs raw body buffer for HMAC verification.
// paymentRoutes.js uses express.raw() on /webhook internally.
app.use("/api/payments", paymentRoutes);

// ── Body parsing (all other routes) ──────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── Static uploads ────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(__dirname, "uploads");
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, { fallthrough: true }),
  (_req, res) => res.status(404).send("Image not found")
);

// ── HTTP logging ──────────────────────────────────────────────
if (process.env.NODE_ENV === "development") app.use(morgan("dev"));

// ── Hand-rolled rate limiter ──────────────────────────────────
const hits = {};
const rl = (max, windowMs) => (req, res, next) => {
  const key = req.ip + req.path;
  const now = Date.now();
  hits[key] = (hits[key] || []).filter(t => now - t < windowMs);
  if (hits[key].length >= max)
    return res.status(429).json({ status:"error", message:"Too many requests. Please slow down." });
  hits[key].push(now);
  next();
};
setInterval(() => {
  const now = Date.now();
  Object.keys(hits).forEach(k => {
    hits[k] = (hits[k]||[]).filter(t => now-t < 900000);
    if (!hits[k].length) delete hits[k];
  });
}, 300000);

app.use("/api/",           rl(300, 15 * 60 * 1000));
app.use("/api/auth/login", rl(20,  15 * 60 * 1000));
app.use("/api/payments/",  rl(60,  15 * 60 * 1000));

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  const mongoose = require("mongoose");
  res.json({
    status:      "ok",
    app:         "ChaleBuddy API",
    version:     "2.0.0",
    environment: process.env.NODE_ENV,
    database:    mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    payment:     process.env.RAZORPAY_KEY_ID ? "razorpay_configured" : "not_configured",
    sms:         process.env.SMS_ENABLED === "true" ? "enabled" : "disabled",
    whatsapp:    process.env.WHATSAPP_ENABLED === "true" ? "enabled" : "disabled",
    uptime:      `${Math.floor(process.uptime())}s`,
  });
});

// ── API Routes ────────────────────────────────────────────────
app.use("/api/auth",               authRoutes);
app.use("/api/guides",             guideRoutes);
app.use("/api/stays",              stayRoutes);
app.use("/api/transport",          transportRoutes);
app.use("/api/bookings",           bookingRoutes);
// /api/payments already mounted above (before express.json)
app.use("/api/contact",            contactRoutes);
app.use("/api/trips",              tripRoutes);
app.use("/api/guide-applications", guideApplicationRoutes);
app.use("/api/admin",              adminRoutes);

// ── 404 ───────────────────────────────────────────────────────
app.all("*", (req, res, next) =>
  next(new AppError(`${req.method} ${req.originalUrl} not found.`, 404))
);

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 ChaleBuddy API on port ${PORT} [${process.env.NODE_ENV}]`);
  logger.info(`💳 Payment: ${process.env.RAZORPAY_KEY_ID ? "Razorpay ✅" : "NOT configured ⚠️"}`);
});

process.on("unhandledRejection", err => {
  logger.error(`UNHANDLED REJECTION: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
