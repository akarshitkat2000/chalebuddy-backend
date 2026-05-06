const mongoose = require("mongoose");

const transportSchema = new mongoose.Schema(
  {
    mode:         { type: String, enum: ["train","bus","flight"], required: true, index: true },
    opIcon:       { type: String, default: "🚂" },
    operator:     { type: String, required: true },
    number:       { type: String, required: true },
    vehicleType:  { type: String, default: "" },  // "Premium AC", "Sleeper", etc.
    from:         { type: String, required: true, index: true },
    fromCode:     { type: String, required: true },
    to:           { type: String, required: true, index: true },
    toCode:       { type: String, required: true },
    dep:          { type: String, required: true },   // "06:00"
    arr:          { type: String, required: true },
    duration:     { type: String, required: true },
    stops:        { type: String, default: "Non-Stop" },
    price:        { type: Number, required: true, min: 0 },
    avail:        { type: String, enum: ["avail","limited","waitlist"], default: "avail" },
    availText:    { type: String, default: "Seats Available" },
    availSeats:   { type: Number, default: 50 },
    sponsored:    { type: Boolean, default: false },
    details:      [String],
    active:       { type: Boolean, default: true },
    operatingDays:[{ type: String, enum: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] }],
    classes:      [{ name: String, price: Number, available: Number }],
    bookingsCount:{ type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

transportSchema.index({ mode: 1, from: 1, to: 1 });
transportSchema.index({ price: 1 });

module.exports = mongoose.model("Transport", transportSchema);
