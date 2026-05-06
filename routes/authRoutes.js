const express = require("express");
const { body, validationResult } = require("express-validator");
const ctrl     = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// ── Inline validator: avoids middleware-chain "next is not a function" ──
const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status : "error",
      message: errors.array().map((e) => e.msg).join(". "),
    });
  }
  next();
};

// ── Public routes ────────────────────────────────────────────
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  runValidation,
  ctrl.register
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  runValidation,
  ctrl.login
);

router.post("/logout", ctrl.logout);

// ── Protected routes ─────────────────────────────────────────
router.use(protect);

router.get("/me", ctrl.getMe);

router.patch("/update-profile", ctrl.updateProfile);

router.patch(
  "/update-password",
  [
    body("currentPassword").notEmpty().withMessage("Current password required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  ],
  runValidation,
  ctrl.updatePassword
);

module.exports = router;
