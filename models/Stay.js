const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name:    String,
    rating:  { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// One entry per confirmed booking — blocks dates after payment
const dateBlockSchema = new mongoose.Schema({
  booking:   { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  checkIn:   { type: Date, required: true },
  checkOut:  { type: Date, required: true },
  stayType:  { type: String, enum: ["quick", "overnight"], default: "overnight" },
  guestName: { type: String, default: "" },
}, { _id: false });

const staySchema = new mongoose.Schema(
  {
    name:           { type: String, required: [true, "Stay name is required"], trim: true },
    slug:           { type: String, unique: true, lowercase: true },
    city:           { type: String, required: true, index: true },
    area:           { type: String, default: "" },
    state:          { type: String, default: "" },
    host:           { type: String, required: true },
    hostInitials:   { type: String, default: "" },
    hostUser:       { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    img:            { type: String, required: true },
    gallery:        [String],
    rating:         { type: Number, default: 4.5, min: 1, max: 5 },
    reviews:        [reviewSchema],
    ratingCount:    { type: Number, default: 0 },
    quickPrice:     { type: Number, required: true },
    overnightPrice: { type: Number, required: true },
    amenities:      [String],
    type:           { type: String, enum: ["homestay", "quick", "overnight"], required: true, index: true },
    verified:       { type: Boolean, default: false },
    featured:       { type: Boolean, default: false },
    available:      { type: Boolean, default: true },
    maxGuests:      { type: Number, default: 2 },
    rooms:          { type: Number, default: 1 },
    bathrooms:      { type: Number, default: 1 },
    description:    { type: String, default: "", maxlength: 2000 },
    rules:          [String],
    latitude:       Number,
    longitude:      Number,
    tags:           [String],
    bookingsCount:  { type: Number, default: 0 },

    // Availability calendar — populated after payment confirmed
    blockedDates:   [dateBlockSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

staySchema.index({ city: 1, type: 1 });
staySchema.index({ rating: -1 });
staySchema.index({ name: "text", city: "text", area: "text" });
staySchema.index({ "blockedDates.checkIn": 1, "blockedDates.checkOut": 1 });

staySchema.pre("save", function (next) {
  if (this.isModified("name") || this.isNew) {
    const slugify = require("slugify");
    this.slug = slugify(`${this.name}-${this.city}`, { lower: true, strict: true });
  }
  if (this.isModified("host") && !this.hostInitials) {
    this.hostInitials = this.host.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }
  next();
});

staySchema.methods.recalcRating = function () {
  if (!this.reviews.length) { this.rating = 0; this.ratingCount = 0; return; }
  const avg = this.reviews.reduce((s, r) => s + r.rating, 0) / this.reviews.length;
  this.rating = Math.round(avg * 10) / 10;
  this.ratingCount = this.reviews.length;
};

/**
 * isDateRangeAvailable
 * Returns true if checkIn→checkOut does NOT overlap any existing blockedDate.
 * Called in bookingController before creating a stay booking.
 *
 * @param {Date} checkIn
 * @param {Date} checkOut
 * @param {string|null} excludeBookingId - skip this booking (for amendments)
 */
staySchema.methods.isDateRangeAvailable = function (checkIn, checkOut, excludeBookingId = null) {
  return !this.blockedDates.some(block => {
    if (excludeBookingId && String(block.booking) === String(excludeBookingId)) return false;
    // Overlap condition: newStart < existingEnd AND newEnd > existingStart
    return new Date(checkIn) < new Date(block.checkOut) &&
           new Date(checkOut) > new Date(block.checkIn);
  });
};

module.exports = mongoose.model("Stay", staySchema);
