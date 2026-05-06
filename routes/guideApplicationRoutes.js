const express  = require("express");
const { body, validationResult } = require("express-validator");
const ctrl     = require("../controllers/guideApplicationController");
const { uploadGuideApp } = require("../middleware/upload");

const router = express.Router();

const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status:  "error",
      message: errors.array().map(e => e.msg).join(". "),
    });
  }
  next();
};

// ── POST /api/guide-applications ─────────────────────────────
// Accepts multipart/form-data with optional profilePic + identityProof
router.post(
  "/",
  uploadGuideApp,   // handles profilePic[0] and identityProof[0]
  [
    body("fullName").notEmpty().withMessage("Full name required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("phone").notEmpty().withMessage("Phone required"),
    body("age").isInt({ min: 15 }).withMessage("Must be at least 15 years old"),
    body("location").notEmpty().withMessage("Location required"),
    body("about").isLength({ min: 30 }).withMessage("Please write at least 30 characters"),
  ],
  runValidation,
  ctrl.submitApplication
);

module.exports = router;

