/**
 * Stay Controller
 *
 * Fixes applied:
 *  1. listStay / createStay now parse req.files from uploadStay middleware
 *     (img + gallery[]) — no more multipart/boundary errors.
 *  2. Every findById() is guarded with ObjectId.isValid() before calling
 *     Mongoose, so dummy IDs like "b1" return a clean 400/404 instead of
 *     crashing with CastError.
 *  3. amenities, tags, rules sent as comma-separated strings are parsed
 *     into arrays automatically.
 */
const mongoose    = require("mongoose");
const Stay        = require("../models/Stay");
const APIFeatures = require("../utils/apiFeatures");
const AppError    = require("../utils/AppError");
const logger      = require("../utils/logger");

// ── helpers ───────────────────────────────────────────────────

/** Build a /uploads/<filename> URL from a Multer file object */
const fileUrl = file => `/uploads/${file.filename}`;

/**
 * Parse a value that may arrive as:
 *   - already an array  → return as-is
 *   - JSON string       → parse it
 *   - comma-separated   → split on comma
 *   - anything else     → wrap in array (or return [])
 */
const toArray = val => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [p]; } catch (_) {}
  return String(val).split(",").map(s => s.trim()).filter(Boolean);
};

/**
 * Build the data object from req.body + req.files.
 * Works for both multipart/form-data and application/json payloads.
 */
const buildStayData = (body, files = {}) => {
  const data = { ...body };

  // ── Cover image (required for new listings) ──────────────
  if (files.img?.[0]) {
    data.img = fileUrl(files.img[0]);
  }

  // ── Gallery (optional extra photos) ──────────────────────
  if (files.gallery?.length) {
    const existing = toArray(data.gallery);
    data.gallery = [...existing, ...files.gallery.map(fileUrl)];
  }

  // ── Array fields sent as strings ──────────────────────────
  if (data.amenities !== undefined) data.amenities = toArray(data.amenities);
  if (data.tags      !== undefined) data.tags      = toArray(data.tags);
  if (data.rules     !== undefined) data.rules     = toArray(data.rules);

  // ── Numeric coercions ─────────────────────────────────────
  if (data.quickPrice)     data.quickPrice     = Number(data.quickPrice);
  if (data.overnightPrice) data.overnightPrice = Number(data.overnightPrice);
  if (data.maxGuests)      data.maxGuests      = Number(data.maxGuests);
  if (data.rooms)          data.rooms          = Number(data.rooms);
  if (data.bathrooms)      data.bathrooms      = Number(data.bathrooms);

  return data;
};

// ── ObjectId guard ────────────────────────────────────────────
const isValidId = id => mongoose.Types.ObjectId.isValid(id);

/* ════════════════════════════════════════
   GET /api/stays
════════════════════════════════════════ */
exports.getAllStays = async (req, res, next) => {
  try {
    const features = new APIFeatures(Stay.find({ available: true }), req.query)
      .filter()
      .search(["name", "city", "area", "host"])
      .sort()
      .limitFields()
      .paginate();

    const [stays, total] = await Promise.all([
      features.query,
      Stay.countDocuments({ available: true }),
    ]);

    res.status(200).json({
      status:  "success",
      results: stays.length,
      total,
      page:    features.page,
      limit:   features.limit,
      data:    { stays },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GET /api/stays/featured
════════════════════════════════════════ */
exports.getFeaturedStays = async (req, res, next) => {
  try {
    const stays = await Stay.find({ featured: true, available: true })
      .limit(6).sort("-rating");
    res.status(200).json({
      status:  "success",
      results: stays.length,
      data:    { stays },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GET /api/stays/cities
════════════════════════════════════════ */
exports.getCities = async (req, res, next) => {
  try {
    const cities = await Stay.distinct("city");
    res.status(200).json({ status: "success", data: { cities } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GET /api/stays/:id
════════════════════════════════════════ */
exports.getStay = async (req, res, next) => {
  try {
    // Guard against dummy IDs like "b1", "featured", etc.
    if (!isValidId(req.params.id)) {
      return next(new AppError(`"${req.params.id}" is not a valid Stay ID.`, 400));
    }

    const stay = await Stay.findById(req.params.id);
    if (!stay) return next(new AppError("Stay not found.", 404));

    res.status(200).json({ status: "success", data: { stay } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   POST /api/stays/list
   — Any logged-in user can list their home
════════════════════════════════════════ */
exports.listStay = async (req, res, next) => {
  try {
    const data = buildStayData(req.body, req.files);

    // Cover image is required
    if (!data.img) {
      return next(new AppError("A cover image is required. Please upload an image.", 400));
    }

    // Required field validation (mirrors model requirements)
    const missing = [];
    if (!data.name)          missing.push("name");
    if (!data.city)          missing.push("city");
    if (!data.host)          missing.push("host");
    if (!data.quickPrice)    missing.push("quickPrice");
    if (!data.overnightPrice)missing.push("overnightPrice");
    if (!data.type)          missing.push("type");

    if (missing.length) {
      return next(new AppError(`Missing required fields: ${missing.join(", ")}.`, 400));
    }

    // Tag the listing with the authenticated host's userId
    data.hostUser  = req.user._id;
    data.verified  = false;   // admin must verify
    data.available = false;   // hidden from public until admin approves

    const stay = await Stay.create(data);

    logger.info(`New stay listed: "${stay.name}" in ${stay.city} by user ${req.user._id}`);

    res.status(201).json({
      status:  "success",
      message: "Your home has been listed! Our team will verify it within 24 hours.",
      data:    { stay },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   POST /api/stays  (admin)
════════════════════════════════════════ */
exports.createStay = async (req, res, next) => {
  try {
    const data = buildStayData(req.body, req.files);

    if (!data.img) {
      return next(new AppError("A cover image (img) is required.", 400));
    }

    const stay = await Stay.create(data);
    res.status(201).json({ status: "success", data: { stay } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   PATCH /api/stays/:id  (admin)
════════════════════════════════════════ */
exports.updateStay = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return next(new AppError(`"${req.params.id}" is not a valid Stay ID.`, 400));
    }

    const data = buildStayData(req.body, req.files);

    const stay = await Stay.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    );
    if (!stay) return next(new AppError("Stay not found.", 404));

    res.status(200).json({ status: "success", data: { stay } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   DELETE /api/stays/:id  (admin)
════════════════════════════════════════ */
exports.deleteStay = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return next(new AppError(`"${req.params.id}" is not a valid Stay ID.`, 400));
    }

    await Stay.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   POST /api/stays/:id/reviews
════════════════════════════════════════ */
exports.addReview = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) {
      return next(new AppError(`"${req.params.id}" is not a valid Stay ID.`, 400));
    }

    const stay = await Stay.findById(req.params.id);
    if (!stay) return next(new AppError("Stay not found.", 404));

    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return next(new AppError("Rating must be between 1 and 5.", 400));
    }

    stay.reviews.push({
      user:    req.user?._id,
      name:    req.user?.name || req.body.name || "Anonymous",
      rating:  Number(rating),
      comment: comment || "",
    });
    stay.recalcRating();
    await stay.save();

    res.status(201).json({ status: "success", data: { stay } });
  } catch (err) { next(err); }
};

