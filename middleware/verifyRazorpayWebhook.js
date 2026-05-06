/**
 * verifyRazorpayWebhook.js — Signature Verification Middleware
 *
 * HOW RAZORPAY SIGNING WORKS:
 *   Razorpay computes: HMAC-SHA256(rawBody, WEBHOOK_SECRET)
 *   and puts the hex result in the x-razorpay-signature header.
 *
 *   We recompute the same digest from the raw Buffer body (captured
 *   by express.raw() in paymentRoutes.js BEFORE express.json() runs).
 *
 *   Comparison uses crypto.timingSafeEqual() — constant-time, immune
 *   to timing attacks that could leak the secret.
 *
 * WHAT THIS MIDDLEWARE DOES:
 *   1. Reject if signature header is missing
 *   2. Reject if RAZORPAY_WEBHOOK_SECRET is not set in .env
 *   3. Recompute expected HMAC from raw body
 *   4. Compare with constant-time equal
 *   5. Parse JSON and attach as req.webhookEvent for the handler
 *   6. Call next() only on success — everything else gets a 400
 */

const crypto = require("crypto");
const logger = require("../utils/logger");

module.exports = function verifyRazorpayWebhook(req, res, next) {
  // ── 1. Signature header must be present ───────────────────
  const receivedSig = req.headers["x-razorpay-signature"];
  if (!receivedSig) {
    logger.warn("Webhook: missing x-razorpay-signature — rejected");
    return res.status(400).json({ status: "error", message: "Missing x-razorpay-signature" });
  }

  // ── 2. Webhook secret must be configured ──────────────────
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("Webhook: RAZORPAY_WEBHOOK_SECRET not set in .env");
    return res.status(500).json({ status: "error", message: "Webhook secret not configured" });
  }

  // ── 3. Body must be raw Buffer (set by express.raw()) ─────
  const rawBody = req.body instanceof Buffer
    ? req.body
    : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));

  // ── 4. Compute expected HMAC-SHA256 ───────────────────────
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  // ── 5. Constant-time comparison ───────────────────────────
  let valid = false;
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(receivedSig,  "hex");
    valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (_) {
    valid = false;
  }

  if (!valid) {
    logger.error(`Webhook: invalid signature from ${req.ip} — rejected`);
    return res.status(400).json({ status: "error", message: "Invalid webhook signature" });
  }

  // ── 6. Parse body → attach as req.webhookEvent ────────────
  try {
    req.webhookEvent = JSON.parse(rawBody.toString("utf8"));
  } catch (_) {
    return res.status(400).json({ status: "error", message: "Webhook body is not valid JSON" });
  }

  logger.info(`Webhook verified: ${req.webhookEvent?.event || "unknown"}`);
  next();
};
