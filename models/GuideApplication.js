const mongoose = require("mongoose");

const guideApplicationSchema = new mongoose.Schema(
  {
    fullName:   { type: String, required: true, trim: true },
    email:      { type: String, required: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, "Invalid email"] },
    phone:      { type: String, required: true },
    age:        { type: Number, required: true, min: [15, "Must be at least 15 years old"] },
    location:   { type: String, required: true },
    experience: { type: String, enum: ["Local Expert (No License Needed!)","Professional Licensed Guide","Food & Cuisine Expert","First Time (No Experience OK!)"], required: true },
    about:      { type: String, required: true, maxlength: 2000 },
    languages:  [String],

    // ── Uploaded file paths ──────────────────────────────────
    // Single profile picture (used as guide avatar on approval)
    profilePic:    { type: String, default: "" },
    // Government-issued identity proof (Aadhaar, PAN, etc.)
    identityProof: { type: String, default: "" },
    // Backward-compat alias — set to profilePic when present
    img:           { type: String, default: "" },

    status:     { type: String, enum: ["pending","under_review","approved","rejected"], default: "pending", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    rejectionReason: String,
    guideProfile: { type: mongoose.Schema.Types.ObjectId, ref: "Guide" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GuideApplication", guideApplicationSchema);
