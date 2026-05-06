const Transport   = require("../models/Transport");
const APIFeatures = require("../utils/apiFeatures");
const AppError    = require("../utils/AppError");

// GET /api/transport
exports.getAllTransport = async (req, res, next) => {
  try {
    const filter = { active: true };
    if (req.query.mode) filter.mode = req.query.mode;

    const features = new APIFeatures(Transport.find(filter), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const [transport, total] = await Promise.all([
      features.query,
      Transport.countDocuments(filter),
    ]);

    // Group by mode for frontend convenience
    const grouped = transport.reduce((acc, t) => {
      (acc[t.mode] = acc[t.mode] || []).push(t);
      return acc;
    }, {});

    res.status(200).json({
      status: "success",
      results: transport.length,
      total,
      page: features.page,
      data: { transport, grouped },
    });
  } catch (err) { next(err); }
};

// GET /api/transport/search?from=Delhi&to=Varanasi&mode=train&date=2024-10-10
exports.searchTransport = async (req, res, next) => {
  try {
    const { from, to, mode, date } = req.query;
    const filter = { active: true };
    if (mode) filter.mode = mode;
    if (from) filter.from = { $regex: from, $options: "i" };
    if (to)   filter.to   = { $regex: to,   $options: "i" };

    const results = await Transport.find(filter).sort("price");
    res.status(200).json({ status: "success", results: results.length, data: { transport: results } });
  } catch (err) { next(err); }
};

// GET /api/transport/:id
exports.getTransport = async (req, res, next) => {
  try {
    const t = await Transport.findById(req.params.id);
    if (!t) return next(new AppError("Transport not found.", 404));
    res.status(200).json({ status: "success", data: { transport: t } });
  } catch (err) { next(err); }
};

// POST /api/transport — Admin
exports.createTransport = async (req, res, next) => {
  try {
    const transport = await Transport.create(req.body);
    res.status(201).json({ status: "success", data: { transport } });
  } catch (err) { next(err); }
};

// PATCH /api/transport/:id
exports.updateTransport = async (req, res, next) => {
  try {
    const transport = await Transport.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!transport) return next(new AppError("Transport not found.", 404));
    res.status(200).json({ status: "success", data: { transport } });
  } catch (err) { next(err); }
};

// DELETE /api/transport/:id
exports.deleteTransport = async (req, res, next) => {
  try {
    await Transport.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

// GET /api/transport/popular-routes
exports.getPopularRoutes = async (req, res, next) => {
  try {
    const routes = await Transport.aggregate([
      { $match: { active: true } },
      { $group: { _id: { from: "$from", to: "$to", mode: "$mode" }, count: { $sum: "$bookingsCount" }, minPrice: { $min: "$price" } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    res.status(200).json({ status: "success", data: { routes } });
  } catch (err) { next(err); }
};
