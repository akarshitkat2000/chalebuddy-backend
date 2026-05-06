const Contact    = require("../models/Contact");
const Newsletter = require("../models/Newsletter");
const AppError   = require("../utils/AppError");
const { sendContactAutoReply, sendEmail } = require("../utils/email");
const logger     = require("../utils/logger");

// POST /api/contact
exports.submitContact = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    const contact = await Contact.create({
      name, email, phone, subject, message,
      ip: req.ip,
      source: req.headers["x-source"] || "website",
    });

    // Auto-reply to sender
    await sendContactAutoReply({ name, email, subject });

    // Notify admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `New Contact: ${subject} — from ${name}`,
      html: `<p><strong>${name}</strong> (${email}) sent a message:</p><blockquote>${message}</blockquote>`,
    });

    logger.info(`Contact form submitted by ${email}: ${subject}`);
    res.status(201).json({ status: "success", message: "Message sent! We'll respond within 24 hours.", data: { id: contact._id } });
  } catch (err) { next(err); }
};

// GET /api/contact — Admin
exports.getAllContacts = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { status } : {};
    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort("-createdAt").skip((page - 1) * limit).limit(parseInt(limit)),
      Contact.countDocuments(filter),
    ]);
    res.status(200).json({ status: "success", results: contacts.length, total, data: { contacts } });
  } catch (err) { next(err); }
};

// PATCH /api/contact/:id/status — Admin
exports.updateContactStatus = async (req, res, next) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!contact) return next(new AppError("Contact not found.", 404));
    res.status(200).json({ status: "success", data: { contact } });
  } catch (err) { next(err); }
};

// POST /api/newsletter/subscribe
exports.subscribe = async (req, res, next) => {
  try {
    const { email, name } = req.body;
    if (!email) return next(new AppError("Email is required.", 400));

    const exists = await Newsletter.findOne({ email });
    if (exists) {
      if (!exists.active) {
        exists.active = true;
        await exists.save();
        return res.status(200).json({ status: "success", message: "Welcome back! You have been re-subscribed." });
      }
      return res.status(200).json({ status: "success", message: "You are already subscribed! 🎉" });
    }

    await Newsletter.create({ email, name });
    await sendEmail({
      to: email,
      subject: "Welcome to ChaleBuddy Newsletter! 🗺️",
      html: `<h2>Namaste ${name || "Explorer"}!</h2><p>You're now on our newsletter. Solo traveler tips incoming! 🎒</p>`,
    });

    logger.info(`Newsletter subscription: ${email}`);
    res.status(201).json({ status: "success", message: "Subscribed successfully! 🎉" });
  } catch (err) { next(err); }
};

// POST /api/newsletter/unsubscribe
exports.unsubscribe = async (req, res, next) => {
  try {
    const { email } = req.body;
    const sub = await Newsletter.findOneAndUpdate(
      { email },
      { active: false, unsubscribedAt: new Date() },
      { new: true }
    );
    if (!sub) return next(new AppError("Email not found in our list.", 404));
    res.status(200).json({ status: "success", message: "Unsubscribed successfully." });
  } catch (err) { next(err); }
};
