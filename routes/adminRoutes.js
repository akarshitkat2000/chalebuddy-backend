/**
 * Admin Routes — all protected with admin role
 *
 * Fix: PATCH /admin/stays/:id was using upload.single("img") which
 * throws "Boundary not found" when the admin dashboard sends a plain
 * JSON PATCH (no file).  We now use uploadStay (fields-based) only on
 * POST, and for PATCH we use a conditional helper that calls multer
 * only when the request is actually multipart.
 */
const express = require("express");
const ctrl    = require("../controllers/adminController");
const { protect, restrictTo } = require("../middleware/auth");
const { uploadStay, uploadGuideApp } = require("../middleware/upload");

const router = express.Router();
router.use(protect, restrictTo("admin")); // ALL routes require admin

// ── Conditional multipart middleware ──────────────────────────
// Runs multer only when Content-Type is multipart/form-data.
// For plain JSON requests (no file) it skips multer entirely —
// this is what caused the "Boundary not found" 500 on PATCH.
const ifMultipart = (multerMiddleware) => (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.includes("multipart/form-data")) {
    return multerMiddleware(req, res, next);
  }
  next();
};

// Dashboard
router.get("/dashboard", ctrl.getDashboard);

// Users
router.get("/users",        ctrl.getAllUsers);
router.patch("/users/:id",  ctrl.updateUser);
router.delete("/users/:id", ctrl.deleteUser);

// Guide Applications
router.get("/applications",               ctrl.getApplications);
router.patch("/applications/:id/approve", ctrl.approveApplication);
router.patch("/applications/:id/reject",  ctrl.rejectApplication);
router.delete("/applications/:id",        ctrl.deleteApplication);

// Guides
router.get("/guides",         ctrl.getAllGuides);
router.patch("/guides/:id",   ctrl.updateGuide);
router.delete("/guides/:id",  ctrl.deleteGuide);

// Stays — POST may have files; PATCH may or may not have files
router.get("/stays",                   ctrl.getAllStays);
router.post("/stays",                  uploadStay,              ctrl.createStay);
router.patch("/stays/:id",             ifMultipart(uploadStay), ctrl.updateStay);
router.patch("/stays/:id/approve",                              ctrl.approveStay);
router.delete("/stays/:id",                                     ctrl.deleteStay);

// Transport
router.get("/transport",           ctrl.getAllTransport);
router.post("/transport",          ctrl.createTransport);
router.patch("/transport/:id",     ctrl.updateTransport);
router.delete("/transport/:id",    ctrl.deleteTransport);

// Trips
router.get("/trips",               ctrl.getAllTrips);
router.patch("/trips/:id/feature", ctrl.featureTrip);
router.delete("/trips/:id",        ctrl.deleteTrip);

// Bookings Hub
router.get("/bookings",            ctrl.getAllBookings);
router.patch("/bookings/:id",      ctrl.updateBookingStatus);
router.delete("/bookings/:id",     ctrl.deleteBooking);

// Contacts & Inquiries
router.get("/contacts",            ctrl.getAllContacts);
router.post("/contacts/:id/reply", ctrl.replyContact);
router.patch("/contacts/:id",      ctrl.updateContactStatus);
router.delete("/contacts/:id",     ctrl.deleteContact);

// Newsletter
router.get("/newsletters",            ctrl.getAllNewsletters);
router.delete("/newsletters/:id",     ctrl.deleteNewsletter);
router.post("/newsletters/broadcast", ctrl.broadcastNewsletter);

module.exports = router;

