/**
 * Multer upload middleware
 *
 * Exports:
 *   upload.single("fieldName")   — one file
 *   upload.fields([...])         — multiple named fields
 *   uploadStay                   — pre-configured for stays (img + gallery[])
 *   uploadGuideApp               — pre-configured for guide applications
 *                                  (profilePic + identityProof)
 */
const multer = require("multer");
const path   = require("path");
const fs     = require("fs");

// ── Uploads directory ─────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Storage: disk, timestamped filenames ──────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/gi, "")
      .toLowerCase()
      .slice(0, 40);                       // cap length
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

// ── File-type guard ───────────────────────────────────────────
const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif/;
  const extOk   = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk  = allowed.test(file.mimetype.toLowerCase());
  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed: jpeg, jpg, png, webp, gif"));
  }
};

// ── Base multer instance (use for .single() / .array() etc.) ──
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

// ── Pre-configured: Stay listing ─────────────────────────────
//    Fields accepted:
//      img      — cover image  (max 1 file)
//      gallery  — extra photos (max 8 files)
const uploadStay = upload.fields([
  { name: "img",     maxCount: 1 },
  { name: "gallery", maxCount: 8 },
]);

// ── Pre-configured: Guide Application ────────────────────────
//    Fields accepted:
//      profilePic    — face photo      (max 1 file)
//      identityProof — Aadhaar/PAN etc (max 1 file)
const uploadGuideApp = upload.fields([
  { name: "profilePic",    maxCount: 1 },
  { name: "identityProof", maxCount: 1 },
]);

module.exports = upload;           // default export keeps existing uses working
module.exports.uploadStay     = uploadStay;
module.exports.uploadGuideApp = uploadGuideApp;

