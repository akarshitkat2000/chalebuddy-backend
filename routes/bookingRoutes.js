const express  = require("express");
const { body, validationResult } = require("express-validator");
const ctrl     = require("../controllers/bookingController");
const { protect, optionalAuth } = require("../middleware/auth");

const router = express.Router();

const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status:"error", message: errors.array().map((e) => e.msg).join(". ") });
  }
  next();
};

// Create booking — guests can book too (optionalAuth)
router.post(
  "/",
  optionalAuth,
  [
    body("bookingType").isIn(["stay","transport","guide","food_tour"]).withMessage("Invalid booking type"),
    body("guestName").notEmpty().withMessage("Name is required"),
    body("guestEmail").isEmail().withMessage("Valid email required"),
    body("checkInDate").notEmpty().withMessage("Date is required"),
  ],
  runValidation,
  ctrl.createBooking
);

// Protected
router.use(protect);
router.get("/my",    ctrl.getMyBookings);
router.get("/stats", ctrl.getBookingStats);
router.get("/:id",   ctrl.getBooking);
router.patch("/:id/cancel", ctrl.cancelBooking);

module.exports = router;
