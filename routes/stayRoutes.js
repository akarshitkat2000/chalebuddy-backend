const express  = require("express");
const ctrl     = require("../controllers/stayController");
const { uploadStay } = require("../middleware/upload");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// ── Public routes ─────────────────────────────────────────────
router.get("/featured", ctrl.getFeaturedStays);
router.get("/cities",   ctrl.getCities);
router.get("/",         ctrl.getAllStays);
router.get("/:id",      ctrl.getStay);

// Reviews (optional auth — guests allowed too)
router.post("/:id/reviews", optionalAuth, ctrl.addReview);

// ── Host: list a new stay (any authenticated user) ────────────
// uploadStay handles multipart/form-data — MUST come before express.json()
// parses the body on this route.
router.post(
  "/list",
  protect,          // must be logged in
  uploadStay,       // parses multipart; populates req.files
  ctrl.listStay     // creates the Stay document
);

// ── Admin CRUD ────────────────────────────────────────────────
router.use(protect, restrictTo("admin"));
router.post(   "/",     uploadStay, ctrl.createStay);   // admin create (JSON or form)
router.patch(  "/:id",  uploadStay, ctrl.updateStay);
router.delete( "/:id",             ctrl.deleteStay);

module.exports = router;

