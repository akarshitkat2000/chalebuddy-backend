const mongoose = require("mongoose");

const newsletterSchema = new mongoose.Schema(
  {
    email:    { type: String, required: true, unique: true, lowercase: true, match: [/^\S+@\S+\.\S+$/, "Invalid email"] },
    name:     { type: String, default: "" },
    active:   { type: Boolean, default: true },
    source:   { type: String, default: "website" },
    tags:     [String],
    unsubscribedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Newsletter", newsletterSchema);
