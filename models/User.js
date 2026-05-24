import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    role: {
      type: String,
      enum: ["customer", "rider"],
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: false, // Make optional for backward compatibility
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      required: false,
    },
    profilePicture: {
      type: String, // Store URL or path
      default: "",
    },
    rating: {
      type: Number,
      default: 5.0,
    },
    bio: {
      type: String,
      default: "Hi, I am a fast and safe rider.",
    }
  },
  {
    timestamps: true,
  }
);

userSchema.methods.createAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      phone: this.phone,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

userSchema.methods.createRefreshToken = function () {
  return jwt.sign(
    { id: this._id, phone: this.phone },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

const User = mongoose.model("User", userSchema);
export default User;
