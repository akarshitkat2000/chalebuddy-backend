const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name:     { type: String, required: [true, "Name is required"], trim: true, maxlength: 80 },
    email:    { type: String, required: [true, "Email is required"], unique: true, lowercase: true, trim: true,
                match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"] },
    password: { type: String, required: [true, "Password is required"], minlength: 6, select: false },
    role:     { type: String, enum: ["user","guide","admin"], default: "user" },
    avatar:   { type: String, default: "" },
    phone:    { type: String, default: "" },
    city:     { type: String, default: "" },
    bio:      { type: String, default: "", maxlength: 500 },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, refPath: "wishlistModel" }],
    wishlistModel: { type: String, enum: ["Stay","Guide"] },
    active:   { type: Boolean, default: true, select: false },
    verified: { type: Boolean, default: false },
    verificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLoginAt: Date,
    tripsCreated: { type: Number, default: 0 },
    bookingsMade: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method: compare passwords
userSchema.methods.correctPassword = async function (candidate, hashed) {
  return bcrypt.compare(candidate, hashed);
};

// Virtual: initials
userSchema.virtual("initials").get(function () {
  return this.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
});

module.exports = mongoose.model("User", userSchema);
