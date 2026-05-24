import mongoose from 'mongoose';

const { Schema } = mongoose;

const rideSchema = new Schema(
  {
    vehicle: {
      type: String,
      enum: ["bike", "auto", "car", "cabEconomy", "cabPremium"],
      required: true,
    },
    distance: {
      type: Number,
      required: true,
    },
    pickup: {
      address: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    drop: {
      address: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    fare: {
      type: Number,
      required: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["SEARCHING_FOR_RIDER", "ACCEPTED", "ARRIVED", "STARTED", "COMPLETED"],
      default: "SEARCHING_FOR_RIDER",
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
    },
    otp: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Ride = mongoose.model("Ride", rideSchema);
export default Ride;
