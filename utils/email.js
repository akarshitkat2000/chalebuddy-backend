/**
 * utils/email.js — Uses Resend API (HTTP, no SMTP needed)
 * Works perfectly on Render free tier
 * Install: npm install resend
 */
const { Resend } = require("resend");
const logger     = require("./logger");

let resend = null;

const getClient = () => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

/* ── Verify connection ─────────────────────────────────────── */
const verifyEmailConnection = async () => {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("⚠️ RESEND_API_KEY not set — email notifications disabled");
    return false;
  }
  logger.info(`✅ Email ready via Resend API`);
  return true;
};

/* ── Send email ────────────────────────────────────────────── */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("⚠️ Email skipped — RESEND_API_KEY missing");
    return false;
  }

  const from = `${process.env.EMAIL_FROM_NAME || "ChaleBuddy"} <${process.env.EMAIL_FROM || "onboarding@resend.dev"}>`;

  try {
    const client = getClient();
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, "") || "",
    });

    if (error) {
      logger.error(`❌ Email failed to ${to}: ${error.message}`);
      return false;
    }

    logger.info(`📧 Email sent to ${to}: ${subject} [${data?.id}]`);
    return true;
  } catch (err) {
    logger.error(`❌ Email error: ${err.message}`);
    return false;
  }
};

/* ── Invoice email ─────────────────────────────────────────── */
const sendInvoiceEmail = async (booking) => {
  const {
    refId, guestName, guestEmail, bookingType,
    totalAmount, taxes, basePrice,
    checkInDate, nights, passengers,
    itemSnapshot = {},
  } = booking;

  const formattedDate = checkInDate
    ? new Date(checkInDate).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })
    : "N/A";

  const typeLabel = {
    stay:      "🏠 Stay Booking",
    guide:     "🧭 Guide Booking",
    transport: "🚂 Transport Booking",
    food_tour: "🍛 Food Tour",
  }[bookingType] || "Booking";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#060d1a,#0d2040);padding:2rem;text-align:center;">
      <h1 style="color:white;font-size:1.6rem;margin:0 0 .25rem;font-family:Georgia,serif;">ChaleBuddy</h1>
      <p style="color:rgba(255,255,255,.6);font-size:.85rem;margin:0;">Solo Travelers Welcome 🎒</p>
    </div>
    <div style="background:#ECFDF5;padding:1.5rem;text-align:center;border-bottom:1px solid #D1FAE5;">
      <div style="font-size:2.5rem;margin-bottom:.5rem;">✅</div>
      <h2 style="color:#065F46;margin:0;font-size:1.2rem;">Booking Confirmed!</h2>
      <p style="color:#059669;margin:.25rem 0 0;font-size:.85rem;">Ref: <strong>${refId}</strong></p>
    </div>
    <div style="padding:1.75rem;">
      <p style="color:#4B6080;margin:0 0 1.25rem;">Hi <strong style="color:#0B1628;">${guestName}</strong>, your booking is confirmed!</p>
      <div style="background:#F7FAFE;border-radius:10px;padding:1.25rem;margin-bottom:1.25rem;border:1px solid #D8E4F0;">
        <div style="font-size:.72rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#8FA4BE;margin-bottom:.75rem;">${typeLabel}</div>
        ${itemSnapshot.name ? `<div style="font-weight:700;color:#0B1628;font-size:1rem;margin-bottom:.3rem;">${itemSnapshot.name}</div>` : ""}
        ${itemSnapshot.city ? `<div style="color:#4B6080;font-size:.85rem;">📍 ${itemSnapshot.city}${itemSnapshot.area ? `, ${itemSnapshot.area}` : ""}</div>` : ""}
        ${itemSnapshot.from ? `<div style="color:#4B6080;font-size:.85rem;">🚂 ${itemSnapshot.from} → ${itemSnapshot.to}</div>` : ""}
        <div style="color:#4B6080;font-size:.85rem;margin-top:.3rem;">📅 ${formattedDate}${nights > 1 ? ` · ${nights} nights` : ""}${passengers > 1 ? ` · ${passengers} passengers` : ""}</div>
      </div>
      <div style="border:1px solid #D8E4F0;border-radius:10px;overflow:hidden;margin-bottom:1.5rem;">
        <div style="display:flex;justify-content:space-between;padding:.75rem 1rem;font-size:.85rem;color:#4B6080;border-bottom:1px solid #D8E4F0;">
          <span>Base Amount</span><span>₹${(basePrice || 0).toLocaleString("en-IN")}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:.75rem 1rem;font-size:.85rem;color:#4B6080;border-bottom:1px solid #D8E4F0;">
          <span>GST (5%)</span><span>₹${(taxes || 0).toLocaleString("en-IN")}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:.75rem 1rem;font-weight:700;color:#0B1628;background:#F7FAFE;">
          <span>Total Paid</span><span style="color:#1B6CA8;">₹${(totalAmount || 0).toLocaleString("en-IN")}</span>
        </div>
      </div>
      <p style="color:#4B6080;font-size:.85rem;line-height:1.7;margin:0;">
        Need help? Email us at <a href="mailto:${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}" style="color:#1B6CA8;">${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}</a>
      </p>
    </div>
    <div style="background:#F7FAFE;padding:1.25rem;text-align:center;border-top:1px solid #D8E4F0;">
      <p style="color:#8FA4BE;font-size:.75rem;margin:0;">© 2024 ChaleBuddy · chalebuddy.in · Made with ❤️ in India</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({
    to:      guestEmail,
    subject: `✅ Booking Confirmed — ${refId} | ChaleBuddy`,
    html,
  });
};

/* ── Guide application email ───────────────────────────────── */
const sendGuideApplicationEmail = async ({ name, email, city }) => {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
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
      <p style="color:#8FA4BE;font-size:.8rem;">Questions? Email us at <a href="mailto:${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}" style="color:#1B6CA8;">${process.env.SUPPORT_EMAIL || "hello@chalebuddy.in"}</a></p>
    </div>
    <div style="background:#F7FAFE;padding:1rem;text-align:center;border-top:1px solid #D8E4F0;">
      <p style="color:#8FA4BE;font-size:.75rem;margin:0;">© 2024 ChaleBuddy · chalebuddy.in</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmail({
    to:      email,
    subject: `Guide Application Received — ChaleBuddy 🏆`,
    html,
  });
};

module.exports = {
  sendEmail,
  sendInvoiceEmail,
  sendGuideApplicationEmail,
  verifyEmailConnection,
};