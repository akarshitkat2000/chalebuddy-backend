const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // ── Who is booking ───────────────────────────────────────
    user:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    guestName:  { type: String, required: [true, "Guest name is required"], trim: true },
    guestEmail: { type: String, required: [true, "Email is required"], lowercase: true,
                  match: [/^\S+@\S+\.\S+$/, "Invalid email"] },
    guestPhone: { type: String, default: "" },

    // ── What is being booked ─────────────────────────────────
    bookingType:  { type: String, enum: ["stay","transport","guide","food_tour"], required: true, index: true },
    stay:         { type: mongoose.Schema.Types.ObjectId, ref: "Stay" },
    transport:    { type: mongoose.Schema.Types.ObjectId, ref: "Transport" },
    guide:        { type: mongoose.Schema.Types.ObjectId, ref: "Guide" },
    itemSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Booking details ──────────────────────────────────────
    stayType:    { type: String, enum: ["quick","overnight",""], default: "" },
    checkInDate: { type: Date, required: true },
    checkOutDate:{ type: Date },
    nights:      { type: Number, default: 1, min: 1 },
    passengers:  { type: Number, default: 1, min: 1 },
    travelClass: { type: String, default: "Standard" },
    notes:       { type: String, maxlength: 500 },

    // ── Pricing ──────────────────────────────────────────────
    basePrice:   { type: Number, required: true },
    taxes:       { type: Number, default: 0 },
    discount:    { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency:    { type: String, default: "INR" },

    // ── Payment ──────────────────────────────────────────────
    paymentStatus: {
      type: String,
      // "pending" = not paid yet, "paid" = captured, "failed", "refunded"
      enum: ["pending","paid","failed","refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      // "razorpay" = online via Razorpay, "cod" = cash/pay at venue
      enum: ["online","upi","card","cash","cod","razorpay"],
      default: "cod",
    },
    paymentId:         { type: String, default: "" },   // razorpay payment_id after capture
    orderId:           { type: String, default: "" },   // razorpay order_id
    razorpaySignature: { type: String, default: "" },
    paidAt:            { type: Date },

    // ── Booking status ───────────────────────────────────────
    status: {
      type: String,
      // "awaiting_payment" = razorpay order created, waiting for user to pay
      enum: ["awaiting_payment","pending","confirmed","cancelled","completed","no_show"],
      default: "awaiting_payment",
      index: true,
    },
    cancelReason: String,
    cancelledAt:  Date,

    // ── Notifications sent ───────────────────────────────────
    notifications: {
      emailSent:       { type: Boolean, default: false },
      smsSent:         { type: Boolean, default: false },
      whatsappSent:    { type: Boolean, default: false },
      providerAlerted: { type: Boolean, default: false },
    },

    // ── Internal ref ─────────────────────────────────────────
    refId: { type: String, unique: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

bookingSchema.index({ guestEmail: 1 });
bookingSchema.index({ orderId: 1 });
bookingSchema.index({ createdAt: -1 });

// Auto-generate booking ref (CB + base36 timestamp)
bookingSchema.pre("save", function (next) {
  if (!this.refId) {
    this.refId = `CB${Date.now().toString(36).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);