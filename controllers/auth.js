import User from "../models/User.js";
import { StatusCodes } from "http-status-codes";
import { BadRequestError, UnauthenticatedError } from "../errors/index.js";
import jwt from "jsonwebtoken";

export const auth = async (req, res) => {
  const { phone, role, name, gender } = req.body;
  const profilePicture = req.file ? `/uploads/${req.file.filename}` : "";

  if (!phone) {
    throw new BadRequestError("Phone number is required");
  }

  if (!role || !["customer", "rider"].includes(role)) {
    throw new BadRequestError("Valid role is required (customer or rider)");
  }

  try {
    let user = await User.findOne({ phone });

    if (user) {
      if (user.role !== role) {
        throw new BadRequestError("Phone number and role do not match");
      }

      // Update name, gender, profilePicture if provided
      if (name) user.name = name;
      if (gender) user.gender = gender;
      if (profilePicture) user.profilePicture = profilePicture;
      await user.save();

      const accessToken = user.createAccessToken();
      const refreshToken = user.createRefreshToken();

      return res.status(StatusCodes.OK).json({
        message: "User logged in successfully",
        user,
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }

    user = new User({
      phone,
      role,
      name,
      gender,
      profilePicture,
    });

    await user.save();

    const accessToken = user.createAccessToken();
    const refreshToken = user.createRefreshToken();

    res.status(StatusCodes.CREATED).json({
      message: "User created successfully",
      user,
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const refreshToken = async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    throw new BadRequestError("Refresh token is required");
  }

  try {
    const payload = jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(payload.id);

    if (!user) {
      throw new UnauthenticatedError("Invalid refresh token");
    }

    const newAccessToken = user.createAccessToken();
    const newRefreshToken = user.createRefreshToken();

    res.status(StatusCodes.OK).json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (error) {
    console.error(error);
    throw new UnauthenticatedError("Invalid refresh token");
  }
};
