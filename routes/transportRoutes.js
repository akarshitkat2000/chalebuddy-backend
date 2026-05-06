const express = require("express");
const ctrl    = require("../controllers/transportController");
const { protect, restrictTo } = require("../middleware/auth");

const router = express.Router();

router.get("/search",         ctrl.searchTransport);
router.get("/popular-routes", ctrl.getPopularRoutes);
router.get("/",               ctrl.getAllTransport);
router.get("/:id",            ctrl.getTransport);

// Admin CRUD
router.use(protect, restrictTo("admin"));
router.post("/",      ctrl.createTransport);
router.patch("/:id",  ctrl.updateTransport);
router.delete("/:id", ctrl.deleteTransport);

module.exports = router;
