const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name:      { type: String, required: [true, "Name is required"], trim: true, maxlength: 100 },
    email:     { type: String, required: [true, "Email is required"], lowercase: true,
                 match: [/^\S+@\S+\.\S+$/, "Invalid email"] },
    phone:     { type: String, default: "" },
    subject:   { type: String, required: [true, "Subject is required"],
                 enum: ["Trip Planning","Guide Related","Become a Guide","Partnership","Other","Complaint","Feedback"],
                 default: "Trip Planning" },
    message:   { type: String, required: [true, "Message is required"], maxlength: 2000 },
    status:    { type: String, enum: ["new","read","replied","archived"], default: "new", index: true },
    repliedAt: Date,
    repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    adminNotes:{ type: String, default: "" },
    ip:        String,
    source:    { type: String, default: "website" },
  },
  { timestamps: true }
);

contactSchema.index({ createdAt: -1 });
contactSchema.index({ email: 1 });

module.exports = mongoose.model("Contact", contactSchema);
