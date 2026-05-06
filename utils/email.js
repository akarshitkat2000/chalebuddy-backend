const nodemailer = require("nodemailer");
const logger = require("./logger");

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

/**
 * Send a generic email
 * @param {Object} opts  { to, subject, html, text? }
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ""),
    });
    logger.info(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email send failed: ${err.message}`);
    // Don't throw — email failure should NOT crash API requests
  }
};

// ── Specific email templates ────────────────────────────────
const sendBookingConfirmation = async ({ booking, userEmail }) => {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#1B6CA8">Booking Confirmed! 🎉</h2>
      <p>Dear <strong>${booking.guestName}</strong>,</p>
      <p>Your booking <strong>#${booking._id.toString().slice(-8).toUpperCase()}</strong> has been confirmed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#EBF5FF"><td style="padding:8px"><strong>Type</strong></td><td style="padding:8px">${booking.bookingType}</td></tr>
        <tr><td style="padding:8px"><strong>Date</strong></td><td style="padding:8px">${new Date(booking.checkInDate).toDateString()}</td></tr>
        <tr style="background:#EBF5FF"><td style="padding:8px"><strong>Total</strong></td><td style="padding:8px">₹${booking.totalAmount.toLocaleString("en-IN")}</td></tr>
        <tr><td style="padding:8px"><strong>Status</strong></td><td style="padding:8px">${booking.status}</td></tr>
      </table>
      <p style="color:#666">Thank you for choosing ChaleBuddy! Safe travels 🧳</p>
      <p style="color:#1B6CA8;font-weight:700">Team ChaleBuddy</p>
    </div>
  `;
  await sendEmail({ to: userEmail, subject: "Booking Confirmed — ChaleBuddy 🎉", html });
};

const sendContactAutoReply = async ({ name, email, subject: subj }) => {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#1B6CA8">Namaste ${name}! 🙏</h2>
      <p>We've received your message about <strong>"${subj}"</strong>.</p>
      <p>Our team will respond within <strong>24 hours</strong>. Meanwhile, enjoy exploring India! 🗺️</p>
      <p style="color:#F07B24;font-style:italic">☕ We'll reply before your chai gets cold.</p>
      <p style="color:#1B6CA8;font-weight:700">Team ChaleBuddy | hello@chalebuddy.in</p>
    </div>
  `;
  await sendEmail({ to: email, subject: "We received your message — ChaleBuddy", html });
};

const sendGuideApplicationEmail = async ({ application }) => {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#1B6CA8">Application Received! 🏆</h2>
      <p>Dear <strong>${application.fullName}</strong>,</p>
      <p>Your guide application has been received. Our team will review and contact you at <strong>${application.phone}</strong> within <strong>48 hours</strong>.</p>
      <p style="color:#F07B24;font-weight:600">Start preparing your best local stories! 🗺️</p>
      <p style="color:#1B6CA8;font-weight:700">Team ChaleBuddy</p>
    </div>
  `;
  await sendEmail({ to: application.email, subject: "Guide Application Received — ChaleBuddy 🏆", html });
};

module.exports = { sendEmail, sendBookingConfirmation, sendContactAutoReply, sendGuideApplicationEmail };
