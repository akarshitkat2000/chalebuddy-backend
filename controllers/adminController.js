/**
 * Admin Controller — full control over all 9 models
 */
const Guide            = require("../models/Guide");
const Stay             = require("../models/Stay");
const Transport        = require("../models/Transport");
const Booking          = require("../models/Booking");
const Contact          = require("../models/Contact");
const Newsletter       = require("../models/Newsletter");
const Trip             = require("../models/Trip");
const User             = require("../models/User");
const GuideApplication = require("../models/GuideApplication");
const AppError         = require("../utils/AppError");
const logger           = require("../utils/logger");
const { sendEmail }    = require("../utils/email");

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
exports.getDashboard = async (req, res, next) => {
  try {
    const [
      users, guides, stays, transport, bookings,
      trips, contacts, newsletters, applications, revenue,
    ] = await Promise.all([
      User.countDocuments(),
      Guide.countDocuments(),
      Stay.countDocuments(),
      Transport.countDocuments(),
      Booking.countDocuments(),
      Trip.countDocuments(),
      Contact.countDocuments({ status: "new" }),
      Newsletter.countDocuments({ active: true }),
      GuideApplication.countDocuments({ status: "pending" }),
      Booking.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const recentBookings = await Booking.find()
      .populate("stay",      "name city")
      .populate("transport", "operator from to")
      .populate("guide",     "name city")
      .sort("-createdAt")
      .limit(8)
      .lean();

    const bookingsByType = await Booking.aggregate([
      { $group: { _id: "$bookingType", count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
    ]);

    const monthlyRevenue = await Booking.aggregate([
      { $match: { status: { $ne: "cancelled" }, createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
      { $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        revenue: { $sum: "$totalAmount" }, count: { $sum: 1 },
      }},
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.status(200).json({
      status: "success",
      data: {
        stats: {
          users, guides, stays, transport, bookings,
          trips, pendingContacts: contacts,
          activeNewsletters: newsletters,
          pendingApplications: applications,
          totalRevenue: revenue[0]?.total || 0,
        },
        recentBookings,
        bookingsByType,
        monthlyRevenue,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GUIDE APPLICATIONS
════════════════════════════════════════ */
exports.getApplications = async (req, res, next) => {
  try {
    const { status = "", page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const [apps, total] = await Promise.all([
      GuideApplication.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      GuideApplication.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { applications: apps } });
  } catch (err) { next(err); }
};

exports.approveApplication = async (req, res, next) => {
  try {
    const app = await GuideApplication.findById(req.params.id);
    if (!app) return next(new AppError("Application not found.", 404));
    if (app.status === "approved") return next(new AppError("Already approved.", 400));

    // 1. Create Guide profile from application data
    const guide = await Guide.create({
      name:       app.fullName,
      city:       app.location,
      state:      "",
      type:       app.experience.includes("Food") ? "Food" : "Heritage",
      languages:  app.languages?.length ? app.languages : ["Hindi", "English"],
      bio:        app.about,
      rate:       1500,
      img:        app.img || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=70",
      verified:   true,
      available:  true,
    });

    // 2. Update application status
    app.status      = "approved";
    app.reviewedBy  = req.user._id;
    app.reviewedAt  = new Date();
    app.guideProfile = guide._id;
    await app.save();

    // 3. If user exists with same email, upgrade role to guide
    await User.findOneAndUpdate({ email: app.email }, { role: "guide" });

    // 4. Send approval email
    await sendEmail({
      to: app.email,
      subject: "🎉 Congratulations! Your Guide Application is Approved — ChaleBuddy",
      html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1B6CA8">Congratulations ${app.fullName}! 🏆</h2>
        <p>Your application to become a ChaleBuddy Guide has been <strong>approved</strong>!</p>
        <p>Your guide profile is now live. Travelers can discover and book you.</p>
        <p style="color:#F07B24;font-weight:600">Start sharing your local stories! 🗺️</p>
        <p style="color:#1B6CA8;font-weight:700">Team ChaleBuddy | hello@chalebuddy.in</p>
      </div>`,
    });

    logger.info(`Guide application approved: ${app.fullName} → Guide ID: ${guide._id}`);
    res.status(200).json({ status: "success", message: "Application approved and Guide profile created.", data: { application: app, guide } });
  } catch (err) { next(err); }
};

exports.rejectApplication = async (req, res, next) => {
  try {
    const app = await GuideApplication.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", reviewedBy: req.user._id, reviewedAt: new Date(), rejectionReason: req.body.reason || "Does not meet current requirements." },
      { new: true }
    );
    if (!app) return next(new AppError("Application not found.", 404));

    await sendEmail({
      to: app.email,
      subject: "ChaleBuddy Guide Application Update",
      html: `<h2>Namaste ${app.fullName},</h2><p>Thank you for applying. Unfortunately we cannot proceed at this time. Reason: ${req.body.reason || "Does not meet current requirements"}. You may reapply after 3 months.</p>`,
    });

    res.status(200).json({ status: "success", data: { application: app } });
  } catch (err) { next(err); }
};

exports.deleteApplication = async (req, res, next) => {
  try {
    await GuideApplication.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GUIDES
════════════════════════════════════════ */
exports.getAllGuides = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "", type = "", verified = "" } = req.query;
    const filter = {};
    if (search) filter.$or = [{ name: new RegExp(search, "i") }, { city: new RegExp(search, "i") }];
    if (type)     filter.type     = type;
    if (verified !== "") filter.verified = verified === "true";

    const [guides, total] = await Promise.all([
      Guide.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      Guide.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { guides } });
  } catch (err) { next(err); }
};

exports.updateGuide  = async (req, res, next) => {
  try {
    const guide = await Guide.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!guide) return next(new AppError("Guide not found.", 404));
    res.status(200).json({ status: "success", data: { guide } });
  } catch (err) { next(err); }
};

exports.deleteGuide  = async (req, res, next) => {
  try {
    await Guide.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   STAYS
════════════════════════════════════════ */
exports.getAllStays = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "", type = "" } = req.query;
    const filter = {};
    if (search) filter.$or = [{ name: new RegExp(search, "i") }, { city: new RegExp(search, "i") }];
    if (type) filter.type = type;

    const [stays, total] = await Promise.all([
      Stay.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      Stay.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { stays } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   STAYS
════════════════════════════════════════ */
exports.getAllStays = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = "", type = "", verified = "" } = req.query;
    const filter = {};   // admin sees ALL stays (including unverified/unavailable)
    if (search) filter.$or = [{ name: new RegExp(search, "i") }, { city: new RegExp(search, "i") }];
    if (type)              filter.type     = type;
    if (verified !== "")   filter.verified = verified === "true";

    const [stays, total] = await Promise.all([
      Stay.find(filter).sort("-createdAt").skip((page - 1) * +limit).limit(+limit).lean(),
      Stay.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { stays } });
  } catch (err) { next(err); }
};

// ── helper shared with stayController ────────────────────────
const toArray = val => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : [p]; } catch (_) {}
  return String(val).split(",").map(s => s.trim()).filter(Boolean);
};

exports.createStay = async (req, res, next) => {
  try {
    const data = { ...req.body };
    // Handle files from uploadStay middleware (fields: img, gallery)
    if (req.files?.img?.[0])     data.img     = `/uploads/${req.files.img[0].filename}`;
    if (req.files?.gallery?.length)
      data.gallery = req.files.gallery.map(f => `/uploads/${f.filename}`);
    // Legacy single-file fallback
    if (!data.img && req.file)   data.img     = `/uploads/${req.file.filename}`;
    // Parse array fields
    if (data.amenities) data.amenities = toArray(data.amenities);
    if (data.tags)      data.tags      = toArray(data.tags);

    const stay = await Stay.create(data);
    res.status(201).json({ status: "success", data: { stay } });
  } catch (err) { next(err); }
};

exports.updateStay = async (req, res, next) => {
  try {
    const data = { ...req.body };
    // Handle files only when multipart was actually parsed
    if (req.files?.img?.[0])     data.img     = `/uploads/${req.files.img[0].filename}`;
    if (req.files?.gallery?.length)
      data.gallery = req.files.gallery.map(f => `/uploads/${f.filename}`);
    if (!data.img && req.file)   data.img     = `/uploads/${req.file.filename}`;
    // Parse array fields
    if (data.amenities !== undefined) data.amenities = toArray(data.amenities);
    if (data.tags      !== undefined) data.tags      = toArray(data.tags);
    // Coerce booleans sent as strings
    if (data.verified  !== undefined) data.verified  = data.verified  === "true" || data.verified  === true;
    if (data.available !== undefined) data.available = data.available === "true" || data.available === true;

    const stay = await Stay.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!stay) return next(new AppError("Stay not found.", 404));
    res.status(200).json({ status: "success", data: { stay } });
  } catch (err) { next(err); }
};

exports.deleteStay = async (req, res, next) => {
  try {
    await Stay.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

// PATCH /api/admin/stays/:id/approve — one-click publish
exports.approveStay = async (req, res, next) => {
  try {
    const stay = await Stay.findByIdAndUpdate(
      req.params.id,
      { verified: true, available: true },
      { new: true }
    );
    if (!stay) return next(new AppError("Stay not found.", 404));
    logger.info(`Stay approved & published: "${stay.name}" (${stay._id})`);
    res.status(200).json({ status: "success", message: "Stay approved and now visible to travelers.", data: { stay } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   TRANSPORT
════════════════════════════════════════ */
exports.getAllTransport = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, mode = "", search = "" } = req.query;
    const filter = {};
    if (mode) filter.mode = mode;
    if (search) filter.$or = [{ operator: new RegExp(search, "i") }, { from: new RegExp(search, "i") }, { to: new RegExp(search, "i") }];

    const [transport, total] = await Promise.all([
      Transport.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      Transport.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { transport } });
  } catch (err) { next(err); }
};

exports.createTransport = async (req, res, next) => {
  try {
    const transport = await Transport.create(req.body);
    res.status(201).json({ status: "success", data: { transport } });
  } catch (err) { next(err); }
};

exports.updateTransport = async (req, res, next) => {
  try {
    const transport = await Transport.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!transport) return next(new AppError("Transport not found.", 404));
    res.status(200).json({ status: "success", data: { transport } });
  } catch (err) { next(err); }
};

exports.deleteTransport = async (req, res, next) => {
  try {
    await Transport.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   TRIPS
════════════════════════════════════════ */
exports.getAllTrips = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [trips, total] = await Promise.all([
      Trip.find().sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      Trip.countDocuments(),
    ]);
    res.status(200).json({ status: "success", total, data: { trips } });
  } catch (err) { next(err); }
};

exports.deleteTrip = async (req, res, next) => {
  try {
    await Trip.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

exports.featureTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findByIdAndUpdate(req.params.id, { featured: req.body.featured }, { new: true });
    if (!trip) return next(new AppError("Trip not found.", 404));
    res.status(200).json({ status: "success", data: { trip } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   BOOKINGS HUB
════════════════════════════════════════ */
exports.getAllBookings = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status = "", bookingType = "" } = req.query;
    const filter = {};
    if (status)      filter.status      = status;
    if (bookingType) filter.bookingType = bookingType;

    const [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate("stay",      "name city img")
        .populate("transport", "operator from to mode")
        .populate("guide",     "name city img")
        .populate("user",      "name email")
        .sort("-createdAt")
        .skip((page - 1) * limit)
        .limit(+limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { bookings } });
  } catch (err) { next(err); }
};

exports.updateBookingStatus = async (req, res, next) => {
  try {
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status, paymentStatus: req.body.paymentStatus },
      { new: true }
    );
    if (!booking) return next(new AppError("Booking not found.", 404));
    res.status(200).json({ status: "success", data: { booking } });
  } catch (err) { next(err); }
};

exports.deleteBooking = async (req, res, next) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   CONTACTS & INQUIRIES
════════════════════════════════════════ */
exports.getAllContacts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status = "" } = req.query;
    const filter = status ? { status } : {};
    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      Contact.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { contacts } });
  } catch (err) { next(err); }
};

exports.replyContact = async (req, res, next) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return next(new AppError("Contact not found.", 404));

    await sendEmail({
      to: contact.email,
      subject: `Re: ${contact.subject} — ChaleBuddy`,
      html: `<p>Dear ${contact.name},</p><p>${req.body.message}</p><p style="color:#1B6CA8;font-weight:700">Team ChaleBuddy</p>`,
    });

    contact.status    = "replied";
    contact.repliedAt = new Date();
    contact.repliedBy = req.user._id;
    contact.adminNotes = req.body.adminNotes || "";
    await contact.save();

    res.status(200).json({ status: "success", message: "Reply sent.", data: { contact } });
  } catch (err) { next(err); }
};

exports.updateContactStatus = async (req, res, next) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!contact) return next(new AppError("Contact not found.", 404));
    res.status(200).json({ status: "success", data: { contact } });
  } catch (err) { next(err); }
};

exports.deleteContact = async (req, res, next) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   NEWSLETTER
════════════════════════════════════════ */
exports.getAllNewsletters = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, active = "" } = req.query;
    const filter = active !== "" ? { active: active === "true" } : {};
    const [subscribers, total] = await Promise.all([
      Newsletter.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      Newsletter.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { subscribers } });
  } catch (err) { next(err); }
};

exports.deleteNewsletter = async (req, res, next) => {
  try {
    await Newsletter.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};

exports.broadcastNewsletter = async (req, res, next) => {
  try {
    const subscribers = await Newsletter.find({ active: true }).select("email name");
    const { subject, html } = req.body;
    if (!subject || !html) return next(new AppError("Subject and html body are required.", 400));

    // Send to all active subscribers (fire-and-forget in production use queue)
    let sent = 0;
    for (const sub of subscribers) {
      await sendEmail({ to: sub.email, subject, html: html.replace("{{name}}", sub.name || "Explorer") });
      sent++;
    }
    res.status(200).json({ status: "success", message: `Newsletter sent to ${sent} subscribers.` });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   USERS
════════════════════════════════════════ */
exports.getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role = "", search = "" } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];

    const [users, total] = await Promise.all([
      User.find(filter).select("-password").sort("-createdAt").skip((page - 1) * limit).limit(+limit).lean(),
      User.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", total, data: { users } });
  } catch (err) { next(err); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).select("-password");
    if (!user) return next(new AppError("User not found.", 404));
    res.status(200).json({ status: "success", data: { user } });
  } catch (err) { next(err); }
};

exports.deleteUser = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { active: false });
    res.status(200).json({ status: "success", message: "User deactivated." });
  } catch (err) { next(err); }
};
