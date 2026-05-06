const express = require("express");
const ctrl    = require("../controllers/guideController");
const { protect, restrictTo, optionalAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/featured", ctrl.getFeaturedGuides);
router.get("/stats",    ctrl.getGuideStats);
router.get("/",         ctrl.getAllGuides);
router.get("/:id",      ctrl.getGuide);

// Reviews (login required)
router.post("/:id/reviews", protect, ctrl.addReview);

// Admin CRUD
router.use(protect, restrictTo("admin"));
router.post("/",       ctrl.createGuide);
router.patch("/:id",   ctrl.updateGuide);
router.delete("/:id",  ctrl.deleteGuide);

module.exports = router;
