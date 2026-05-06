const express  = require("express");
const { body, validationResult } = require("express-validator");
const ctrl     = require("../controllers/tripController");
const { protect, optionalAuth } = require("../middleware/auth");

const router = express.Router();

const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status:"error", message: errors.array().map((e) => e.msg).join(". ") });
  }
  next();
};

router.get("/",    ctrl.getAllTrips);
router.get("/:id", ctrl.getTrip);

router.post(
  "/",
  optionalAuth,
  [
    body("destination").notEmpty().withMessage("Destination is required"),
    body("creatorName").notEmpty().withMessage("Your name is required"),
    body("travelDate").notEmpty().withMessage("Travel date is required"),
    body("duration").notEmpty().withMessage("Duration is required"),
    body("budget").notEmpty().withMessage("Budget is required"),
  ],
  runValidation,
  ctrl.createTrip
);

router.post("/:id/join", optionalAuth, ctrl.requestJoin);

router.use(protect);
router.patch("/:id",  ctrl.updateTrip);
router.delete("/:id", ctrl.deleteTrip);

module.exports = router;
