/**
 * utils/notificationService.js
 * Uses Resend HTTP API directly — no nodemailer, no SMTP
 */
const https  = require("https");
const logger = require("./logger");

/* ── Send via Resend HTTP API ────────────────────────────────── */
const sendViaResend = ({ to, subject, html }) => {
  return new Promise((resolve, reject) => {
    if (!process.env.RESEND_API_KEY) {
      logger.warn("⚠️ RESEND_API_KEY not set — skipping email");
      return resolve(false);
    }

    const from = `${process.env.EMAIL_FROM_NAME || "ChaleBuddy"} <${process.env.EMAIL_FROM || "onboarding@resend.dev"}>`;

    const body = JSON.stringify({ from, to, subject, html });

    const options = {
      hostname: "api.resend.com",
      port:     443,
      path:     "/emails",
      method:   "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info(`📧 Email sent to ${to}: ${subject}`);
          resolve(true);
        } else {
          logger.error(`❌ Resend error ${res.statusCode}: ${data}`);
          resolve(false);
        }
      });
    });

    req.on("error", err => {
      logger.error(`❌ Email request failed: ${err.message}`);
      resolve(false);
    });

    req.write(body);
    req.end();
  });
};

/* ── Invoice HTML ─────────────────────────────────────────────── */
const invoiceHtml = (booking) => {
  const {
    refId, guestName, bookingType,
    totalAmount = 0, taxes = 0, basePrice = 0,
    checkInDate, nights = 1, passengers = 1,
    itemSnapshot = {},
  } = booking;

  const date = checkInDate
    ? new Date(checkInDate).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })
    : "N/A";

  const typeLabel = { stay:"🏠 Stay", guide:"🧭 Guide", transport:"🚂 Transport", food_tour:"🍛 Food Tour" }[bookingType] || "Booking";

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#060d1a,#0d2040);padding:2rem;text-align:center;">
    <h1 style="color:white;font-size:1.6rem;margin:0;font-family:Georgia,serif;">ChaleBuddy</h1>
    <p style="color:rgba(255,255,255,.6);font-size:.85rem;margin:.25rem 0 0;">Solo Travelers Welcome 🎒</p>
  </div>
  <div style="background:#ECFDF5;padding:1.5rem;text-align:center;border-bottom:1px solid #D1FAE5;">
    <div style="font-size:2.5rem;">✅</div>
    <h2 style="color:#065F46;margin:.5rem 0 0;font-size:1.2rem;">Booking Confirmed!</h2>
    <p style="color:#059669;margin:.25rem 0 0;font-size:.85rem;">Ref: <strong>${refId}</strong></p>
  </div>
  <div style="padding:1.75rem;">
    <p style="color:#4B6080;margin:0 0 1.25rem;">Hi <strong style="color:#0B1628;">${guestName}</strong>, your booking is confirmed!</p>
    <div style="background:#F7FAFE;border-radius:10px;padding:1.25rem;margin-bottom:1.25rem;border:1px solid #D8E4F0;">
      <div style="font-size:.72rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#8FA4BE;margin-bottom:.75rem;">${typeLabel}</div>
      ${itemSnapshot.name ? `<div style="font-weight:700;color:#0B1628;font-size:1rem;margin-bottom:.3rem;">${itemSnapshot.name}</div>` : ""}
      ${itemSnapshot.city ? `<div style="color:#4B6080;font-size:.85rem;">📍 ${itemSnapshot.city}</div>` : ""}
      ${itemSnapshot.from ? `<div style="color:#4B6080;font-size:.85rem;">🚂 ${itemSnapshot.from} → ${itemSnapshot.to}</div>` : ""}
      <div style="color:#4B6080;font-size:.85rem;margin-top:.3rem;">📅 ${date}${nights > 1 ? ` · ${nights} nights` : ""}${passengers > 1 ? ` · ${passengers} passengers` : ""}</div>
    </div>
    <div style="border:1px solid #D8E4F0;border-radius:10px;overflow:hidden;margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;padding:.75rem 1rem;font-size:.85rem;color:#4B6080;border-bottom:1px solid #D8E4F0;">
        <span>Base Amount</span><span>₹${basePrice.toLocaleString("en-IN")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:.75rem 1rem;font-size:.85rem;color:#4B6080;border-bottom:1px solid #D8E4F0;">
        <span>GST (5%)</span><span>₹${taxes.toLocaleString("en-IN")}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:.75rem 1rem;font-weight:700;color:#0B1628;background:#F7FAFE;">
        <span>Total Paid</span><span style="color:#1B6CA8;">₹${totalAmount.toLocaleString("en-IN")}</span>
      </div>
    </div>
    <p style="color:#4B6080;font-size:.85rem;line-height:1.7;margin:0;">
      Need help? Email us at <a href="mailto:${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}" style="color:#1B6CA8;">${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}</a>
    </p>
  </div>
  <div style="background:#F7FAFE;padding:1.25rem;text-align:center;border-top:1px solid #D8E4F0;">
    <p style="color:#8FA4BE;font-size:.75rem;margin:0;">© 2024 ChaleBuddy · chalebuddy.in · Made with ❤️ in India</p>
  </div>
</div></body></html>`;
};

/* ── Guide application HTML ───────────────────────────────────── */
const guideAppHtml = ({ name, city }) => `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
<div style="max-width:520px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#060d1a,#0d2040);padding:2rem;text-align:center;">
    <h1 style="color:white;font-size:1.6rem;margin:0;font-family:Georgia,serif;">ChaleBuddy 🏆</h1>
  </div>
  <div style="padding:2rem;">
    <h2 style="color:#0B1628;font-family:Georgia,serif;">Application Received!</h2>
    <p style="color:#4B6080;line-height:1.7;">Hi <strong>${name}</strong>, thank you for applying to become a ChaleBuddy guide in <strong>${city}</strong>!</p>
    <p style="color:#4B6080;line-height:1.7;">Our team will review your application and get back to you within <strong>2-3 business days</strong>.</p>
    <div style="background:#F7FAFE;border-radius:10px;padding:1.25rem;margin:1.25rem 0;border-left:3px solid #F07B24;">
      <p style="color:#0B1628;margin:0;font-size:.9rem;line-height:1.7;"><strong>What happens next?</strong><br/>
      1. Our team reviews your profile<br/>
      2. We schedule a quick video call<br/>
      3. You go live on ChaleBuddy! 🎉</p>
    </div>
  </div>
  <div style="background:#F7FAFE;padding:1rem;text-align:center;border-top:1px solid #D8E4F0;">
    <p style="color:#8FA4BE;font-size:.75rem;margin:0;">© 2024 ChaleBuddy · chalebuddy.in</p>
  </div>
</div></body></html>`;

/* ── Main notify function ─────────────────────────────────────── */
const notifyAll = async (booking) => {
  const { refId, guestEmail, guestName } = booking;

  const results = await Promise.allSettled([
    // Invoice to guest
    sendViaResend({
      to:      guestEmail,
      subject: `✅ Booking Confirmed — ${refId} | ChaleBuddy`,
      html:    invoiceHtml(booking),
    }),

    // Alert to admin
    process.env.SUPPORT_EMAIL ? sendViaResend({
      to:      process.env.SUPPORT_EMAIL,
      subject: `🔔 New Booking ${refId} — ${booking.bookingType}`,
      html:    `<p>New booking from <strong>${guestName}</strong> (${guestEmail})</p><p>Ref: ${refId}</p><p>Type: ${booking.bookingType}</p><p>Total: ₹${booking.totalAmount}</p>`,
    }) : Promise.resolve(false),
  ]);

  const emailOk   = results[0].status === "fulfilled" && results[0].value;
  const providerOk = results[1].status === "fulfilled" && results[1].value;

  logger.info(`🔔 Notifications for ${refId}: email=${emailOk} provider=${providerOk}`);
  return { emailOk, providerOk };
};

/* ── Standalone email helpers ─────────────────────────────────── */
const sendInvoiceEmail = async (booking) => {
  return sendViaResend({
    to:      booking.guestEmail,
    subject: `✅ Booking Confirmed — ${booking.refId} | ChaleBuddy`,
    html:    invoiceHtml(booking),
  });
};

const sendGuideApplicationEmail = async ({ name, email, city }) => {
  return sendViaResend({
    to:      email,
    subject: `Guide Application Received — ChaleBuddy 🏆`,
    html:    guideAppHtml({ name, city }),
  });
};

module.exports = {
  notifyAll,
  sendInvoiceEmail,
  sendGuideApplicationEmail,
  sendViaResend,
};