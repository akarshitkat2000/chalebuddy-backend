const mongoose = require("mongoose");

const joinRequestSchema = new mongoose.Schema({
  user:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name:    String,
  message: String,
  status:  { type: String, enum: ["pending","accepted","rejected"], default: "pending" },
}, { timestamps: true });

const tripSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true, maxlength: 150 },
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    creatorName: { type: String, required: true },
    destination: { type: String, required: [true, "Destination is required"] },
    state:       String,
    travelDate:  { type: Date, required: true },
    duration:    { type: String, required: true },
    budget:      { type: String, enum: ["Budget (Below ₹5k)","Mid-range (₹5k–₹15k)","Premium (₹15k–₹40k)","Luxury (₹40k+)"], required: true },
    interests:   [String],
    description: { type: String, maxlength: 2000 },
    img:         { type: String, default: "" },
    maxBuddies:  { type: Number, default: 3, min: 1, max: 10 },
    joinRequests:[joinRequestSchema],
    buddiesCount:{ type: Number, default: 0 },
    gender:      { type: String, enum: ["Any","Male","Female"], default: "Any" },
    active:      { type: Boolean, default: true },
    featured:    { type: Boolean, default: false },
    tags:        [String],
    views:       { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

tripSchema.index({ destination: 1 });
tripSchema.index({ travelDate: 1 });
tripSchema.index({ title: "text", destination: "text", description: "text" });

module.exports = mongoose.model("Trip", tripSchema);
