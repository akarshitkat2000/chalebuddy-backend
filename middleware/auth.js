const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const AppError = require("../utils/AppError");

/* ── Verify JWT and attach req.user ─────────────────────────── */
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) return next(new AppError("You are not logged in. Please log in to access this.", 401));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("+active");

    if (!user)        return next(new AppError("The user belonging to this token no longer exists.", 401));
    if (!user.active) return next(new AppError("Your account has been deactivated.", 401));

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError")  return next(new AppError("Invalid token. Please log in again.", 401));
    if (err.name === "TokenExpiredError")  return next(new AppError("Your token has expired. Please log in again.", 401));
    next(err);
  }
};

/**
 * optionalAuth
 * Like protect, but does NOT reject unauthenticated requests.
 * Used for routes that work for both guests and logged-in users
 * (e.g. POST /api/bookings, POST /api/payments/create-order).
 * Sets req.user if token is valid, otherwise leaves it undefined.
 */
exports.optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.jwt && req.cookies.jwt !== "loggedout") {
      token = req.cookies.jwt;
    }

    if (!token) return next(); // no token → guest → continue

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("+active");

    if (user && user.active) req.user = user;
    next();
  } catch (_) {
    // Invalid/expired token → treat as guest, don't block
    next();
  }
};

/* ── Role-based access control ──────────────────────────────── */
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError("You do not have permission to perform this action.", 403));
  }
  next();
};
