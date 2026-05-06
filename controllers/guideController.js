const Guide       = require("../models/Guide");
const APIFeatures = require("../utils/apiFeatures");
const AppError    = require("../utils/AppError");

// GET /api/guides
exports.getAllGuides = async (req, res, next) => {
  try {
    const features = new APIFeatures(Guide.find({ available: true }), req.query)
      .filter()
      .search(["name","city","tags"])
      .sort()
      .limitFields()
      .paginate();

    const [guides, total] = await Promise.all([
      features.query,
      Guide.countDocuments({ available: true }),
    ]);

    res.status(200).json({
      status: "success",
      results: guides.length,
      total,
      page: features.page,
      limit: features.limit,
      data: { guides },
    });
  } catch (err) { next(err); }
};

// GET /api/guides/:id
exports.getGuide = async (req, res, next) => {
  try {
    const guide = await Guide.findById(req.params.id).populate("user","name avatar");
    if (!guide) return next(new AppError("Guide not found.", 404));
    res.status(200).json({ status: "success", data: { guide } });
  } catch (err) { next(err); }
};

// POST /api/guides — Admin only
exports.createGuide = async (req, res, next) => {
  try {
    const guide = await Guide.create(req.body);
    res.status(201).json({ status: "success", data: { guide } });
  } catch (err) { next(err); }
};

// PATCH /api/guides/:id — Admin only
exports.updateGuide = async (req, res, next) => {
  try {
    const guide = await Guide.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!guide) return next(new AppError("Guide not found.", 404));
    res.status(200).json({ status: "success", data: { guide } });
  } catch (err) { next(err); }
};

// DELETE /api/guides/:id — Admin only
exports.deleteGuide = async (req, res, next) => {
  try {
    await Guide.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

// POST /api/guides/:id/reviews
exports.addReview = async (req, res, next) => {
  try {
    const guide = await Guide.findById(req.params.id);
    if (!guide) return next(new AppError("Guide not found.", 404));
    const { rating, comment } = req.body;
    guide.reviews.push({ user: req.user._id, name: req.user.name, rating, comment });
    guide.recalcRating();
    await guide.save();
    res.status(201).json({ status: "success", data: { guide } });
  } catch (err) { next(err); }
};

// GET /api/guides/featured
exports.getFeaturedGuides = async (req, res, next) => {
  try {
    const guides = await Guide.find({ featured: true, available: true }).limit(6).sort("-rating");
    res.status(200).json({ status: "success", results: guides.length, data: { guides } });
  } catch (err) { next(err); }
};

// GET /api/guides/stats
exports.getGuideStats = async (req, res, next) => {
  try {
    const stats = await Guide.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 }, avgRate: { $avg: "$rate" }, avgRating: { $avg: "$rating" } } },
      { $sort: { count: -1 } },
    ]);
    res.status(200).json({ status: "success", data: { stats } });
  } catch (err) { next(err); }
};
