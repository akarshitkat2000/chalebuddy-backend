/**
 * paymentController.js
 *
 * Razorpay integration — 3-step payment flow:
 *
 *   Step 1  POST /api/payments/create-order
 *           → creates Razorpay order, saves orderId on Booking
 *
 *   Step 2  (Frontend) — Razorpay checkout popup
 *           → user pays; Razorpay calls webhook + returns to frontend
 *
 *   Step 3a POST /api/payments/verify  (frontend callback)
 *           → HMAC-SHA256 signature verification
 *           → marks booking confirmed, blocks availability, fires notifications
 *
 *   Step 3b POST /api/payments/webhook  (Razorpay server-to-server)
 *           → idempotent fallback — handles cases where frontend never calls verify
 *           → uses raw body buffer for signature validation (Express json middleware
 *             must NOT run on this route)
 *
 * Double-booking prevention:
 *   Uses a MongoDB findOneAndUpdate with atomic $push to blockedDates /
 *   bookedDates only AFTER signature verification — race conditions are
 *   handled by checking availability again inside the atomic update.
 */

const crypto   = require("crypto");
const Razorpay = require("razorpay");
const mongoose = require("mongoose");

const Booking  = require("../models/Booking");
const Stay     = require("../models/Stay");
const Guide    = require("../models/Guide");
const AppError = require("../utils/AppError");
const logger   = require("../utils/logger");
const { notifyAll } = require("../utils/notificationService");

/* ── Razorpay client (lazy-init so missing keys don't crash boot) */
let _rzp = null;
const getRazorpay = () => {
  if (!_rzp) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env");
    }
    _rzp = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _rzp;
};

/* ── helpers ─────────────────────────────────────────────────── */
const isValidId = id => mongoose.Types.ObjectId.isValid(id);

/** Verify Razorpay HMAC-SHA256 signature */
const verifySignature = (orderId, paymentId, signature) => {
  const body   = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");
  return expected === signature;
};

/** Verify webhook signature using raw body */
const verifyWebhookSignature = (rawBody, receivedSignature) => {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return expected === receivedSignature;
};

/**
 * Block availability on Stay / Guide after payment confirmed.
 * Performs an atomic check-and-push to prevent double-booking.
 * Returns { blocked: true } on success, throws AppError on conflict.
 */
const blockAvailability = async (booking) => {
  if (booking.bookingType === "stay" && booking.stay) {
    const checkIn  = new Date(booking.checkInDate);
    const nights   = booking.nights || 1;
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + nights);

    // Atomic: only push if no overlap exists right now
    const result = await Stay.findOneAndUpdate(
      {
        _id: booking.stay,
        // No existing block overlaps this range
        blockedDates: {
          $not: {
            $elemMatch: { checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } },
          },
        },
      },
      {
        $push: {
          blockedDates: {
            booking:   booking._id,
            checkIn,
            checkOut,
            stayType:  booking.stayType || "overnight",
            guestName: booking.guestName,
          },
        },
        $inc: { bookingsCount: 1 },
      },
      { new: true }
    );

    if (!result) {
      throw new AppError(
        "These dates are no longer available. Another guest just booked them. Please select different dates.",
        409
      );
    }
    logger.info(`📅 Stay ${booking.stay} blocked for ${checkIn.toDateString()} → ${checkOut.toDateString()}`);
    return { blocked: true };
  }

  if (booking.bookingType === "guide" && booking.guide) {
    const startDate = new Date(booking.checkInDate);
    const nights    = booking.nights || 1;
    const endDate   = new Date(startDate);
    endDate.setDate(endDate.getDate() + nights);

    const result = await Guide.findOneAndUpdate(
      {
        _id: booking.guide,
        bookedDates: {
          $not: {
            $elemMatch: { startDate: { $lt: endDate }, endDate: { $gt: startDate } },
          },
        },
      },
      {
        $push: {
          bookedDates: {
            booking:   booking._id,
            startDate,
            endDate,
            guestName: booking.guestName,
          },
        },
        $inc: { bookingsCount: 1, trips: 1 },
      },
      { new: true }
    );

    if (!result) {
      throw new AppError(
        "This guide is no longer available for the selected dates. Please choose different dates.",
        409
      );
    }
    logger.info(`📅 Guide ${booking.guide} blocked from ${startDate.toDateString()} → ${endDate.toDateString()}`);
    return { blocked: true };
  }

  // Transport / food_tour — increment only
  if (booking.transport) {
    await require("../models/Transport").findByIdAndUpdate(
      booking.transport,
      { $inc: { bookingsCount: 1 } }
    );
  }
  return { blocked: false };
};

/**
 * Core post-payment logic — idempotent (safe to call twice).
 * Called by both /verify and /webhook to avoid code duplication.
 */
const confirmBookingAfterPayment = async ({ orderId, paymentId, signature }) => {
  // Find the booking by orderId
  const booking = await Booking.findOne({ orderId });
  if (!booking) {
    throw new AppError(`No booking found for order ${orderId}`, 404);
  }

  // Idempotency guard — already confirmed?
  if (booking.paymentStatus === "paid") {
    logger.info(`Payment already processed for ${booking.refId} — skipping`);
    return { booking, alreadyConfirmed: true };
  }

  // Block availability (atomic, throws 409 on conflict)
  await blockAvailability(booking);

  // Update booking document
  booking.paymentStatus      = "paid";
  booking.paymentId          = paymentId;
  booking.razorpaySignature  = signature || "";
  booking.paidAt             = new Date();
  booking.status             = "confirmed";
  booking.paymentMethod      = "razorpay";
  await booking.save();

  // Fetch provider (Guide or Stay) for the alert email
  let provider = null;
  try {
    if (booking.bookingType === "stay"  && booking.stay)  provider = await Stay.findById(booking.stay).lean();
    if (booking.bookingType === "guide" && booking.guide) provider = await Guide.findById(booking.guide).lean();
  } catch (_) {}

  // Fire all 4 notifications in parallel — failures are swallowed internally
  const notifResults = await notifyAll(booking, provider);

  // Persist notification flags
  booking.notifications.emailSent      = notifResults.email?.ok        || false;
  booking.notifications.smsSent        = notifResults.sms?.ok          || false;
  booking.notifications.whatsappSent   = notifResults.whatsapp?.ok     || false;
  booking.notifications.providerAlerted= notifResults.providerAlert?.ok || false;
  await booking.save();

  logger.info(`✅ Booking ${booking.refId} fully confirmed after payment`);
  return { booking, alreadyConfirmed: false };
};

/* ══════════════════════════════════════════════════════════════
   CONTROLLERS
══════════════════════════════════════════════════════════════ */

/**
 * POST /api/payments/create-order
 * Body: { bookingId }
 *
 * Creates a Razorpay order for an existing "awaiting_payment" booking.
 * Returns { orderId, amount, currency, keyId } to the frontend.
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId || !isValidId(bookingId)) {
      return next(new AppError("Valid bookingId is required.", 400));
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return next(new AppError("Booking not found.", 404));
    if (booking.paymentStatus === "paid") {
      return next(new AppError("This booking has already been paid.", 400));
    }

    // Amount in paise (Razorpay requires smallest currency unit)
    const amountPaise = Math.round(booking.totalAmount * 100);

    const rzpOrder = await getRazorpay().orders.create({
      amount:   amountPaise,
      currency: "INR",
      receipt:  booking.refId,
      notes: {
        bookingId:   booking._id.toString(),
        bookingType: booking.bookingType,
        guestName:   booking.guestName,
        guestEmail:  booking.guestEmail,
      },
    });

    // Persist orderId on the booking
    booking.orderId       = rzpOrder.id;
    booking.paymentMethod = "razorpay";
    await booking.save();

    logger.info(`💳 Razorpay order created: ${rzpOrder.id} for booking ${booking.refId}`);

    res.status(200).json({
      status: "success",
      data: {
        orderId:   rzpOrder.id,
        amount:    amountPaise,
        currency:  "INR",
        keyId:     process.env.RAZORPAY_KEY_ID,
        booking: {
          refId:      booking.refId,
          guestName:  booking.guestName,
          guestEmail: booking.guestEmail,
          guestPhone: booking.guestPhone,
          bookingType:booking.bookingType,
        },
      },
    });
  } catch (err) {
    // Razorpay SDK throws typed errors
    if (err.statusCode) {
      return next(new AppError(`Razorpay error: ${err.error?.description || err.message}`, err.statusCode));
    }
    next(err);
  }
};

/**
 * POST /api/payments/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *
 * Called by the frontend after the Razorpay checkout popup succeeds.
 * Verifies HMAC-SHA256 signature, then confirms the booking.
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return next(new AppError("razorpay_order_id, razorpay_payment_id and razorpay_signature are required.", 400));
    }

    // ── Signature verification ────────────────────────────────
    const isValid = verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      logger.error(`🚨 Invalid Razorpay signature for order ${razorpay_order_id}`);
      return next(new AppError("Payment verification failed — invalid signature.", 400));
    }

    // ── Confirm booking + block dates + notify ─────────────────
    const { booking, alreadyConfirmed } = await confirmBookingAfterPayment({
      orderId:   razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    res.status(200).json({
      status:  "success",
      message: alreadyConfirmed ? "Already confirmed." : "Payment verified! Booking confirmed.",
      data: {
        refId:       booking.refId,
        status:      booking.status,
        paymentId:   booking.paymentId,
        totalAmount: booking.totalAmount,
        checkInDate: booking.checkInDate,
      },
    });
  } catch (err) {
    // Surface 409 (double-booking) cleanly to the frontend
    if (err.statusCode === 409) return next(err);
    next(err);
  }
};

/**
 * POST /api/payments/webhook
 *
 * NOTE: Webhook logic has been extracted to controllers/webhookHandler.js
 * for separation of concerns. paymentRoutes.js now calls webhookHandler.handle
 * directly via verifyRazorpayWebhook middleware.
 *
 * This export is kept for backward compat if anything imports it directly.
 */
exports.handleWebhook = require("./webhookHandler").handle;

/**
 * GET /api/payments/config
 * Returns the Razorpay key_id to the frontend (safe to expose).
 */
exports.getConfig = (_req, res) => {
  res.status(200).json({
    status: "success",
    data:   { keyId: process.env.RAZORPAY_KEY_ID || "" },
  });
};
