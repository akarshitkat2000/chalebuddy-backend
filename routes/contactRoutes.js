const express  = require("express");
const { body, validationResult } = require("express-validator");
const ctrl     = require("../controllers/contactController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status:"error", message: errors.array().map((e) => e.msg).join(". ") });
  }
  next();
};

// Submit contact form
router.post(
  "/",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("subject").notEmpty().withMessage("Subject is required"),
    body("message").isLength({ min: 10 }).withMessage("Message must be at least 10 characters"),
  ],
  runValidation,
  ctrl.submitContact
);

// Newsletter
router.post("/newsletter/subscribe",   ctrl.subscribe);
router.post("/newsletter/unsubscribe", ctrl.unsubscribe);

// Admin only
router.use(protect, restrictTo("admin"));
router.get("/",             ctrl.getAllContacts);
router.patch("/:id/status", ctrl.updateContactStatus);

module.exports = router;
