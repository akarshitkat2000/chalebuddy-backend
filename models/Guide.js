const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name:    String,
    rating:  { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 1000 },
  },
  { timestamps: true }
);

// One entry per confirmed booking — blocks guide's calendar
const dateBlockSchema = new mongoose.Schema({
  booking:   { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },
  guestName: { type: String, default: "" },
}, { _id: false });

const guideSchema = new mongoose.Schema(
  {
    name:        { type: String, required: [true, "Guide name is required"], trim: true },
    slug:        { type: String, unique: true, lowercase: true },
    city:        { type: String, required: true, index: true },
    state:       { type: String, default: "" },
    type:        { type: String, enum: ["Heritage","Spiritual","Trekking","Food","Nature","Adventure","Culture","Photography"], required: true, index: true },
    languages:   [{ type: String }],
    tags:        [String],
    rate:        { type: Number, required: true, min: 100 },
    minDays:     { type: Number, default: 1 },
    maxDays:     { type: Number, default: 30 },
    rating:      { type: Number, default: 4.5, min: 1, max: 5 },
    ratingCount: { type: Number, default: 0 },
    trips:       { type: Number, default: 0 },
    img:         { type: String, default: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=70" },
    gallery:     [String],
    verified:    { type: Boolean, default: false },
    featured:    { type: Boolean, default: false },
    available:   { type: Boolean, default: true },
    bio:         { type: String, default: "", maxlength: 1000 },
    experience:  { type: Number, default: 1 },
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviews:     [reviewSchema],
    highlights:  [String],
    inclusions:  [String],
    exclusions:  [String],
    bookingsCount: { type: Number, default: 0 },
    contactEmail:  { type: String, default: "" },
    contactPhone:  { type: String, default: "" },

    // Availability calendar — populated after payment confirmed
    bookedDates: [dateBlockSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

guideSchema.index({ city: 1, type: 1 });
guideSchema.index({ rating: -1 });
guideSchema.index({ name: "text", city: "text", tags: "text" });
guideSchema.index({ "bookedDates.startDate": 1, "bookedDates.endDate": 1 });

guideSchema.pre("save", function (next) {
  if (this.isModified("name") || this.isNew) {
    const slugify = require("slugify");
    this.slug = slugify(`${this.name}-${this.city}`, { lower: true, strict: true });
  }
  next();
});

guideSchema.methods.recalcRating = function () {
  if (!this.reviews.length) { this.rating = 0; this.ratingCount = 0; return; }
  const avg = this.reviews.reduce((s, r) => s + r.rating, 0) / this.reviews.length;
  this.rating = Math.round(avg * 10) / 10;
  this.ratingCount = this.reviews.length;
};

/**
 * isAvailableForDates
 * Returns true if startDate→endDate does NOT overlap any existing bookedDate.
 * Called in bookingController before creating a guide booking.
 *
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string|null} excludeBookingId - skip this booking (for amendments)
 */
guideSchema.methods.isAvailableForDates = function (startDate, endDate, excludeBookingId = null) {
  return !this.bookedDates.some(block => {
    if (excludeBookingId && String(block.booking) === String(excludeBookingId)) return false;
    // Overlap: newStart < existingEnd AND newEnd > existingStart
    return new Date(startDate) < new Date(block.endDate) &&
           new Date(endDate)   > new Date(block.startDate);
  });
};

module.exports = mongoose.model("Guide", guideSchema);
