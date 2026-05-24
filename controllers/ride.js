import Ride from "../models/Ride.js";
import { BadRequestError, NotFoundError } from "../errors/index.js";
import { StatusCodes } from "http-status-codes";
import {
  calculateDistance,
  calculateFare,
  generateOTP,
} from "../utils/mapUtils.js";

export const createRide = async (req, res) => {
  // Only customers can create rides
  if (req.user.role !== "customer") {
    throw new BadRequestError("Only customers can book rides");
  }

  const { vehicle, pickup, drop, offeredFare } = req.body;

  if (!vehicle || !pickup || !drop) {
    throw new BadRequestError("Vehicle, pickup, and drop details are required");
  }

  const {
    address: pickupAddress,
    latitude: pickupLat,
    longitude: pickupLon,
  } = pickup;

  const { address: dropAddress, latitude: dropLat, longitude: dropLon } = drop;

  if (
    !pickupAddress ||
    pickupLat === undefined ||
    pickupLon === undefined ||
    !dropAddress ||
    dropLat === undefined ||
    dropLon === undefined
  ) {
    throw new BadRequestError("Complete pickup and drop details are required");
  }

  const validVehicles = ["bike", "auto", "car", "cabEconomy", "cabPremium"];
  if (!validVehicles.includes(vehicle)) {
    throw new BadRequestError(`Invalid vehicle type. Must be one of: ${validVehicles.join(", ")}`);
  }

  const customer = req.user;

  try {
    const distance = calculateDistance(pickupLat, pickupLon, dropLat, dropLon);
    const calculatedFare = calculateFare(distance);
    const finalFare = offeredFare ? Number(offeredFare) : calculatedFare[vehicle];

    const ride = new Ride({
      vehicle,
      distance,
      fare: finalFare,
      pickup: {
        address: pickupAddress,
        latitude: pickupLat,
        longitude: pickupLon,
      },
      drop: { address: dropAddress, latitude: dropLat, longitude: dropLon },
      customer: customer.id,
      otp: generateOTP(),
    });

    await ride.save();

    // Populate customer field before sending response
    await ride.populate("customer", "phone role");

    res.status(StatusCodes.CREATED).json({
      message: "Ride created successfully",
      ride,
    });
  } catch (error) {
    console.error(error);
    if (error.statusCode) throw error; // re-throw custom errors
    throw new BadRequestError("Failed to create ride");
  }
};

export const acceptRide = async (req, res) => {
  // Only riders can accept rides
  if (req.user.role !== "rider") {
    throw new BadRequestError("Only riders can accept rides");
  }

  const riderId = req.user.id;
  const { rideId } = req.params;

  if (!rideId) {
    throw new BadRequestError("Ride ID is required");
  }

  try {
    let ride = await Ride.findById(rideId).populate("customer");

    if (!ride) {
      throw new NotFoundError("Ride not found");
    }

    if (ride.status !== "SEARCHING_FOR_RIDER") {
      throw new BadRequestError("Ride is no longer available for assignment");
    }

    ride.rider = riderId;
    ride.status = "ACCEPTED";
    await ride.save();

    // Mongoose 8.x: populate returns a new document, need await
    ride = await Ride.findById(rideId).populate("customer rider");

    req.io.to(`ride_${rideId}`).emit("rideUpdate", ride);
    req.io.to(`ride_${rideId}`).emit("rideAccepted");

    res.status(StatusCodes.OK).json({
      message: "Ride accepted successfully",
      ride,
    });
  } catch (error) {
    console.error("Error accepting ride:", error);
    if (error.statusCode) throw error; // re-throw custom errors (NotFoundError etc.)
    throw new BadRequestError("Failed to accept ride");
  }
};

export const updateRideStatus = async (req, res) => {
  const { rideId } = req.params;
  const { status } = req.body;

  if (!rideId || !status) {
    throw new BadRequestError("Ride ID and status are required");
  }

  try {
    let ride = await Ride.findById(rideId).populate("customer rider");

    if (!ride) {
      throw new NotFoundError("Ride not found");
    }

    // Only the assigned rider can update ride status
    if (!ride.rider || ride.rider._id.toString() !== req.user.id) {
      throw new BadRequestError("Only the assigned rider can update ride status");
    }

    const validStatuses = ["ACCEPTED", "ARRIVED", "STARTED", "COMPLETED"];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid ride status. Must be one of: ${validStatuses.join(", ")}`);
    }

    ride.status = status;
    await ride.save();

    req.io.to(`ride_${rideId}`).emit("rideUpdate", ride);

    res.status(StatusCodes.OK).json({
      message: `Ride status updated to ${status}`,
      ride,
    });
  } catch (error) {
    console.error("Error updating ride status:", error);
    if (error.statusCode) throw error;
    throw new BadRequestError("Failed to update ride status");
  }
};

export const getMyRides = async (req, res) => {
  const userId = req.user.id;
  const { status } = req.query;

  try {
    const query = {
      $or: [{ customer: userId }, { rider: userId }],
    };

    if (status) {
      query.status = status;
    }

    const rides = await Ride.find(query)
      .populate("customer", "phone role")
      .populate("rider", "phone role")
      .sort({ createdAt: -1 });

    res.status(StatusCodes.OK).json({
      message: "Rides retrieved successfully",
      count: rides.length,
      rides,
    });
  } catch (error) {
    console.error("Error retrieving rides:", error);
    throw new BadRequestError("Failed to retrieve rides");
  }
};

export const verifyOTP = async (req, res) => {
  const { rideId } = req.params;
  const { otp } = req.body;

  if (!rideId || !otp) {
    throw new BadRequestError("Ride ID and OTP are required");
  }

  try {
    let ride = await Ride.findById(rideId).populate("customer rider");
    if (!ride) throw new NotFoundError("Ride not found");

    if (!ride.rider || ride.rider._id.toString() !== req.user.id) {
      throw new BadRequestError("Only the assigned rider can verify OTP");
    }

    if (ride.otp !== otp) {
      throw new BadRequestError("Invalid OTP");
    }

    if (ride.status !== "ARRIVED") {
      throw new BadRequestError("Ride must be in ARRIVED status to start");
    }

    ride.status = "STARTED";
    await ride.save();

    req.io.to(`ride_${rideId}`).emit("rideUpdate", ride);

    res.status(StatusCodes.OK).json({
      message: "OTP verified, ride started",
      ride,
    });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    if (error.statusCode) throw error;
    throw new BadRequestError("Failed to verify OTP");
  }
};

export const rateRide = async (req, res) => {
  const { rideId } = req.params;
  const { rating, feedback } = req.body;

  if (!rideId || !rating) {
    throw new BadRequestError("Ride ID and rating are required");
  }

  try {
    let ride = await Ride.findById(rideId);
    if (!ride) throw new NotFoundError("Ride not found");

    if (ride.customer.toString() !== req.user.id) {
      throw new BadRequestError("Only the customer can rate the ride");
    }

    if (ride.status !== "COMPLETED") {
      throw new BadRequestError("Can only rate completed rides");
    }

    ride.rating = rating;
    if (feedback) ride.feedback = feedback;
    await ride.save();

    res.status(StatusCodes.OK).json({
      message: "Ride rated successfully",
      ride,
    });
  } catch (error) {
    console.error("Error rating ride:", error);
    if (error.statusCode) throw error;
    throw new BadRequestError("Failed to rate ride");
  }
};

export const updateFare = async (req, res) => {
  const { rideId } = req.params;
  const { amount } = req.body;

  if (!rideId || !amount) {
    throw new BadRequestError("Ride ID and amount are required");
  }

  try {
    let ride = await Ride.findById(rideId);
    if (!ride) throw new NotFoundError("Ride not found");

    if (ride.customer.toString() !== req.user.id) {
      throw new BadRequestError("Only the customer can update the fare");
    }

    if (ride.status !== "SEARCHING_FOR_RIDER") {
      throw new BadRequestError("Can only negotiate fare while searching for a rider");
    }

    ride.offeredFare = (ride.offeredFare || ride.fare) + Number(amount);
    await ride.save();

    res.status(StatusCodes.OK).json({
      message: "Fare updated successfully",
      ride,
    });
  } catch (error) {
    console.error("Error updating fare:", error);
    if (error.statusCode) throw error;
    throw new BadRequestError("Failed to update fare");
  }
};
