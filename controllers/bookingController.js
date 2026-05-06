/**
 * bookingController.js — v3.0 (Hybrid Payment Logic)
 *
 * PAYMENT RULES:
 *   stay        → PREPAID ONLY   (Razorpay mandatory)
 *   transport   → COD ONLY       (confirmed instantly, no Razorpay)
 *   food_tour   → COD ONLY       (confirmed instantly, no Razorpay)
 *   guide       → BOTH           (frontend sends paymentMethod: "razorpay" | "cod")
 *
 * EMAIL RULE:
 *   Email is NEVER sent at booking creation.
 *   It fires ONLY from:
 *     - webhookHandler.js  → payment.captured event
 *     - paymentController.js → /verify endpoint (after HMAC check)
 *     - COD bookings below  → notifyAll() called after confirm
 */

const mongoose  = require("mongoose");
const Booking   = require("../models/Booking");
const Stay      = require("../models/Stay");
const Transport = require("../models/Transport");
const Guide     = require("../models/Guide");
const AppError  = require("../utils/AppError");
const logger    = require("../utils/logger");
const { notifyAll } = require("../utils/notificationService");

/* ── helpers ─────────────────────────────────────────────────── */
const isValidId = id => mongoose.Types.ObjectId.isValid(id);

const calcPricing = (basePrice, qty) => {
  const subtotal    = basePrice * qty;
  const taxes       = Math.round(subtotal * 0.05);   // 5% GST
  const totalAmount = subtotal + taxes;
  return { basePrice, taxes, discount: 0, totalAmount };
};

/* ── Payment mode resolver ──────────────────────────────────────
   Returns "razorpay" or "cod" based on category + user choice.
   stay      → always razorpay
   transport → always cod
   food_tour → always cod
   guide     → respects req.body.paymentMethod (default: razorpay)
─────────────────────────────────────────────────────────────── */
const resolvePaymentMode = (bookingType, bodyPaymentMethod) => {
  if (bookingType === "stay")       return "razorpay";
  if (bookingType === "transport")  return "cod";
  if (bookingType === "food_tour")  return "cod";
  if (bookingType === "guide") {
    return bodyPaymentMethod === "cod" ? "cod" : "razorpay";
  }
  return "razorpay";
};

/* ════════════════════════════════════════════════════════════
   POST /api/bookings
════════════════════════════════════════════════════════════ */
exports.createBooking = async (req, res, next) => {
  try {
    const {
      bookingType, stayId, transportId, guideId,
      guestName, guestEmail, guestPhone,
      stayType, checkInDate, nights, passengers,
      travelClass, notes,
    } = req.body;

    /* ── Resolve payment mode ────────────────────────────────── */
    const payMode = resolvePaymentMode(bookingType, req.body.paymentMethod);
    const isCOD   = payMode === "cod";

    /* ── Validate & resolve booked item ──────────────────────── */
    let basePrice    = 0;
    let itemSnapshot = {};
    let refDoc       = null;
    let stayRef, transportRef, guideRef;

    if (bookingType === "stay") {
      if (!stayId || !isValidId(stayId))
        return next(new AppError(`"${stayId}" is not a valid Stay ID.`, 400));

      refDoc = await Stay.findById(stayId).lean();
      if (!refDoc)                        return next(new AppError("Stay not found.", 404));
      if (!refDoc.available || !refDoc.verified)
        return next(new AppError("This stay is not available for booking right now.", 400));

      // Pre-check availability
      if (stayType !== "quick") {
        const checkIn  = new Date(checkInDate);
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkOut.getDate() + (parseInt(nights, 10) || 1));
        const tempStay = await Stay.findById(stayId);
        if (!tempStay.isDateRangeAvailable(checkIn, checkOut))
          return next(new AppError("Selected dates are not available. Please choose different dates.", 409));
      }

      basePrice    = stayType === "quick" ? refDoc.quickPrice : refDoc.overnightPrice;
      stayRef      = stayId;
      itemSnapshot = { name: refDoc.name, city: refDoc.city, host: refDoc.host, img: refDoc.img, stayType };

    } else if (bookingType === "transport") {
      if (!transportId || !isValidId(transportId))
        return next(new AppError(`"${transportId}" is not a valid Transport ID.`, 400));

      refDoc = await Transport.findById(transportId).lean();
      if (!refDoc) return next(new AppError("Transport route not found.", 404));

      basePrice    = refDoc.price;
      transportRef = transportId;
      itemSnapshot = {
        operator: refDoc.operator, number: refDoc.number,
        from: refDoc.from, to: refDoc.to,
        dep: refDoc.dep, arr: refDoc.arr, mode: refDoc.mode,
      };

    } else if (bookingType === "guide") {
      if (!guideId || !isValidId(guideId))
        return next(new AppError(`"${guideId}" is not a valid Guide ID.`, 400));

      refDoc = await Guide.findById(guideId).lean();
      if (!refDoc)          return next(new AppError("Guide not found.", 404));
      if (!refDoc.available) return next(new AppError("This guide is not accepting bookings right now.", 400));

      // Pre-check availability for online payments
      if (!isCOD) {
        const start = new Date(checkInDate);
        const end   = new Date(start);
        end.setDate(end.getDate() + (parseInt(nights, 10) || 1));
        const tempGuide = await Guide.findById(guideId);
        if (!tempGuide.isAvailableForDates(start, end))
          return next(new AppError("This guide is not available for the selected dates.", 409));
      }

      basePrice    = refDoc.rate;
      guideRef     = guideId;
      itemSnapshot = { name: refDoc.name, city: refDoc.city, type: refDoc.type, img: refDoc.img };

    } else if (bookingType === "food_tour") {
      basePrice    = Number(req.body.basePrice) || 799;
      itemSnapshot = { name: req.body.itemName || "Food Tour" };

    } else {
      return next(new AppError("Invalid bookingType. Allowed: stay | transport | guide | food_tour.", 400));
    }

    /* ── Quantity & pricing ───────────────────────────────────── */
    const qty = bookingType === "transport"
      ? Math.max(1, parseInt(passengers, 10) || 1)
      : Math.max(1, parseInt(nights, 10) || 1);

    const pricing = calcPricing(basePrice, qty);

    /* ── Create booking document ─────────────────────────────── */
    const booking = await Booking.create({
      user:         req.user?._id,
      guestName:    guestName?.trim(),
      guestEmail:   guestEmail?.trim().toLowerCase(),
      guestPhone:   guestPhone || "",
      bookingType,
      stay:         stayRef,
      transport:    transportRef,
      guide:        guideRef,
      itemSnapshot,
      stayType:     stayType || "",
      checkInDate:  new Date(checkInDate),
      nights:       bookingType === "stay" || bookingType === "guide" ? qty : 1,
      passengers:   bookingType === "transport" ? qty : 1,
      travelClass:  travelClass || "Standard",
      notes:        notes || "",
      ...pricing,
      status:        isCOD ? "confirmed"       : "awaiting_payment",
      paymentStatus: isCOD ? "paid"            : "pending",
      paymentMethod: payMode,
      paidAt:        isCOD ? new Date()         : undefined,
    });

    /* ─────────────────────────────────────────────────────────
       COD PATH — confirm immediately, notify, return success
       Email fires here ONLY for COD (cash/cod) bookings.
       For Razorpay bookings email fires in webhookHandler ONLY.
    ───────────────────────────────────────────────────────── */
    if (isCOD) {
      if (refDoc) {
        const Model = bookingType === "transport" ? Transport
          : bookingType === "guide"               ? Guide
          :                                         Stay;
        await Model.findByIdAndUpdate(refDoc._id, { $inc: { bookingsCount: 1 } });
      }

      // COD email sent here (no payment step exists)
      notifyAll(booking, refDoc).catch(() => {});

      logger.info(`✅ COD Booking ${booking.refId} (${bookingType}) confirmed — ${guestEmail}`);

      return res.status(201).json({
        status:          "success",
        message:         "Booking confirmed!",
        requiresPayment: false,
        data:            { booking },
      });
    }

    /* ─────────────────────────────────────────────────────────
       RAZORPAY PATH — return booking, frontend calls /create-order
       NO email sent here. Email fires ONLY after webhook/verify.
    ───────────────────────────────────────────────────────── */
    logger.info(`⏳ Razorpay booking ${booking.refId} (${bookingType}) awaiting payment — ${guestEmail}`);

    res.status(201).json({
      status:          "success",
      message:         "Booking created. Please complete payment.",
      requiresPayment: true,
      data: {
        booking,
        bookingId: booking._id,
      },
    });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GET /api/bookings/my
════════════════════════════════════════ */
exports.getMyBookings = async (req, res, next) => {
  try {
    const filter = req.user.role === "admin"
      ? {}
      : { $or: [{ user: req.user._id }, { guestEmail: req.user.email }] };

    const bookings = await Booking.find(filter)
      .populate("stay",      "name city img")
      .populate("transport", "operator from to mode")
      .populate("guide",     "name city img")
      .sort("-createdAt").limit(50).lean();

    res.status(200).json({ status:"success", results:bookings.length, data:{ bookings } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GET /api/bookings/:id
════════════════════════════════════════ */
exports.getBooking = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return next(new AppError(`"${req.params.id}" is not a valid Booking ID.`, 400));

    const booking = await Booking.findById(req.params.id)
      .populate("stay").populate("transport").populate("guide").populate("user","name email");
    if (!booking) return next(new AppError("Booking not found.", 404));
    res.status(200).json({ status:"success", data:{ booking } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   PATCH /api/bookings/:id/cancel
════════════════════════════════════════ */
exports.cancelBooking = async (req, res, next) => {
  try {
    if (!isValidId(req.params.id))
      return next(new AppError(`"${req.params.id}" is not a valid Booking ID.`, 400));

    const booking = await Booking.findById(req.params.id);
    if (!booking)                       return next(new AppError("Booking not found.", 404));
    if (booking.status === "cancelled") return next(new AppError("Already cancelled.", 400));

    booking.status        = "cancelled";
    booking.cancelReason  = req.body.reason || "Cancelled by user";
    booking.cancelledAt   = new Date();
    booking.paymentStatus = booking.paymentStatus === "paid" ? "refunded" : "failed";
    await booking.save();

    res.status(200).json({ status:"success", data:{ booking } });
  } catch (err) { next(err); }
};

/* ════════════════════════════════════════
   GET /api/bookings/stats  (admin)
════════════════════════════════════════ */
exports.getBookingStats = async (req, res, next) => {
  try {
    const [stats, total, revenueAgg] = await Promise.all([
      Booking.aggregate([{
        $group: { _id:"$bookingType", count:{$sum:1}, revenue:{$sum:"$totalAmount"}, avg:{$avg:"$totalAmount"} }
      }]),
      Booking.countDocuments(),
      Booking.aggregate([
        { $match: { status:{ $ne:"cancelled" }, paymentStatus:"paid" } },
        { $group: { _id:null, total:{ $sum:"$totalAmount" } } },
      ]),
    ]);
    res.status(200).json({ status:"success", data:{ stats, total, revenue: revenueAgg[0]?.total || 0 } });
  } catch (err) { next(err); }
};
