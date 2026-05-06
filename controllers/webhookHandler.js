/**
 * webhookHandler.js — Razorpay Webhook Automation Engine
 *
 * FLOW: Razorpay → POST /api/payments/webhook
 *
 *   [verifyRazorpayWebhook middleware] ← signature verified BEFORE this runs
 *       │
 *       ▼
 *   handle(req, res)
 *       │
 *       ├─ payment.captured  ──► confirmBookingAfterPayment()
 *       │                           ├─ Idempotency check (skip if already paid)
 *       │                           ├─ blockAvailability()  [atomic MongoDB $push]
 *       │                           │     ├─ Stay: push to blockedDates[]
 *       │                           │     └─ Guide: push to bookedDates[]
 *       │                           ├─ booking.status = "confirmed"
 *       │                           └─ notifyAll()  [Promise.allSettled]
 *       │                                 ├─ sendInvoiceEmail()  [nodemailer]
 *       │                                 ├─ sendSMS()           [Msg91, if enabled]
 *       │                                 ├─ sendWhatsApp()      [Twilio, if enabled]
 *       │                                 └─ alertProvider()     [email to guide/host]
 *       │
 *       ├─ payment.failed    ──► mark booking.paymentStatus = "failed"
 *       ├─ order.paid        ──► same as captured (idempotent)
 *       └─ other events      ──► logged, 200 returned (Razorpay must get 200)
 *
 * WHY SEPARATE FROM paymentController:
 *   - Clean separation of concerns: verify-on-frontend vs webhook automation
 *   - Easier to add new event handlers without touching payment logic
 *   - Can be independently unit tested
 *   - Browser-close safety: if user pays and closes browser, /verify never runs,
 *     but this webhook ALWAYS fires from Razorpay servers
 */

const mongoose = require("mongoose");

const Booking   = require("../models/Booking");
const Stay      = require("../models/Stay");
const Guide     = require("../models/Guide");
const Transport = require("../models/Transport");
const logger    = require("../utils/logger");
const { notifyAll } = require("../utils/notificationService");

/* ════════════════════════════════════════════════════════════
   AVAILABILITY BLOCKING — atomic, double-booking proof
   Called ONLY after payment is confirmed. Uses MongoDB's
   findOneAndUpdate with a $not $elemMatch filter so the
   push only succeeds when no overlap exists. If another
   payment confirmed the same dates a millisecond earlier,
   the update returns null and we log a conflict.
════════════════════════════════════════════════════════════ */
const blockAvailability = async (booking) => {

  /* ── Stay ─────────────────────────────────────────────── */
  if (booking.bookingType === "stay" && booking.stay) {
    const checkIn  = new Date(booking.checkInDate);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + (booking.nights || 1));

    const updated = await Stay.findOneAndUpdate(
      {
        _id: booking.stay,
        // Atomic guard: no existing block overlaps this range
        blockedDates: {
          $not: {
            $elemMatch: {
              checkIn:  { $lt: checkOut },
              checkOut: { $gt: checkIn  },
            },
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

    if (!updated) {
      // Dates were grabbed by another booking between pre-check and payment
      logger.warn(
        `Double-booking conflict: Stay ${booking.stay} for booking ${booking.refId} — dates already blocked`
      );
      return { blocked: false, conflict: true };
    }

    logger.info(
      `📅 Stay ${booking.stay} blocked: ${checkIn.toDateString()} → ${checkOut.toDateString()} [${booking.refId}]`
    );
    return { blocked: true, conflict: false };
  }

  /* ── Guide ────────────────────────────────────────────── */
  if (booking.bookingType === "guide" && booking.guide) {
    const startDate = new Date(booking.checkInDate);
    const endDate   = new Date(startDate);
    endDate.setDate(endDate.getDate() + (booking.nights || 1));

    const updated = await Guide.findOneAndUpdate(
      {
        _id: booking.guide,
        bookedDates: {
          $not: {
            $elemMatch: {
              startDate: { $lt: endDate   },
              endDate:   { $gt: startDate },
            },
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

    if (!updated) {
      logger.warn(
        `Double-booking conflict: Guide ${booking.guide} for booking ${booking.refId}`
      );
      return { blocked: false, conflict: true };
    }

    logger.info(
      `📅 Guide ${booking.guide} blocked: ${startDate.toDateString()} → ${endDate.toDateString()} [${booking.refId}]`
    );
    return { blocked: true, conflict: false };
  }

  /* ── Transport — just increment count ────────────────── */
  if (booking.transport) {
    await Transport.findByIdAndUpdate(booking.transport, { $inc: { bookingsCount: 1 } });
  }

  return { blocked: false, conflict: false };
};

/* ════════════════════════════════════════════════════════════
   CORE ENGINE — confirmBookingAfterPayment
   Idempotent: safe to call from both /verify AND /webhook.
   If webhook fires after /verify already ran, it's a no-op.
════════════════════════════════════════════════════════════ */
const confirmBookingAfterPayment = async ({ orderId, paymentId }) => {
  /* ── Find booking by Razorpay orderId ─────────────────── */
  const booking = await Booking.findOne({ orderId });
  if (!booking) {
    logger.warn(`confirmBookingAfterPayment: no booking for orderId ${orderId}`);
    return { ok: false, reason: "not_found" };
  }

  /* ── Idempotency guard ────────────────────────────────── */
  if (booking.paymentStatus === "paid") {
    logger.info(`Booking ${booking.refId} already confirmed — skipping`);
    return { ok: true, booking, alreadyConfirmed: true };
  }

  /* ── Block availability (atomic) ─────────────────────── */
  const availResult = await blockAvailability(booking);
  // Even on conflict we still mark the booking confirmed — the
  // conflict is logged for ops to review; we don't fail the payment.

  /* ── Update booking to confirmed ─────────────────────── */
  booking.paymentStatus     = "paid";
  booking.paymentId         = paymentId || "";
  booking.paidAt            = new Date();
  booking.status            = "confirmed";
  booking.paymentMethod     = "razorpay";
  await booking.save();

  /* ── Fetch provider for alert email ──────────────────── */
  let provider = null;
  try {
    if (booking.bookingType === "stay"  && booking.stay)
      provider = await Stay.findById(booking.stay).lean();
    if (booking.bookingType === "guide" && booking.guide)
      provider = await Guide.findById(booking.guide).lean();
  } catch (_) {}

  /* ── Fire all notifications in parallel ──────────────── */
  const notifResults = await notifyAll(booking, provider);

  /* ── Persist notification delivery flags ─────────────── */
  booking.notifications = {
    emailSent:       notifResults.email?.ok         || false,
    smsSent:         notifResults.sms?.ok           || false,
    whatsappSent:    notifResults.whatsapp?.ok       || false,
    providerAlerted: notifResults.providerAlert?.ok  || false,
  };
  await booking.save();

  logger.info(
    `✅ Booking ${booking.refId} confirmed | ` +
    `email=${booking.notifications.emailSent} ` +
    `sms=${booking.notifications.smsSent} ` +
    `wa=${booking.notifications.whatsappSent} ` +
    `provider=${booking.notifications.providerAlerted}`
  );

  return { ok: true, booking, alreadyConfirmed: false, availResult };
};

/* ════════════════════════════════════════════════════════════
   EXPORTED HANDLER — called by paymentRoutes.js
   req.webhookEvent is already parsed + verified by middleware
════════════════════════════════════════════════════════════ */
exports.handle = async (req, res) => {
  // Always ACK Razorpay immediately so they don't retry
  // We do the heavy work async so the 200 is returned fast
  res.status(200).json({ status: "ok" });

  const event = req.webhookEvent; // set by verifyRazorpayWebhook middleware
  if (!event) return;

  const eventType = event.event;
  logger.info(`🪝 Webhook event: ${eventType}`);

  try {
    switch (eventType) {

      /* ── payment.captured ── primary success event ─── */
      case "payment.captured": {
        const payment  = event.payload?.payment?.entity || {};
        const orderId  = payment.order_id;
        const paymentId= payment.id;

        if (!orderId) {
          logger.warn("payment.captured: missing order_id in payload");
          break;
        }

        const result = await confirmBookingAfterPayment({ orderId, paymentId });
        if (result.ok && !result.alreadyConfirmed) {
          logger.info(`🪝 payment.captured → Booking confirmed: ${result.booking.refId}`);
        }
        break;
      }

      /* ── order.paid ── fired when all payments on order succeed ─ */
      case "order.paid": {
        const order    = event.payload?.order?.entity || {};
        const payment  = event.payload?.payment?.entity || {};
        const orderId  = order.id;
        const paymentId= payment.id;

        if (orderId) {
          await confirmBookingAfterPayment({ orderId, paymentId });
          logger.info(`🪝 order.paid → processed for orderId: ${orderId}`);
        }
        break;
      }

      /* ── payment.failed ── mark as failed, do NOT confirm ─────── */
      case "payment.failed": {
        const payment = event.payload?.payment?.entity || {};
        const orderId = payment.order_id;

        if (orderId) {
          const booking = await Booking.findOne({ orderId });
          if (booking && booking.paymentStatus !== "paid") {
            booking.paymentStatus = "failed";
            booking.status        = "awaiting_payment"; // keep it recoverable
            await booking.save();
            logger.info(`🪝 payment.failed → Booking ${booking.refId} marked failed`);
          }
        }
        break;
      }

      /* ── refund.created ── mark as refunded ───────────────────── */
      case "refund.created": {
        const refund  = event.payload?.refund?.entity || {};
        const paymentId = refund.payment_id;

        if (paymentId) {
          const booking = await Booking.findOne({ paymentId });
          if (booking) {
            booking.paymentStatus = "refunded";
            await booking.save();
            logger.info(`🪝 refund.created → Booking ${booking.refId} marked refunded`);
          }
        }
        break;
      }

      /* ── all other events — log and ignore ────────────────────── */
      default:
        logger.info(`🪝 Unhandled webhook event: ${eventType} — ignoring`);
    }
  } catch (err) {
    // Never let this crash — Razorpay already got its 200
    logger.error(`🪝 Webhook processing error [${eventType}]: ${err.message}`);
  }
};
