/**
 * paymentRoutes.js
 *
 * IMPORTANT: This router is mounted BEFORE express.json() in server.js
 * so that the webhook route can receive raw body buffer.
 *
 * For all OTHER routes (/config, /create-order, /verify) we manually
 * apply express.json() here so req.body is parsed correctly.
 */

const express               = require("express");
const paymentCtrl           = require("../controllers/paymentController");
const webhookHandler        = require("../controllers/webhookHandler");
const verifyRazorpayWebhook = require("../middleware/verifyRazorpayWebhook");
const { optionalAuth }      = require("../middleware/auth");

const router = express.Router();

// ── Public: frontend reads Razorpay key_id ───────────────────
// Needs JSON parsing (though it's a GET, safe to include)
router.get("/config", express.json(), paymentCtrl.getConfig);

// ── Webhook — MUST use raw body, NO JSON parsing ─────────────
router.post(
  "/webhook",
  express.raw({ type: "*/*" }),
  verifyRazorpayWebhook,
  webhookHandler.handle
);

// ── Create Razorpay order ─────────────────────────────────────
// express.json() added here because this router runs before
// the global express.json() middleware in server.js
router.post(
  "/create-order",
  express.json(),
  optionalAuth,
  paymentCtrl.createOrder
);

// ── Verify payment after Razorpay checkout ───────────────────
router.post(
  "/verify",
  express.json(),
  optionalAuth,
  paymentCtrl.verifyPayment
);

module.exports = router;