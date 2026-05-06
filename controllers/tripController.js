const Trip = require("../models/Trip");
const APIFeatures = require("../utils/apiFeatures");
const AppError = require("../utils/AppError");
const { sendEmail } = require("../utils/email"); // Destructuring use ki hai path ke hisaab se

// POST /api/trips
exports.createTrip = async (req, res, next) => {
  try {
    const tripData = {
      ...req.body,
      user: req.user?._id,
      creatorName: req.user?.name || req.body.creatorName,
    };
    const trip = await Trip.create(tripData);
    res.status(201).json({ status: "success", data: { trip } });
  } catch (err) { next(err); }
};

// GET /api/trips
exports.getAllTrips = async (req, res, next) => {
  try {
    const features = new APIFeatures(Trip.find({ active: true }), req.query)
      .filter()
      .search(["title","destination","description"])
      .sort()
      .limitFields()
      .paginate();

    const [trips, total] = await Promise.all([
      features.query.populate("user","name avatar email"),
      Trip.countDocuments({ active: true }),
    ]);

    res.status(200).json({ status: "success", results: trips.length, total, page: features.page, data: { trips } });
  } catch (err) { next(err); }
};

// GET /api/trips/:id
exports.getTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).populate("user","name avatar email");
    if (!trip) return next(new AppError("Trip not found.", 404));
    res.status(200).json({ status: "success", data: { trip } });
  } catch (err) { next(err); }
};

// POST /api/trips/:id/join — Request to join a trip
exports.requestJoin = async (req, res, next) => {
  try {
    // 1. Trip aur Creator dono ki details populate karo
    const trip = await Trip.findById(req.params.id).populate("user");
    if (!trip) return next(new AppError("Trip not found.", 404));

    const alreadyRequested = trip.joinRequests.some(
      (r) => r.user?.toString() === req.user?._id?.toString()
    );
    if (alreadyRequested) return next(new AppError("You have already sent a join request.", 400));

    // 2. Request save karo database mein
    trip.joinRequests.push({
      user: req.user?._id,
      name: req.user?.name || req.body.name,
      message: req.body.message || "",
    });
    await trip.save();

    // 3. 🔥 Email Logic (Fixed properties to match email.js)
    if (trip.user && trip.user.email) {
      try {
        await sendEmail({
          to: trip.user.email, // email.js 'to' expect kar raha tha
          subject: `New Travel Buddy: ${req.user.name} wants to join you! 🎒`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
              <h2 style="color: #1B6CA8;">Trip Request Received!</h2>
              <p>Namaste <strong>${trip.user.name}</strong>,</p>
              <p><strong>${req.user.name}</strong> wants to join your trip to <strong>${trip.destination}</strong>.</p>
              <div style="background: #f4f4f4; padding: 15px; border-left: 4px solid #F07B24; margin: 15px 0;">
                "<em>${req.body.message || 'No message provided'}</em>"
              </div>
              <p>You can coordinate with them at: <strong>${req.user.email}</strong></p>
              <br>
              <p style="color: #1B6CA8; font-weight: bold;">Team ChaleBuddy</p>
            </div>
          `
        });
        console.log(`[info]: 📧 Join request email sent to ${trip.user.email}`);
      } catch (err) {
        console.log("Email Error Details:", err.message);
      }
    }

    res.status(200).json({ status: "success", message: "Join request sent! 🤝" });
  } catch (err) { next(err); }
};

// PATCH /api/trips/:id
exports.updateTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!trip) return next(new AppError("Trip not found.", 404));
    res.status(200).json({ status: "success", data: { trip } });
  } catch (err) { next(err); }
};

// DELETE /api/trips/:id
exports.deleteTrip = async (req, res, next) => {
  try {
    await Trip.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) { next(err); }
};