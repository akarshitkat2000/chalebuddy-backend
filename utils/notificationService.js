/**
 * notificationService.js
 *
 * Centralised, fault-tolerant notification hub.
 * Each channel (email / SMS / WhatsApp / provider alert) runs in
 * isolation — one failure NEVER blocks the others or crashes the
 * booking flow.
 *
 * Architecture:
 *   notifyAll(booking)
 *     ├── sendInvoiceEmail()   [nodemailer]
 *     ├── sendSMS()            [Msg91 REST API]
 *     ├── sendWhatsApp()       [Twilio WhatsApp]
 *     └── alertProvider()     [email to guide / host]
 *
 * All results are returned so the caller can update
 * booking.notifications flags in the DB.
 */

const nodemailer = require("nodemailer");
const https      = require("https");
const logger     = require("./logger");

/* ── helpers ─────────────────────────────────────────────────── */

/** Format an Indian rupee amount */
const inr = n => `₹${Number(n).toLocaleString("en-IN")}`;

/** Format a Date for display */
const fmtDate = d => new Date(d).toLocaleDateString("en-IN", {
  day: "numeric", month: "long", year: "numeric",
});

/* ══════════════════════════════════════════════════════════════
   1. EMAIL — Professional Invoice / Ticket
══════════════════════════════════════════════════════════════ */

const buildTransporter = () =>
  nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT, 10),
    secure: parseInt(process.env.EMAIL_PORT, 10) === 465,
    auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

/** Build a clean, mobile-friendly HTML invoice */
const buildInvoiceHtml = (booking) => {
  const item = booking.itemSnapshot || {};
  const itemName = item.name || item.operator || booking.bookingType;
  const itemDetail = booking.bookingType === "transport"
    ? `${item.from} → ${item.to} | ${item.dep} – ${item.arr}`
    : item.city ? `📍 ${item.city}` : "";

  const qtyLabel = booking.bookingType === "transport"
    ? `${booking.passengers} Passenger(s)`
    : `${booking.nights} Night(s)`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7FAFE;font-family:'DM Sans',Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,108,168,.12)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0D4C7A,#1B6CA8);padding:32px 40px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:-0.5px">ChaleBuddy</h1>
    <p style="color:rgba(255,255,255,.7);margin:6px 0 0;font-size:13px">India's #1 Solo Travel Companion</p>
  </div>

  <!-- Confirmation strip -->
  <div style="background:#F07B24;padding:16px 40px;text-align:center">
    <p style="color:#fff;margin:0;font-size:15px;font-weight:600">
      🎉 Booking Confirmed! &nbsp;|&nbsp; Ref: <strong>${booking.refId}</strong>
    </p>
  </div>

  <!-- Body -->
  <div style="padding:36px 40px">
    <p style="color:#0B1628;font-size:16px;margin-top:0">
      Namaste <strong>${booking.guestName}</strong>! 🙏
    </p>
    <p style="color:#4B6080;font-size:14px;line-height:1.7">
      Your booking has been <strong style="color:#059669">confirmed & paid</strong>.
      Here are your details:
    </p>

    <!-- Booking card -->
    <div style="background:#EBF5FF;border-radius:12px;padding:24px;margin:24px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:8px 0;color:#8FA4BE;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;width:40%">What</td>
          <td style="padding:8px 0;color:#0B1628;font-size:14px;font-weight:600">${itemName}</td>
        </tr>
        ${itemDetail ? `<tr>
          <td style="padding:8px 0;color:#8FA4BE;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Details</td>
          <td style="padding:8px 0;color:#0B1628;font-size:14px">${itemDetail}</td>
        </tr>` : ""}
        <tr>
          <td style="padding:8px 0;color:#8FA4BE;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Date</td>
          <td style="padding:8px 0;color:#0B1628;font-size:14px">${fmtDate(booking.checkInDate)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8FA4BE;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Quantity</td>
          <td style="padding:8px 0;color:#0B1628;font-size:14px">${qtyLabel}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8FA4BE;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em">Payment ID</td>
          <td style="padding:8px 0;color:#0B1628;font-size:13px;font-family:monospace">${booking.paymentId || "COD"}</td>
        </tr>
      </table>
    </div>

    <!-- Price breakdown -->
    <div style="border:1px solid #D8E4F0;border-radius:12px;overflow:hidden;margin-bottom:24px">
      <div style="padding:12px 20px;display:flex;justify-content:space-between;border-bottom:1px solid #D8E4F0">
        <span style="color:#4B6080;font-size:13px">Base Amount</span>
        <span style="color:#0B1628;font-size:13px">${inr(booking.basePrice)}</span>
      </div>
      <div style="padding:12px 20px;display:flex;justify-content:space-between;border-bottom:1px solid #D8E4F0">
        <span style="color:#4B6080;font-size:13px">GST (5%)</span>
        <span style="color:#0B1628;font-size:13px">${inr(booking.taxes)}</span>
      </div>
      <div style="padding:14px 20px;display:flex;justify-content:space-between;background:#EBF5FF">
        <span style="color:#0B1628;font-size:15px;font-weight:700">Total Paid</span>
        <span style="color:#1B6CA8;font-size:15px;font-weight:700">${inr(booking.totalAmount)}</span>
      </div>
    </div>

    <p style="color:#4B6080;font-size:13px;line-height:1.7">
      Need help? Reply to this email or WhatsApp us at
      <strong>${process.env.SUPPORT_PHONE || "+91 98765 43210"}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#080f1c;padding:24px 40px;text-align:center">
    <p style="color:rgba(255,255,255,.3);font-size:12px;margin:0">
      © ${new Date().getFullYear()} ChaleBuddy · Kanpur, UP · hello@chalebuddy.in
    </p>
    <p style="color:rgba(255,255,255,.15);font-size:11px;margin:6px 0 0">
      2% of every booking supports local artisan communities 🌿
    </p>
  </div>
</div>
</body>
</html>`;
};

/** Send invoice/ticket email to the guest */
const sendInvoiceEmail = async (booking) => {
  try {
    const transporter = buildTransporter();
    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME || "ChaleBuddy"}" <${process.env.EMAIL_FROM}>`,
      to:      booking.guestEmail,
      subject: `Booking Confirmed — ${booking.refId} | ChaleBuddy 🎉`,
      html:    buildInvoiceHtml(booking),
      text:    `Booking ${booking.refId} confirmed. Total: ₹${booking.totalAmount}. Thank you for choosing ChaleBuddy!`,
    });
    logger.info(`📧 Invoice email → ${booking.guestEmail} [${booking.refId}]`);
    return { ok: true };
  } catch (err) {
    logger.error(`📧 Invoice email FAILED [${booking.refId}]: ${err.message}`);
    return { ok: false, error: err.message };
  }
};

/* ══════════════════════════════════════════════════════════════
   2. PROVIDER ALERT — Notify guide / host about new booking
══════════════════════════════════════════════════════════════ */

const alertProvider = async (booking, provider) => {
  if (!provider?.contactEmail && !provider?.hostUser) {
    logger.warn(`alertProvider: no contact email for booking ${booking.refId}`);
    return { ok: false, error: "No provider email" };
  }

  const providerEmail = provider.contactEmail || process.env.SUPPORT_EMAIL;
  const providerName  = provider.name || provider.host || "Provider";
  const item          = booking.itemSnapshot || {};

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f7fafe;border-radius:12px">
  <h2 style="color:#1B6CA8">🔔 New Booking Alert</h2>
  <p>Namaste <strong>${providerName}</strong>,</p>
  <p>You have a new booking on ChaleBuddy!</p>
  <table style="width:100%;border-collapse:collapse;background:#EBF5FF;border-radius:8px;overflow:hidden">
    <tr><td style="padding:10px;color:#666">Booking Ref</td><td style="padding:10px;font-weight:700">${booking.refId}</td></tr>
    <tr style="background:#fff"><td style="padding:10px;color:#666">Guest</td><td style="padding:10px">${booking.guestName} · ${booking.guestPhone || "No phone"}</td></tr>
    <tr><td style="padding:10px;color:#666">Date</td><td style="padding:10px">${fmtDate(booking.checkInDate)}</td></tr>
    <tr style="background:#fff"><td style="padding:10px;color:#666">Type</td><td style="padding:10px">${booking.bookingType} · ${booking.nights || booking.passengers} ${booking.bookingType === "transport" ? "passengers" : "nights"}</td></tr>
    <tr><td style="padding:10px;color:#666">Amount</td><td style="padding:10px;font-weight:700;color:#1B6CA8">${inr(booking.totalAmount)}</td></tr>
  </table>
  <p style="margin-top:16px;color:#4B6080;font-size:13px">
    Please be ready to welcome your guest. For any issues, contact us at ${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}
  </p>
  <p style="color:#1B6CA8;font-weight:700">Team ChaleBuddy</p>
</div>`;

  try {
    const transporter = buildTransporter();
    await transporter.sendMail({
      from:    `"ChaleBuddy Bookings" <${process.env.EMAIL_FROM}>`,
      to:      providerEmail,
      subject: `New Booking: ${booking.refId} — Guest: ${booking.guestName}`,
      html,
    });
    logger.info(`📧 Provider alert → ${providerEmail} [${booking.refId}]`);
    return { ok: true };
  } catch (err) {
    logger.error(`📧 Provider alert FAILED [${booking.refId}]: ${err.message}`);
    return { ok: false, error: err.message };
  }
};

/* ══════════════════════════════════════════════════════════════
   3. SMS — Msg91 REST API
══════════════════════════════════════════════════════════════ */

/**
 * Send SMS via Msg91.
 * Enabled only when SMS_ENABLED=true in .env.
 * Silently skips (logs warning) when disabled.
 */
const sendSMS = async (booking) => {
  if (process.env.SMS_ENABLED !== "true") {
    logger.debug(`SMS skipped (SMS_ENABLED≠true) [${booking.refId}]`);
    return { ok: false, skipped: true };
  }
  if (!booking.guestPhone) {
    logger.warn(`SMS skipped — no phone for booking ${booking.refId}`);
    return { ok: false, skipped: true };
  }

  // Msg91 requires 10-digit Indian phone numbers
  const phone = booking.guestPhone.replace(/\D/g, "").slice(-10);

  const payload = JSON.stringify({
    template_id: process.env.MSG91_BOOKING_TEMPLATE_ID,
    short_url:   "0",
    realTimeResponse: "1",
    recipients: [{
      mobiles:    `91${phone}`,
      name:       booking.guestName,
      ref_id:     booking.refId,
      amount:     String(booking.totalAmount),
      date:       fmtDate(booking.checkInDate),
      item:       booking.itemSnapshot?.name || booking.bookingType,
    }],
  });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.msg91.com",
      path:     "/api/v5/flow/",
      method:   "POST",
      headers: {
        "Content-Type": "application/json",
        "authkey":       process.env.MSG91_AUTH_KEY,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        logger.info(`📱 SMS sent → ${phone} [${booking.refId}]: ${data}`);
        resolve({ ok: true, response: data });
      });
    });

    req.on("error", (err) => {
      logger.error(`📱 SMS FAILED [${booking.refId}]: ${err.message}`);
      resolve({ ok: false, error: err.message });   // resolve, not reject — never crash
    });

    req.setTimeout(8000, () => {
      req.destroy();
      logger.error(`📱 SMS TIMEOUT [${booking.refId}]`);
      resolve({ ok: false, error: "SMS request timed out" });
    });

    req.write(payload);
    req.end();
  });
};

/* ══════════════════════════════════════════════════════════════
   4. WHATSAPP — Twilio WhatsApp API
══════════════════════════════════════════════════════════════ */

/**
 * Send a WhatsApp message via Twilio.
 * Enabled only when WHATSAPP_ENABLED=true in .env.
 */
const sendWhatsApp = async (booking) => {
  if (process.env.WHATSAPP_ENABLED !== "true") {
    logger.debug(`WhatsApp skipped (WHATSAPP_ENABLED≠true) [${booking.refId}]`);
    return { ok: false, skipped: true };
  }
  if (!booking.guestPhone) {
    return { ok: false, skipped: true };
  }

  const phone   = booking.guestPhone.replace(/\D/g, "").replace(/^0/, "");
  const toPhone = phone.startsWith("91") ? `whatsapp:+${phone}` : `whatsapp:+91${phone}`;
  const message = [
    `✅ *Booking Confirmed!*`,
    `Ref: *${booking.refId}*`,
    `Guest: ${booking.guestName}`,
    `Item: ${booking.itemSnapshot?.name || booking.bookingType}`,
    `Date: ${fmtDate(booking.checkInDate)}`,
    `Amount: *₹${booking.totalAmount.toLocaleString("en-IN")}*`,
    ``,
    `Need help? Reply to this message or call ${process.env.SUPPORT_PHONE || "+91 98765 43210"}`,
    `_Team ChaleBuddy_ 🗺️`,
  ].join("\n");

  // Twilio uses basic auth: AccountSid:AuthToken
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone  = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

  if (!accountSid || !authToken) {
    logger.warn(`WhatsApp skipped — Twilio credentials missing [${booking.refId}]`);
    return { ok: false, skipped: true };
  }

  const payload = new URLSearchParams({ From: fromPhone, To: toPhone, Body: message }).toString();
  const auth    = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  return new Promise((resolve) => {
    const options = {
      hostname: "api.twilio.com",
      path:     `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method:   "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type":  "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        const parsed = JSON.parse(data || "{}");
        if (parsed.sid) {
          logger.info(`💬 WhatsApp sent → ${toPhone} [${booking.refId}]`);
          resolve({ ok: true, sid: parsed.sid });
        } else {
          logger.error(`💬 WhatsApp FAILED [${booking.refId}]: ${parsed.message}`);
          resolve({ ok: false, error: parsed.message });
        }
      });
    });

    req.on("error", (err) => {
      logger.error(`💬 WhatsApp ERROR [${booking.refId}]: ${err.message}`);
      resolve({ ok: false, error: err.message });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ ok: false, error: "WhatsApp request timed out" });
    });

    req.write(payload);
    req.end();
  });
};

/* ══════════════════════════════════════════════════════════════
   MASTER: notifyAll
   Runs all 4 channels in PARALLEL using Promise.allSettled so
   one failure never blocks the others.
══════════════════════════════════════════════════════════════ */

/**
 * @param {Object} booking   — Mongoose Booking document
 * @param {Object} provider  — Guide or Stay document (for provider alert)
 * @returns {Object}         — { email, sms, whatsapp, providerAlert } results
 */
const notifyAll = async (booking, provider = null) => {
  const [emailResult, smsResult, whatsappResult, providerResult] =
    await Promise.allSettled([
      sendInvoiceEmail(booking),
      sendSMS(booking),
      sendWhatsApp(booking),
      alertProvider(booking, provider),
    ]);

  const unwrap = r => r.status === "fulfilled" ? r.value : { ok: false, error: r.reason?.message };

  const results = {
    email:         unwrap(emailResult),
    sms:           unwrap(smsResult),
    whatsapp:      unwrap(whatsappResult),
    providerAlert: unwrap(providerResult),
  };

  logger.info(`🔔 Notifications for ${booking.refId}: email=${results.email.ok} sms=${results.sms.ok||results.sms.skipped} wa=${results.whatsapp.ok||results.whatsapp.skipped} provider=${results.providerAlert.ok}`);

  return results;
};

module.exports = {
  notifyAll,
  sendInvoiceEmail,
  sendSMS,
  sendWhatsApp,
  alertProvider,
};