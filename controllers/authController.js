const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const AppError = require("../utils/AppError");
const logger   = require("../utils/logger");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOpts = {
    expires: new Date(Date.now() + parseInt(process.env.JWT_COOKIE_EXPIRES_IN, 10) * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };
  res.cookie("jwt", token, cookieOpts);
  user.password = undefined;
  res.status(statusCode).json({ status: "success", token, data: { user } });
};

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const safeRole = ["user","guide"].includes(role) ? role : "user";  // block admin self-assign
    const user = await User.create({ name, email, password, role: safeRole });
    logger.info(`New user registered: ${email}`);
    sendToken(user, 201, res);
  } catch (err) { next(err); }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return next(new AppError("Please provide email and password.", 400));

    const user = await User.findOne({ email }).select("+password +active");
    if (!user || !user.active) return next(new AppError("Invalid email or password.", 401));
    if (!(await user.correctPassword(password, user.password))) {
      return next(new AppError("Invalid email or password.", 401));
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    logger.info(`User logged in: ${email}`);
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.cookie("jwt", "loggedout", { expires: new Date(Date.now() + 1000), httpOnly: true });
  res.status(200).json({ status: "success", message: "Logged out successfully." });
};

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({ status: "success", data: { user } });
  } catch (err) { next(err); }
};

// PATCH /api/auth/update-password
exports.updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");
    if (!(await user.correctPassword(currentPassword, user.password))) {
      return next(new AppError("Current password is incorrect.", 401));
    }
    user.password = newPassword;
    await user.save();
    sendToken(user, 200, res);
  } catch (err) { next(err); }
};

// PATCH /api/auth/update-profile
exports.updateProfile = async (req, res, next) => {
  try {
    const allowed = ["name","phone","city","bio","avatar"];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.status(200).json({ status: "success", data: { user } });
  } catch (err) { next(err); }
};
