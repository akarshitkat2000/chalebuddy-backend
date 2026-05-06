/**
 * Guide Application Controller
 * ─ Email confirmation logic is untouched (working fine).
 * ─ Now handles req.files from uploadGuideApp middleware:
 *     req.files.profilePic[0]    → saved as profilePic + img
 *     req.files.identityProof[0] → saved as identityProof
 */
const GuideApplication = require("../models/GuideApplication");
const AppError         = require("../utils/AppError");
const { sendGuideApplicationEmail } = require("../utils/email");
const logger           = require("../utils/logger");

// ── helper: build /uploads/<filename> URL ────────────────────
const fileUrl = file => file ? `/uploads/${file.filename}` : "";

// POST /api/guide-applications
exports.submitApplication = async (req, res, next) => {
  try {
    const data = { ...req.body };

    // ── Handle uploaded files (req.files from upload.fields()) ──
    // uploadGuideApp middleware populates req.files as:
    //   { profilePic: [FileObject], identityProof: [FileObject] }
    if (req.files) {
      const pic   = req.files.profilePic?.[0];
      const proof = req.files.identityProof?.[0];

      if (pic) {
        data.profilePic = fileUrl(pic);
        data.img        = data.profilePic;   // alias for admin dashboard preview
      }
      if (proof) {
        data.identityProof = fileUrl(proof);
      }
    }

    // Fallback: older single-file upload (req.file) kept for safety
    if (!data.img && req.file) {
      data.img        = fileUrl(req.file);
      data.profilePic = data.img;
    }

    // Field name normalisation
    if (!data.fullName && data.name) data.fullName = data.name;

    // Parse languages if sent as comma-separated string
    if (typeof data.languages === "string") {
      data.languages = data.languages.split(",").map(l => l.trim()).filter(Boolean);
    }

    const app = await GuideApplication.create(data);

    // ── Email confirmation (existing logic — do not change) ────
    sendGuideApplicationEmail({ application: app }).catch(() => {});

    logger.info(`Guide application submitted: ${app.fullName} (${app.email})`);

    res.status(201).json({
      status:  "success",
      message: "Application submitted! We'll contact you within 48 hours.",
      data:    { id: app._id },
    });
  } catch (err) { next(err); }
};

// GET /api/guide-applications — used by admin controller
exports.getAllApplications = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const [apps, total] = await Promise.all([
      GuideApplication.find(filter).sort("-createdAt").skip((page - 1) * +limit).limit(+limit),
      GuideApplication.countDocuments(filter),
    ]);
    res.status(200).json({
      status:  "success",
      results: apps.length,
      total,
      data:    { applications: apps },
    });
  } catch (err) { next(err); }
};

